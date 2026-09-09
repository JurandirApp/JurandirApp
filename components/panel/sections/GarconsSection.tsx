"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import type { Waiter } from "@/lib/data/panel";
import { usePanel } from "../context";

export function GarconsSection() {
  const { waiters, openWaiterEditor } = usePanel();
  const t = useTranslations("panel.garcons");

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 font-display text-base font-semibold text-ink/70">
          {t("countWaiters", { count: waiters.length })}
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => openWaiterEditor(null)}
            className="flex items-center gap-1 rounded-xl bg-coral px-3 py-2 text-sm font-medium text-white"
          >
            <Icon name="add" size={16} />
            {t("newWaiter")}
          </button>
        </div>
      </div>

      {waiters.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-ink/15 p-6 text-center text-sm text-ink/50">
          {t("empty")}
        </div>
      ) : (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))" }}
        >
          {waiters.map((w) => (
            <WaiterRow key={w.id} waiter={w} />
          ))}
        </div>
      )}
    </div>
  );
}

function WaiterRow({ waiter: w }: { waiter: Waiter }) {
  const { openWaiterEditor, askDeleteWaiter } = usePanel();
  const t = useTranslations("panel.garcons");

  return (
    <div className="flex items-center gap-3 rounded-xl border-2 border-ink bg-white p-2.5 shadow-hard">
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#e2e8f0] to-[#cbd5e1] text-ink/50">
        <Icon name="badge" size={22} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-sm font-medium">{w.name}</p>
        <p className="m-0 mt-0.5 truncate text-xs text-ink/50">{w.user}</p>
      </div>

      <button
        type="button"
        onClick={() => openWaiterEditor(w)}
        aria-label={t("edit")}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-dune-50 text-ink/60"
      >
        <Icon name="edit" size={15} />
      </button>
      <button
        type="button"
        onClick={() => askDeleteWaiter(w)}
        aria-label={t("delete")}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#fef2f2] text-[#ef4444]"
      >
        <Icon name="delete" size={15} />
      </button>
    </div>
  );
}
