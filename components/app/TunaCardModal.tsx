"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { money } from "@/lib/panel/helpers";
import type { ClientOrder } from "@/lib/app/helpers";
import type { ChargeStatus } from "@/lib/payments/types";
import {
  cardFormErrors,
  formatCardNumber,
  formatCpf,
  formatExpiry,
  onlyDigits,
  parseExpiry,
  type CardField,
} from "@/lib/app/card-form";
import {
  collectTunaBrowserInfo,
  generateTunaCardToken,
  requestTunaSession,
  runTunaDeviceDataCollection,
} from "@/lib/payments/tuna-browser";
import {
  challengeSizeFromPaRequest,
  generateTuna3dsCode,
  type ChallengeSize,
  type TunaBrowserInfo,
} from "@/lib/payments/tuna-3ds";

/** Teto da cobrança no servidor (Tuna: consulta + Init, até 20s cada). Passou
 *  disso → desfecho INCERTO ("Meus pedidos"), nunca "recusado". */
const CHARGE_TIMEOUT_MS = 90_000;
/** Desafio 3DS: consulta o desfecho a cada 3s, por até 5 min. */
const CHALLENGE_POLL_MS = 3_000;
const CHALLENGE_MAX_MS = 5 * 60_000;

export type TunaChargeResult = {
  ok: boolean;
  status: ChargeStatus;
  order?: ClientOrder;
  detail?: string;
  uncertain?: boolean;
  /** Desafio 3DS do banco (débito): iframe com form POST `JWT` = token. */
  challenge?: { url: string; token: string; paRequest?: string };
};

export type TunaChargeExtras = {
  sessionId: string;
  brand?: string;
  threeDs?: { code: string; referenceId: string; transactionId: string };
  browser?: TunaBrowserInfo;
};

type Challenge = { orderId: string; order: ClientOrder; url: string; token: string; size: ChallengeSize };

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const id = window.setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        window.clearTimeout(id);
        resolve(v);
      },
      (e: unknown) => {
        window.clearTimeout(id);
        reject(e);
      },
    );
  });

/** Cartão (crédito/débito) via Tuna no site: formulário próprio; o navegador
 *  tokeniza direto na Tuna e o servidor só recebe o token. O pedido é criado UMA
 *  vez por abertura do modal — recusa → outro cartão no MESMO pedido. Nunca loga
 *  cartão, token, sessão ou CPF. */
export function TunaCardModal({
  amount,
  method,
  createOrder,
  charge,
  checkStatus,
  onApproved,
  onUncertain,
  onClose,
}: {
  amount: number;
  method: "credito" | "debito";
  /** Cria o pedido (e guarda o id no navegador). `redirected`: o pedido caiu
   *  num checkout hospedado e a página já está saindo. null = falhou. */
  createOrder: () => Promise<{ order: ClientOrder } | { redirected: true } | null>;
  charge: (orderId: string, cardToken: string, cpf: string, tuna: TunaChargeExtras) => Promise<TunaChargeResult>;
  /** Depois do desafio 3DS: desfecho da cobrança (só consulta, nunca cobra). */
  checkStatus: (orderId: string) => Promise<{ status: ChargeStatus; order?: ClientOrder }>;
  onApproved: (order: ClientOrder) => void;
  /** Pendente ou incerto (pode ter cobrado) → "Meus pedidos"; o polling confirma. */
  onUncertain: (order: ClientOrder) => void;
  onClose: () => void;
}) {
  const t = useTranslations("app");
  const tPay = useTranslations("app.pay");
  const [number, setNumber] = useState("");
  const [holder, setHolder] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [cpf, setCpf] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);

  // Single-flight: um envio por vez (duplo toque não cria 2 pedidos nem cobra 2x).
  const lock = useRef(false);
  // Pedido desta tentativa — criado no 1º envio e reaproveitado nas retentativas.
  const orderRef = useRef<ClientOrder | null>(null);
  // Já mandou cobrança neste pedido (sessão negada depois disso = cobrança viva).
  const chargedRef = useRef(false);

  // Callbacks do pai mais recentes (o polling do desafio não reinicia a cada render).
  const cbRef = useRef({ checkStatus, onApproved, onUncertain });
  useEffect(() => {
    cbRef.current = { checkStatus, onApproved, onUncertain };
  });

  const declined = () => {
    // Recusa: fica aqui; outro cartão vai no MESMO pedido.
    setNumber("");
    setCvv("");
    setSubmitted(false);
    setErrorMsg(t("tunaDeclined"));
  };
  const approve = (order: ClientOrder) => {
    setApproved(true);
    // pequena pausa pro cliente ver a confirmação antes de trocar de tela.
    window.setTimeout(() => cbRef.current.onApproved(order), 1300);
  };

  // Desafio 3DS aberto: consulta o desfecho até pago/recusado (ou 5 min →
  // "Meus pedidos", onde o polling segue).
  useEffect(() => {
    if (!challenge) return;
    let stopped = false;
    let inFlight = false;
    const started = Date.now();
    const tick = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      try {
        const r = await cbRef.current.checkStatus(challenge.orderId);
        if (stopped) return;
        if (r.status === "paid") {
          stopped = true;
          setChallenge(null);
          approve(r.order ?? challenge.order);
        } else if (r.status === "failed") {
          stopped = true;
          setChallenge(null);
          declined();
        } else if (Date.now() - started > CHALLENGE_MAX_MS) {
          stopped = true;
          setChallenge(null);
          cbRef.current.onUncertain(challenge.order);
        }
      } catch {
        /* transitório — o próximo tique tenta de novo */
      } finally {
        inFlight = false;
      }
    };
    const id = window.setInterval(() => void tick(), CHALLENGE_POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge]);

  /** Cliente fechou o desafio: consulta uma última vez. Pago → aprovado;
   *  recusado → tenta outro cartão; senão a cobrança pode seguir viva no banco
   *  → "Meus pedidos" (nunca cobra de novo por cima). */
  const cancelChallenge = async () => {
    const c = challenge;
    if (!c || lock.current) return;
    lock.current = true;
    setChallenge(null);
    setBusy(true);
    try {
      const r = await cbRef.current.checkStatus(c.orderId);
      if (r.status === "paid") approve(r.order ?? c.order);
      else if (r.status === "failed") declined();
      else onUncertain(c.order);
    } catch {
      onUncertain(c.order);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const errors = cardFormErrors({ number, holder, expiry, cvv, cpf });
  const showErr = (f: CardField) => submitted && !!errors[f];

  const submit = async () => {
    if (lock.current || approved || challenge) return;
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    const exp = parseExpiry(expiry);
    if (!exp) return;
    lock.current = true;
    setBusy(true);
    setErrorMsg(null);
    try {
      let order = orderRef.current;
      if (!order) {
        let c: Awaited<ReturnType<typeof createOrder>>;
        try {
          c = await createOrder();
        } catch {
          c = null;
        }
        if (!c) {
          setErrorMsg(t("cardError"));
          return;
        }
        if ("redirected" in c) return;
        order = c.order;
        orderRef.current = order;
      }
      const orderId = order.dbId;
      if (!orderId) {
        setErrorMsg(t("cardError"));
        return;
      }

      const s = await requestTunaSession(orderId);
      if (!s.ok) {
        // Depois de uma cobrança, sessão negada = a anterior pode estar viva.
        if (chargedRef.current) {
          onUncertain(order);
          return;
        }
        setErrorMsg(s.reason === "notChargeable" ? t("tunaUnavailable") : t("cardError"));
        return;
      }

      // Débito: 3DS. O código vai no Generate e o MESMO vai na cobrança.
      const authCode = method === "debito" ? generateTuna3dsCode() : undefined;
      const tk = await generateTunaCardToken(
        s.tokenUrl,
        s.sessionId,
        {
          cardNumber: onlyDigits(number),
          cardHolderName: holder.trim(),
          expirationMonth: exp.month,
          expirationYear: exp.year,
          cvv: onlyDigits(cvv),
        },
        undefined,
        authCode ? { authCode } : {},
      );
      if (!tk.ok) {
        // Nada cobrado: os dados do cartão não passaram na Tuna (ou rede).
        setErrorMsg(tk.reason === "invalid" ? t("tunaErrCard") : t("cardError"));
        return;
      }

      // Device data collection (best-effort, ≤ 12s): sem ele o desafio
      // continua funcionando.
      let threeDs: TunaChargeExtras["threeDs"];
      if (authCode && tk.auth) {
        await runTunaDeviceDataCollection(tk.auth);
        threeDs = { code: authCode, referenceId: tk.auth.referenceId, transactionId: tk.auth.transactionId };
      }

      chargedRef.current = true;
      let res: TunaChargeResult;
      try {
        res = await withTimeout(
          charge(orderId, tk.token, onlyDigits(cpf), {
            sessionId: s.sessionId,
            ...(tk.brand ? { brand: tk.brand } : {}),
            ...(threeDs ? { threeDs } : {}),
            browser: collectTunaBrowserInfo(),
          }),
          CHARGE_TIMEOUT_MS,
        );
      } catch {
        onUncertain(order);
        return;
      }
      const fresh = res.order ?? order;
      if (res.status === "paid") {
        approve(fresh);
        return;
      }
      // Banco pediu autenticação: abre o desafio e acompanha o desfecho.
      if (res.status === "pending" && res.challenge && !res.uncertain) {
        setChallenge({
          orderId,
          order: fresh,
          url: res.challenge.url,
          token: res.challenge.token,
          size: challengeSizeFromPaRequest(res.challenge.paRequest),
        });
        return;
      }
      if (res.uncertain || res.status === "pending") {
        onUncertain(fresh);
        return;
      }
      declined();
    } catch {
      // Erro inesperado: se já mandou cobrança, pode ter cobrado → "Meus pedidos".
      if (chargedRef.current && orderRef.current) onUncertain(orderRef.current);
      else setErrorMsg(t("cardError"));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const close = () => {
    if (!busy && !approved && !challenge) onClose();
  };

  const field = (
    id: CardField,
    label: string,
    input: InputHTMLAttributes<HTMLInputElement>,
    errKey: string,
  ) => (
    <label className="block" htmlFor={`tuna-${id}`}>
      <span className="mb-1 block text-xs font-semibold text-ink/60">{label}</span>
      <input
        id={`tuna-${id}`}
        {...input}
        disabled={busy || approved || !!challenge}
        aria-invalid={showErr(id)}
        className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-ink ${
          showErr(id) ? "border-[#e11d48]" : "border-[#e2e8f0]"
        }`}
      />
      {showErr(id) && (
        <span className="mt-1 block text-[11px] font-semibold text-[#e11d48]">{t(errKey)}</span>
      )}
    </label>
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 md:items-center"
      onClick={close}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-[448px] overflow-y-auto rounded-t-[24px] bg-white p-5 md:rounded-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        {challenge && (
          <TunaChallengeFrame
            url={challenge.url}
            token={challenge.token}
            size={challenge.size}
            title={t("tuna3dsTitle")}
            hint={t("tuna3dsHint")}
            cancelLabel={t("tuna3dsCancel")}
            onCancel={() => void cancelChallenge()}
          />
        )}
        {(busy || approved) && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-t-[24px] bg-white/95 md:rounded-[24px]">
            {approved ? (
              <>
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#10b981] text-white">
                  <Icon name="check" size={36} />
                </div>
                <p className="m-0 font-display text-lg font-extrabold">{t("cardApproved")}</p>
              </>
            ) : (
              <>
                <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-ink/15 border-t-coral" />
                <p className="m-0 text-sm font-semibold text-ink/60">{t("cardProcessing")}</p>
              </>
            )}
          </div>
        )}
        <div className="mb-1 flex items-center justify-between">
          <h2 className="m-0 font-display text-lg font-extrabold uppercase tracking-[-0.01em]">
            {t("cardTitle")}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label={t("cardClose")}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-transparent text-ink/50"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <p className="m-0 mb-4 flex items-center gap-2 text-sm text-ink/60">
          <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-xs font-semibold text-ink/70">
            {tPay(method)}
          </span>
          {t("cardAmount", { amount: money(amount) })}
        </p>

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="flex flex-col gap-3"
        >
          {field(
            "number",
            t("tunaNumber"),
            {
              value: number,
              onChange: (e) => setNumber(formatCardNumber(e.target.value)),
              inputMode: "numeric",
              autoComplete: "cc-number",
              placeholder: "0000 0000 0000 0000",
            },
            "tunaErrNumber",
          )}
          {field(
            "holder",
            t("tunaHolder"),
            {
              value: holder,
              onChange: (e) => setHolder(e.target.value.slice(0, 60)),
              autoComplete: "cc-name",
              autoCapitalize: "characters",
            },
            "tunaErrHolder",
          )}
          <div className="grid grid-cols-2 gap-3">
            {field(
              "expiry",
              t("tunaExpiry"),
              {
                value: expiry,
                onChange: (e) => setExpiry(formatExpiry(e.target.value)),
                inputMode: "numeric",
                autoComplete: "cc-exp",
                placeholder: "MM/AA",
              },
              "tunaErrExpiry",
            )}
            {field(
              "cvv",
              t("tunaCvv"),
              {
                value: cvv,
                onChange: (e) => setCvv(onlyDigits(e.target.value).slice(0, 4)),
                inputMode: "numeric",
                autoComplete: "cc-csc",
                type: "password",
                placeholder: "123",
              },
              "tunaErrCvv",
            )}
          </div>
          {field(
            "cpf",
            t("tunaCpf"),
            {
              value: cpf,
              onChange: (e) => setCpf(formatCpf(e.target.value)),
              inputMode: "numeric",
              placeholder: "000.000.000-00",
            },
            "tunaErrCpf",
          )}

          {errorMsg && (
            <p role="alert" className="m-0 flex items-center gap-1.5 text-xs font-semibold text-[#e11d48]">
              <Icon name="error" size={14} />
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || approved}
            className="mt-1 w-full rounded-full border-0 py-3.5 font-display text-base font-extrabold uppercase text-white"
            style={{ background: busy || approved ? "#cbd5e1" : "#FF6B4A" }}
          >
            {t("tunaPay", { amount: money(amount) })}
          </button>
          <p className="m-0 flex items-center justify-center gap-1 text-center text-[11px] text-[#94a3b8]">
            <Icon name="lock" size={12} />
            {t("tunaSecure")}
          </p>
        </form>
      </div>
    </div>
  );
}

/** Desafio 3DS do banco: iframe com form POST (`JWT` = token) pra `url`,
 *  no tamanho pedido pelo `challengeWindowSize` (limitado à tela). O resultado
 *  vai direto do banco pra Tuna; quem decide o desfecho é o polling. */
function TunaChallengeFrame({
  url,
  token,
  size,
  title,
  hint,
  cancelLabel,
  onCancel,
}: {
  url: string;
  token: string;
  size: ChallengeSize;
  title: string;
  hint: string;
  cancelLabel: string;
  onCancel: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [frameName] = useState(() => `tuna-3ds-${Date.now()}`);
  // Um POST por desafio (o StrictMode do dev roda o efeito 2x).
  const postedRef = useRef<string | null>(null);
  useEffect(() => {
    if (postedRef.current === token) return;
    postedRef.current = token;
    formRef.current?.submit();
  }, [url, token]);
  const full = size.width === "100%";
  const px = (v: number | "100%") => (v === "100%" ? "100%" : `${v}px`);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3">
      <div
        className={`flex max-h-full w-full flex-col overflow-hidden rounded-[24px] bg-white ${
          full ? "h-full max-w-full" : "max-w-fit"
        }`}
      >
        <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
          <div className="min-w-0">
            <h2 className="m-0 font-display text-base font-extrabold uppercase tracking-[-0.01em]">{title}</h2>
            <p className="m-0 text-xs text-ink/60">{hint}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={cancelLabel}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-transparent text-ink/50"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <iframe
          name={frameName}
          title={title}
          className="block max-w-full border-0"
          style={{
            width: px(size.width),
            height: full ? "100%" : px(size.height),
            maxHeight: "calc(100vh - 140px)",
            flex: full ? "1 1 auto" : undefined,
          }}
        />
        <form ref={formRef} method="POST" action={url} target={frameName} className="hidden">
          <input type="hidden" name="JWT" value={token} readOnly />
        </form>
        <button
          type="button"
          onClick={onCancel}
          className="mx-4 my-3 rounded-full border border-[#e2e8f0] bg-white py-2.5 text-sm font-semibold text-ink/70"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
