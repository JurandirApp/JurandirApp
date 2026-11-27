"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { money } from "@/lib/panel/helpers";
import type { Share } from "@/lib/app/helpers";

/** Conta dividida: o Pix de CADA pessoa (QR + copia-e-cola) ou "Pago" quando a
 *  parte já caiu. O pedido só vai pra cozinha quando todas forem pagas. */
export function SplitSharesPix({ splits }: { splits: Share[] }) {
  const t = useTranslations("app");
  const [copied, setCopied] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(() => {
    const i = splits.findIndex((s) => !s.paid);
    return i >= 0 ? i : null;
  });

  const copy = (idx: number, payload?: string) => {
    if (!payload) return;
    try {
      navigator.clipboard?.writeText(payload);
    } catch {
      /* clipboard indisponível — mostra o feedback mesmo assim */
    }
    setCopied(idx);
    window.setTimeout(() => setCopied((c) => (c === idx ? null : c)), 2000);
  };

  return (
    <div className="flex flex-col gap-2 text-left">
      {splits.map((s, idx) => (
        <div key={idx} className="rounded-xl border border-[#e2e8f0] bg-white p-2.5">
          <button
            type="button"
            onClick={() => setOpen((o) => (o === idx ? null : idx))}
            disabled={Boolean(s.paid)}
            className="flex w-full items-center justify-between bg-transparent p-0 text-left"
          >
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f1f5f9] text-xs font-bold">
                {idx + 1}
              </span>
              {t("friend", { n: idx + 1 })}
            </span>
            {s.paid ? (
              <span className="flex items-center gap-1 text-xs font-medium text-[#059669]">
                <Icon name="check" size={13} />
                {t("sharePaid")}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs font-semibold text-[#d97706]">
                {money(s.amount)}
                <Icon name={open === idx ? "expand_less" : "expand_more"} size={15} />
              </span>
            )}
          </button>
          {!s.paid && open === idx && (
            <div className="mt-2 text-center">
              {s.pixQrImage && (
                // QR é um data-URI base64; next/image não otimiza data-URI.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/png;base64,${s.pixQrImage}`}
                  alt="QR Pix"
                  className="mx-auto h-40 w-40 rounded-lg"
                />
              )}
              {s.pixPayload ? (
                <button
                  type="button"
                  onClick={() => copy(idx, s.pixPayload)}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold transition-colors"
                  style={{
                    background: copied === idx ? "#10b981" : "#141821",
                    color: copied === idx ? "#fff" : "#EDD8A3",
                  }}
                >
                  <Icon name={copied === idx ? "check" : "content_copy"} size={15} />
                  {copied === idx ? t("pixCopied") : t("pixCopy")}
                </button>
              ) : (
                <p className="m-0 text-xs text-[#94a3b8]">{t("sharePixUnavailable")}</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
