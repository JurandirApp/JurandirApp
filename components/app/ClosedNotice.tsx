"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { useApp } from "./context";

/** Aviso de bar FECHADO agora (pelo horário semanal). No cardápio só informa;
 *  no checkout explica por que o pedido está bloqueado. */
export function ClosedNotice({ variant }: { variant: "menu" | "checkout" }) {
  const { est } = useApp();
  const t = useTranslations("app");
  if (est.openNow) return null;
  return (
    <div
      role="alert"
      className="flex gap-2 rounded-2xl border border-[#fecaca] bg-[#fef2f2] px-3.5 py-3 text-[#991b1b]"
    >
      <Icon name="storefront" size={18} className="mt-px flex-shrink-0" />
      <div className="text-sm">
        <p className="m-0 font-bold">
          {t("closedTitle")}
          {est.nextOpenLabel ? ` · ${est.nextOpenLabel}` : ""}
        </p>
        <p className="m-0 mt-0.5 text-xs text-[#991b1b]/80">
          {variant === "menu" ? t("closedMenuSub") : t("closedCheckoutSub")}
        </p>
      </div>
    </div>
  );
}
