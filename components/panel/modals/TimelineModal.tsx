"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { fmtTime, padId } from "@/lib/panel/helpers";
import type { OrderTimelineEvent } from "../context";

/** Rastreio de um pedido (Módulo do Garçom): lista os eventos (pago, em
 *  produção, pronto, retirado, entregue) em ordem, com hora e garçom. */
export function TimelineModal({
  orderId,
  events,
  onClose,
}: {
  orderId: number;
  events: OrderTimelineEvent[];
  onClose: () => void;
}) {
  const t = useTranslations("panel.timeline");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4">
      <div className="box-border max-h-[88vh] w-full max-w-[440px] overflow-y-auto rounded-2xl bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="m-0 font-display text-lg font-bold">
            {t("title", { id: padId(orderId) })}
          </h2>
          <button
            type="button"
            aria-label={t("close")}
            onClick={onClose}
            className="bg-transparent p-0 text-ink/40"
          >
            <Icon name="close" size={22} />
          </button>
        </div>

        {events.length === 0 ? (
          <p className="m-0 py-6 text-center text-sm text-ink/50">{t("empty")}</p>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {events.map((ev) => (
              <li key={ev.id} className="flex items-baseline gap-3 text-sm">
                <span className="w-11 flex-none font-mono text-xs font-semibold text-ink/45">
                  {fmtTime(ev.at)}
                </span>
                <span className="text-ink/80">
                  {t(`types.${ev.type}`)}
                  {typeof ev.qty === "number" ? ` ${ev.qty}×` : ""}
                  {ev.waiter && ` ${t("byWaiter", { name: ev.waiter.name })}`}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
