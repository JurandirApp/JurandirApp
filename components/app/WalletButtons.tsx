"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { WalletWebConfig } from "@/lib/payments/wallet-web";
import type { WalletAttempt } from "@/lib/app/wallet-outcome";
import {
  applePayRequest,
  canUseApplePay,
  googlePaymentDataRequest,
  prepareGooglePay,
  type ApplePaySessionInstance,
  type GooglePaymentsClient,
  type WalletType,
} from "@/lib/payments/wallet-sdk";

/** Recebe o snapshot do clique + o token da carteira; `complete(ok)` encerra a
 *  tentativa (na Apple fecha a folha com sucesso/falha). */
export type WalletTokenHandler = (
  attempt: WalletAttempt,
  walletType: WalletType,
  token: string,
  complete: (ok: boolean) => void,
) => void;

// Botão nativo do Apple Pay (Safari) — propriedades não-padrão, por isso CSS cru
// (fora do pipeline do Tailwind/PostCSS).
const APPLE_BTN_CSS =
  ".jur-apple-pay-btn{display:block;width:100%;height:48px;border:0;padding:0;cursor:pointer;" +
  "-webkit-appearance:-apple-pay-button;-apple-pay-button-type:pay;-apple-pay-button-style:black}";

const noopSubscribe = () => () => {};

/** Apple Pay / Google Pay no checkout (pagamento inteiro). Só renderiza o que o
 *  bar tem configurado E o aparelho suporta; nada disponível → não renderiza. */
export function WalletButtons({
  config,
  disabled = false,
  prepare,
  onToken,
  onError,
}: {
  config: WalletWebConfig;
  disabled?: boolean;
  /** Snapshot (pedido + valor) tirado no clique; o valor vai pra folha. null → não inicia. */
  prepare: () => WalletAttempt | null;
  onToken: WalletTokenHandler;
  /** Falha antes de existir pedido (validação da Apple, folha do Google). */
  onError: () => void;
}) {
  const t = useTranslations("app");
  const locale = useLocale();
  const ap = config.applePay;
  const gp = config.googlePay;

  // Apple: API nativa e síncrona (sem SDK), só no domínio verificado. Snapshot no servidor = false.
  const appleAvailable = useSyncExternalStore(
    noopSubscribe,
    () => !!ap && canUseApplePay(ap),
    () => false,
  );
  const showApple = !!ap && appleAvailable;

  // Google: pay.js + isReadyToPay já na montagem → o clique não espera rede.
  const [gClient, setGClient] = useState<GooglePaymentsClient | null>(null);
  useEffect(() => {
    if (!gp) return;
    let alive = true;
    prepareGooglePay(gp).then((c) => {
      if (alive) setGClient(c);
    });
    return () => {
      alive = false;
    };
  }, [gp]);
  const showGoogle = !!gp && !!gClient;

  // Single-flight: uma tentativa de carteira por vez (os dois botões travam).
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const begin = useCallback(() => {
    busyRef.current = true;
    setBusy(true);
  }, []);
  const release = useCallback(() => {
    busyRef.current = false;
    setBusy(false);
  }, []);

  // "Latest ref": o clique do Google é registrado uma vez (createButton) e lê
  // sempre os valores atuais. Atualizado num efeito (não escreve ref no render).
  const latest = useRef({ gp, disabled, prepare, onToken, onError });
  useEffect(() => {
    latest.current = { gp, disabled, prepare, onToken, onError };
  });

  const gBtnRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = gBtnRef.current;
    if (!gClient || !el) return;
    const onClick = () => {
      const cur = latest.current;
      if (!cur.gp || cur.disabled || busyRef.current) return;
      const attempt = cur.prepare();
      if (!attempt) {
        cur.onError();
        return;
      }
      begin();
      // loadPaymentData precisa sair direto do gesto do usuário (sem await antes).
      gClient
        .loadPaymentData(googlePaymentDataRequest(cur.gp, attempt.amount))
        .then((data) => {
          const token = data?.paymentMethodData?.tokenizationData?.token;
          if (!token) {
            release();
            latest.current.onError();
            return;
          }
          latest.current.onToken(attempt, "google_pay", token, () => release());
        })
        .catch((err: unknown) => {
          release();
          // Cliente fechou a folha → silêncio.
          if ((err as { statusCode?: string } | null)?.statusCode === "CANCELED") return;
          latest.current.onError();
        });
    };
    const btn = gClient.createButton({
      buttonType: "pay",
      buttonColor: "black",
      buttonSizeMode: "fill",
      buttonLocale: locale === "en" ? "en" : "pt",
      onClick,
    });
    el.replaceChildren(btn);
    return () => {
      el.replaceChildren();
    };
  }, [gClient, begin, release, locale]);

  const onAppleClick = () => {
    const APS = window.ApplePaySession;
    if (!ap || !APS || disabled || busyRef.current) return;
    const attempt = prepare();
    if (!attempt) {
      onError();
      return;
    }
    // Sessão criada e begin() chamados no mesmo gesto; pedido só depois do token.
    let session: ApplePaySessionInstance;
    try {
      session = new APS(3, applePayRequest(ap, attempt.amount));
    } catch {
      onError();
      return;
    }
    begin();
    let charging = false;
    let ended = false;

    session.onvalidatemerchant = (event) => {
      fetch("/api/public/applepay/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validationURL: event.validationURL }),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("merchant validation"))))
        .then((merchantSession: unknown) => session.completeMerchantValidation(merchantSession))
        .catch(() => {
          if (ended) return; // cliente já cancelou
          ended = true;
          try {
            session.abort();
          } catch {
            /* sessão já encerrada */
          }
          release();
          latest.current.onError();
        });
    };

    session.onpaymentauthorized = (event) => {
      charging = true;
      const token = JSON.stringify(event.payment.token);
      latest.current.onToken(attempt, "apple_pay", token, (ok) => {
        try {
          session.completePayment({ status: ok ? APS.STATUS_SUCCESS : APS.STATUS_FAILURE });
        } catch {
          /* sessão expirou (≈30 s) — o pedido segue no polling */
        }
        release();
      });
    };

    session.oncancel = () => {
      ended = true;
      // Durante a cobrança a trava continua até o resultado (evita 2ª cobrança).
      if (!charging) release();
    };

    try {
      session.begin();
    } catch {
      release();
      onError();
    }
  };

  if (!showApple && !showGoogle) return null;
  const inactive = disabled || busy;

  return (
    <div>
      {showApple && <style>{APPLE_BTN_CSS}</style>}
      <div
        className={`flex flex-col gap-2 ${inactive ? "pointer-events-none opacity-60" : ""}`}
        aria-busy={busy}
      >
        {showApple && (
          <button
            type="button"
            lang={locale === "en" ? "en" : "pt-BR"}
            aria-label="Apple Pay"
            className="jur-apple-pay-btn"
            disabled={inactive}
            onClick={onAppleClick}
          />
        )}
        {showGoogle && <div ref={gBtnRef} className="h-12 w-full" />}
      </div>
      <p className="m-0 mt-1.5 text-center text-[11px] text-[#94a3b8]">{t("walletCreditOnly")}</p>
      <div className="my-3 flex items-center gap-2 text-[11px] text-[#94a3b8]">
        <span className="h-px flex-1 bg-[#e2e8f0]" />
        <span>{t("walletOr")}</span>
        <span className="h-px flex-1 bg-[#e2e8f0]" />
      </div>
    </div>
  );
}
