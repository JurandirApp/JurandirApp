"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { itemCount, money, orderTotal } from "@/lib/panel/helpers";
import type { Order } from "@/lib/data/panel";
import { usePanel } from "./context";

export function RealtimeNotif({
  notif,
  onDismiss,
}: {
  notif: Order | null;
  onDismiss: () => void;
}) {
  const { setTab, setOrderFilter } = usePanel();
  const t = useTranslations("panel.realtime");
  const tm = useTranslations("panel.meta");
  if (!notif) return null;

  const go = () => {
    setTab("pedidos");
    setOrderFilter("todos");
    onDismiss();
  };

  return (
    <div className="fixed right-6 top-16 z-[70] w-80 max-w-[calc(100vw-32px)] animate-notif-in rounded-2xl bg-ink px-4 py-3.5 text-sand shadow-[0_18px_40px_-12px_rgba(12,67,71,.5)]">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 animate-pulse-soft items-center justify-center rounded-[10px] bg-coral text-white">
          <Icon name="notifications_active" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="m-0 font-display text-sm font-extrabold text-white">
              {t("title")}
            </p>
            <button
              type="button"
              aria-label={t("close")}
              onClick={onDismiss}
              className="bg-transparent p-0 text-sand/50"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
          <p className="mt-0.5 text-xs text-sand/75">
            {notif.loc} · {tm("sub", { count: itemCount(notif) })} ·{" "}
            {money(orderTotal(notif))}
          </p>
          <button
            type="button"
            onClick={go}
            className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-sand p-2 text-[13px] font-bold text-ink"
          >
            {t("seeInQueue")}
            <Icon name="arrow_forward" size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
