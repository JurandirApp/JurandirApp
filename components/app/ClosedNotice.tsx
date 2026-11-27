"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { useApp } from "./context";

/** Aviso de bar FECHADO agora (pelo horário semanal). Forte de propósito: o
 *  cardápio continua visível (e dá pra pedir, com confirmação), então o aviso
 *  não pode deixar dúvida. */
export function ClosedNotice({ variant }: { variant: "menu" | "checkout" }) {
  const { est } = useApp();
  const t = useTranslations("app");
  if (est.openNow) return null;
  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-2xl bg-[#b91c1c] px-4 py-3.5 text-white"
      style={{ boxShadow: "0 8px 20px -10px rgba(185,28,28,.7)" }}
    >
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/15">
        <Icon name="door_front" size={22} />
      </span>
      <div className="min-w-0">
        <p className="m-0 font-display text-[15px] font-extrabold uppercase tracking-[0.02em]">
          {t("closedTitle")}
        </p>
        {est.nextOpenLabel && (
          <p className="m-0 mt-0.5 text-sm font-semibold text-white/95">{est.nextOpenLabel}</p>
        )}
        <p className="m-0 mt-1 text-xs text-white/85">
          {variant === "menu" ? t("closedMenuSub") : t("closedCheckoutSub")}
        </p>
      </div>
    </div>
  );
}

/** Confirmação antes de pagar com o bar fechado. */
export function ClosedConfirmModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { est } = useApp();
  const t = useTranslations("app");
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 md:items-center md:p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="closed-confirm-title"
        className="box-border w-full max-w-[420px] rounded-t-[24px] bg-white p-5 md:rounded-[24px] md:shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#fee2e2] text-[#b91c1c]">
          <Icon name="door_front" size={26} />
        </div>
        <h2 id="closed-confirm-title" className="m-0 font-display text-xl font-extrabold">
          {t("closedConfirmTitle")}
        </h2>
        <p className="m-0 mt-2 text-sm text-ink/70">
          {t("closedConfirmBody")}
          {est.nextOpenLabel ? ` (${est.nextOpenLabel})` : ""}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="w-full rounded-xl bg-[#FF6B4A] py-3 text-[15px] font-semibold text-white"
          >
            {t("closedConfirmYes")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-xl bg-[#e2e8f0] py-3 text-[15px] font-semibold text-ink"
          >
            {t("closedConfirmNo")}
          </button>
        </div>
      </div>
    </div>
  );
}
