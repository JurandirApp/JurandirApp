"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { useApp } from "./context";

/** Escolha do guarda-sol/mesa quando o cliente chega pela landing (sem QR).
 *  Lista os spots cadastrados pelo estabelecimento + um fallback para digitar o
 *  número (QR danificado ou lugar não cadastrado). */
export function SpotModal({ onClose }: { onClose: () => void }) {
  const { spots, beach, loc, setLoc } = useApp();
  const t = useTranslations("app");
  const prefix = t(beach ? "spotPrefixBeach" : "spotPrefixTable");
  const [manual, setManual] = useState("");

  const pick = (label: string) => {
    setLoc(label);
    onClose();
  };
  const confirmManual = () => {
    const n = manual.replace(/\D/g, "").slice(0, 4);
    if (n) pick(`${prefix} ${n}`);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 md:items-center md:p-4"
      onClick={onClose}
    >
      <div
        className="box-border max-h-[85vh] w-full max-w-[448px] overflow-y-auto rounded-t-[24px] bg-white p-5 md:max-h-[80vh] md:rounded-[24px] md:shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="m-0 text-lg font-bold">{t("chooseSpotTitle")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="bg-transparent p-0 text-ink/40"
          >
            <Icon name="close" size={22} />
          </button>
        </div>
        <p className="m-0 mb-4 text-[13px] text-ink/50">
          {beach ? t("chooseSpotBeach") : t("chooseSpotTable")}
        </p>

        {spots.length > 0 && (
          <div className="flex flex-col gap-2">
            {spots.map((label) => {
              const sel = loc === label;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => pick(label)}
                  className="flex items-center gap-2.5 rounded-2xl border-2 px-4 py-3 text-left text-[15px] font-semibold"
                  style={{
                    borderColor: sel ? "#FF6B4A" : "rgba(20,24,33,.1)",
                    background: sel ? "#fff5f2" : "#fff",
                  }}
                >
                  <Icon name="location_on" size={18} style={{ color: "#FF6B4A" }} />
                  <span className="flex-1">{label}</span>
                  {sel && (
                    <Icon name="check_circle" size={18} className="text-coral-emph" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Fallback: digitar o número (QR danificado / lugar não cadastrado) */}
        <div className="mt-4 border-t border-ink/[0.08] pt-4">
          <p className="m-0 mb-2 text-[13px] font-semibold text-ink/60">
            {t("spotNotListed")}
          </p>
          <div className="flex items-center gap-2">
            <span className="flex flex-1 items-center gap-1.5 rounded-xl border-2 border-ink/[0.12] px-3 py-2.5">
              <span className="shrink-0 whitespace-nowrap text-[13px] font-semibold text-ink/60">
                {prefix}
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={manual}
                onChange={(e) =>
                  setManual(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                onKeyDown={(e) => e.key === "Enter" && confirmManual()}
                placeholder="14"
                className="w-full min-w-0 bg-transparent font-display text-[18px] font-extrabold outline-none"
              />
            </span>
            <button
              type="button"
              onClick={confirmManual}
              disabled={!manual}
              className="shrink-0 rounded-xl bg-ink px-4 py-3 text-sm font-bold text-sand disabled:opacity-40"
            >
              {t("spotConfirm")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
