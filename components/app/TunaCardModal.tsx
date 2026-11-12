"use client";

import { useRef, useState, type InputHTMLAttributes } from "react";
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
import { generateTunaCardToken, requestTunaSession } from "@/lib/payments/tuna-browser";

/** Teto da cobrança no servidor (Tuna: consulta + Init, até 20s cada). Passou
 *  disso → desfecho INCERTO ("Meus pedidos"), nunca "recusado". */
const CHARGE_TIMEOUT_MS = 90_000;

export type TunaChargeResult = {
  ok: boolean;
  status: ChargeStatus;
  order?: ClientOrder;
  detail?: string;
  uncertain?: boolean;
};

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
  onApproved,
  onUncertain,
  onClose,
}: {
  amount: number;
  method: "credito" | "debito";
  /** Cria o pedido (e guarda o id no navegador). `redirected`: o pedido caiu
   *  num checkout hospedado e a página já está saindo. null = falhou. */
  createOrder: () => Promise<{ order: ClientOrder } | { redirected: true } | null>;
  charge: (
    orderId: string,
    cardToken: string,
    cpf: string,
    tuna: { sessionId: string; brand?: string },
  ) => Promise<TunaChargeResult>;
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

  // Single-flight: um envio por vez (duplo toque não cria 2 pedidos nem cobra 2x).
  const lock = useRef(false);
  // Pedido desta tentativa — criado no 1º envio e reaproveitado nas retentativas.
  const orderRef = useRef<ClientOrder | null>(null);
  // Já mandou cobrança neste pedido (sessão negada depois disso = cobrança viva).
  const chargedRef = useRef(false);

  const errors = cardFormErrors({ number, holder, expiry, cvv, cpf });
  const showErr = (f: CardField) => submitted && !!errors[f];

  const submit = async () => {
    if (lock.current || approved) return;
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

      const tk = await generateTunaCardToken(s.tokenUrl, s.sessionId, {
        cardNumber: onlyDigits(number),
        cardHolderName: holder.trim(),
        expirationMonth: exp.month,
        expirationYear: exp.year,
        cvv: onlyDigits(cvv),
      });
      if (!tk.ok) {
        // Nada cobrado: os dados do cartão não passaram na Tuna (ou rede).
        setErrorMsg(tk.reason === "invalid" ? t("tunaErrCard") : t("cardError"));
        return;
      }

      chargedRef.current = true;
      let res: TunaChargeResult;
      try {
        res = await withTimeout(
          charge(orderId, tk.token, onlyDigits(cpf), {
            sessionId: s.sessionId,
            ...(tk.brand ? { brand: tk.brand } : {}),
          }),
          CHARGE_TIMEOUT_MS,
        );
      } catch {
        onUncertain(order);
        return;
      }
      const fresh = res.order ?? order;
      if (res.status === "paid") {
        setApproved(true);
        // pequena pausa pro cliente ver a confirmação antes de trocar de tela.
        window.setTimeout(() => onApproved(fresh), 1300);
        return;
      }
      if (res.uncertain || res.status === "pending") {
        onUncertain(fresh);
        return;
      }
      // Recusa: fica aqui; outro cartão vai no MESMO pedido.
      setNumber("");
      setCvv("");
      setSubmitted(false);
      setErrorMsg(t("tunaDeclined"));
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
    if (!busy && !approved) onClose();
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
        disabled={busy || approved}
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
