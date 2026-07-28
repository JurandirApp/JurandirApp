"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { itemCount, money, orderTotal, padId } from "@/lib/panel/helpers";
import { usePanel } from "./context";

const SEEN_KEY = "jur_panel_seen_notifs";

export function NotificationBell() {
  const { orders, setTab } = usePanel();
  const t = useTranslations("panel.bell");
  const ts = useTranslations("panel.status");
  const tm = useTranslations("panel.meta");
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(new Set());

  // Carrega os ids já "vistos" (persistidos) — recarregar a página não deve
  // re-sinalizar tudo como novo. via microtask p/ não cair na regra de
  // setState-síncrono-no-efeito nem quebrar a hidratação (SSR começa vazio).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      if (raw) {
        const ids = JSON.parse(raw) as string[];
        queueMicrotask(() => setSeen(new Set(ids)));
      }
    } catch {
      /* localStorage indisponível */
    }
  }, []);

  // Pix expirado não é "ativo": não precisa de ação, então sai das notificações.
  const openOrders = orders.filter((o) => o.st !== "entregue" && !o.expired);
  const activeCount = openOrders.length;
  // Bolinha vermelha = só os pedidos AINDA NÃO VISTOS (novos).
  const unseenCount = openOrders.filter((o) => o.dbId && !seen.has(o.dbId)).length;

  const markAllSeen = () => {
    // Guarda só os ativos atuais (poda ids antigos que já saíram da lista).
    const ids = openOrders.map((o) => o.dbId).filter((x): x is string => Boolean(x));
    const next = new Set(ids);
    setSeen(next);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...next]));
    } catch {
      /* localStorage indisponível */
    }
  };

  const goOrders = () => {
    setTab("pedidos");
    setOpen(false);
  };

  return (
    <div className="fixed right-6 top-[18px] z-50">
      <button
        type="button"
        aria-label={t("aria")}
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-12 w-12 items-center justify-center rounded-full bg-transparent text-sand"
      >
        <Icon name="notifications" size={28} />
        {unseenCount > 0 && (
          <span className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-ink bg-coral px-[5px] text-[11px] font-extrabold text-white">
            {unseenCount > 9 ? "9+" : unseenCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Fechar"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[-1] cursor-default"
          />
          <div className="absolute right-0 top-[calc(100%+8px)] w-[340px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl bg-white shadow-[0_18px_40px_-12px_rgba(12,67,71,.45)]">
            <div className="flex items-center justify-between gap-3 bg-ink px-4 py-3.5 text-sand">
              <span className="font-display text-[15px] font-extrabold">
                {t("title")}
              </span>
              <div className="flex items-center gap-3">
                {unseenCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllSeen}
                    className="flex items-center gap-1 text-[11px] font-bold text-sun hover:underline"
                  >
                    <Icon name="done_all" size={14} />
                    {t("markSeen")}
                  </button>
                )}
                <span className="text-[11px] font-semibold text-sand/60">
                  {t("openCount", { count: activeCount })}
                </span>
              </div>
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {activeCount === 0 && (
                <p className="m-0 px-4 py-8 text-center text-sm text-ink/40">
                  {t("empty")}
                </p>
              )}
              {openOrders.map((o) => {
                const awaiting = o.st === "aguardando";
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={goOrders}
                    className="box-border flex w-full items-start gap-2.5 border-b border-ink/[0.06] bg-transparent px-4 py-3 text-left"
                  >
                    <span
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
                      style={{
                        background: awaiting ? "#fee2e2" : "#fef3c7",
                        color: awaiting ? "#e11d48" : "#b45309",
                      }}
                    >
                      <Icon
                        name={awaiting ? "hourglass_top" : "restaurant"}
                        size={17}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <b className="text-[13px]">{t("order", { id: padId(o.id) })}</b>
                        <span
                          className="rounded-full px-[7px] py-0.5 text-[11px] font-semibold"
                          style={{
                            background: awaiting ? "#ffe4e6" : "#fef3c7",
                            color: awaiting ? "#be123c" : "#b45309",
                          }}
                        >
                          {ts(awaiting ? "aguardando" : "producao")}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-ink/55">
                        {o.loc} · {tm("sub", { count: itemCount(o) })} ·{" "}
                        {money(orderTotal(o))}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={goOrders}
              className="flex w-full items-center justify-center gap-1.5 bg-sand/40 p-3 text-[13px] font-bold text-ink"
            >
              {t("seeAll")}
              <Icon name="arrow_forward" size={15} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
