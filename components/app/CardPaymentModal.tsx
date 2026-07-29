"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { money } from "@/lib/panel/helpers";
import { loadMpSdk } from "@/lib/payments/mp-sdk";
import type { CardBrickData } from "@/lib/payments/types";
import type { ClientOrder } from "@/lib/app/helpers";

export type CardPayResult = {
  ok: boolean;
  status: "paid" | "pending" | "failed";
  order?: ClientOrder;
  detail?: string;
};

/** Checkout transparente: renderiza o Payment Brick do MP (cartão + carteira /
 *  Google Pay / Apple Pay, quando disponíveis) dentro do app — sem redirect. */
export function CardPaymentModal({
  amount,
  payerEmail,
  onPay,
  onApproved,
  onClose,
}: {
  amount: number;
  payerEmail?: string;
  onPay: (brick: CardBrickData) => Promise<CardPayResult>;
  onApproved: (order: ClientOrder) => void;
  onClose: () => void;
}) {
  const t = useTranslations("app");
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Refs mantêm o efeito do Brick estável (não recria a cada render). Atualizados
  // num efeito (padrão "latest ref") — não pode escrever ref durante o render.
  const onPayRef = useRef(onPay);
  const onApprovedRef = useRef(onApproved);
  const tRef = useRef(t);
  useEffect(() => {
    onPayRef.current = onPay;
    onApprovedRef.current = onApproved;
    tRef.current = t;
  });

  useEffect(() => {
    let cancelled = false;
    let controller: { unmount: () => void } | null = null;
    const pubKey = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY;
    if (!pubKey) {
      // via microtask p/ não cair na regra de setState-síncrono-no-efeito.
      queueMicrotask(() => {
        if (cancelled) return;
        setPhase("error");
        setErrorMsg(tRef.current("cardNotConfigured"));
      });
      return;
    }
    loadMpSdk()
      .then((MP) => {
        if (cancelled) return null;
        const mp = new MP(pubKey, { locale: "pt-BR" });
        return mp.bricks().create("payment", "mp-card-brick", {
          initialization: {
            amount,
            ...(payerEmail ? { payer: { email: payerEmail } } : {}),
          },
          customization: {
            paymentMethods: {
              creditCard: "all",
              debitCard: "all",
              maxInstallments: 1,
            },
          },
          callbacks: {
            onReady: () => {
              if (!cancelled) setPhase("ready");
            },
            onSubmit: (data: { formData?: CardBrickData }) =>
              new Promise<void>((resolve, reject) => {
                const fd = data?.formData;
                if (!fd) {
                  reject();
                  return;
                }
                setErrorMsg(null);
                onPayRef
                  .current(fd)
                  .then((res) => {
                    if (res.ok && res.status === "paid" && res.order) {
                      onApprovedRef.current(res.order);
                      resolve();
                    } else {
                      const base =
                        res.status === "pending"
                          ? tRef.current("cardPending")
                          : tRef.current("cardRejected");
                      // Mostra o status_detail do MP (ex.: cc_rejected_high_risk)
                      // pra diagnosticar o motivo real da recusa.
                      setErrorMsg(res.detail ? `${base} (${res.detail})` : base);
                      reject();
                    }
                  })
                  .catch(() => {
                    setErrorMsg(tRef.current("cardError"));
                    reject();
                  });
              }),
            onError: (error: unknown) => {
              if (cancelled) return;
              // Surfacia o motivo do erro de inicialização/render do Brick.
              let d = "";
              if (error && typeof error === "object") {
                const eo = error as { message?: string; cause?: string; type?: string };
                d = eo.message || eo.cause || eo.type || "";
              }
              setErrorMsg(tRef.current("cardError") + (d ? ` (${d})` : ""));
            },
          },
        });
      })
      .then((c) => {
        if (cancelled) c?.unmount();
        else controller = c;
      })
      .catch(() => {
        if (!cancelled) {
          setPhase("error");
          setErrorMsg(tRef.current("cardError"));
        }
      });

    return () => {
      cancelled = true;
      try {
        controller?.unmount();
      } catch {
        /* já desmontado */
      }
    };
  }, [amount, payerEmail]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 md:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-[460px] overflow-y-auto rounded-t-[24px] bg-white p-5 md:rounded-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="m-0 font-display text-lg font-extrabold uppercase tracking-[-0.01em]">
            {t("cardTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("cardClose")}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-transparent text-ink/50"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <p className="m-0 mb-3 text-sm text-ink/60">
          {t("cardAmount", { amount: money(amount) })}
        </p>

        {phase === "loading" && (
          <p className="py-8 text-center text-sm text-ink/50">{t("cardLoading")}</p>
        )}
        {errorMsg && (
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#e11d48]">
            <Icon name="error" size={14} />
            {errorMsg}
          </p>
        )}
        <div id="mp-card-brick" />
      </div>
    </div>
  );
}
