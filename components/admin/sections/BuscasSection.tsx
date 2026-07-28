"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { useAdmin } from "../context";

const FIELDS: [string, string, string, string][] = [
  ["city", "byCity", "location_on", "#FF6B4A"],
  ["neighborhood", "byNeighborhood", "map", "#0C4347"],
  ["cuisine", "byCuisine", "restaurant", "#f59e0b"],
  ["tipo", "byType", "storefront", "#10b981"],
];

const PILLS: [number, string][] = [
  [7, "d7"],
  [30, "d30"],
  [0, "all"],
];

export function BuscasSection() {
  const { events } = useAdmin();
  const t = useTranslations("admin.buscas");
  const tt = useTranslations("admin.tipo");
  const [buscaPeriod, setBuscaPeriod] = useState(30);

  const { total, cards } = useMemo(() => {
    const evF = events.filter((ev) => buscaPeriod === 0 || ev.day < buscaPeriod);
    const cards = FIELDS.map(([field, labelKey, icon, bar]) => {
      const counts: Record<string, number> = {};
      evF
        .filter((ev) => ev.field === field)
        .forEach((ev) => {
          counts[ev.value] = (counts[ev.value] || 0) + 1;
        });
      const arr = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const cardTotal = arr.reduce((s, [, c]) => s + c, 0) || 1;
      const max = arr[0]?.[1] ?? 1;
      return {
        key: field,
        label: t(labelKey),
        icon,
        bar,
        totalLabel: t("searches", { count: cardTotal }),
        rows: arr.slice(0, 8).map(([value, count], i) => ({
          key: value,
          i: String(i + 1),
          value: field === "tipo" ? tt(value) : value,
          count: String(count),
          pct: `${Math.round((count / cardTotal) * 100)}%`,
          w: Math.round((count / max) * 100),
        })),
      };
    });
    return { total: evF.length, cards };
  }, [events, buscaPeriod, t, tt]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 font-display text-xl font-extrabold">
            {t("title")}
          </h2>
          <p className="m-0 mt-0.5 text-sm text-ink/50">
            {t.rich("subtitle", { total, b: (c) => <b>{c}</b> })}
          </p>
        </div>
        <div className="flex gap-1 rounded-xl border-2 border-ink bg-white p-1 shadow-hard">
          {PILLS.map(([days, key]) => (
            <button
              key={days}
              type="button"
              onClick={() => setBuscaPeriod(days)}
              className="rounded-lg px-3 py-1.5 text-sm font-bold"
              style={{
                background: buscaPeriod === days ? "#141821" : "transparent",
                color: buscaPeriod === days ? "#EDD8A3" : "rgba(20,24,33,.5)",
              }}
            >
              {t(key)}
            </button>
          ))}
        </div>
      </div>

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fit,minmax(380px,1fr))" }}
      >
        {cards.map((c) => (
          <div
            key={c.key}
            className="rounded-2xl border-2 border-ink bg-white p-4 shadow-hard"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="m-0 flex items-center gap-2 font-display text-[15px] font-bold">
                <Icon name={c.icon} size={16} className="text-coral" />
                {c.label}
              </h3>
              <span className="text-xs font-semibold text-ink/40">
                {c.totalLabel}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {c.rows.map((r) => (
                <div key={r.key}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-4 flex-shrink-0 text-right text-xs font-bold text-ink/30">
                        {r.i}
                      </span>
                      <span className="truncate font-medium">{r.value}</span>
                    </span>
                    <span className="flex-shrink-0 font-bold">
                      {r.count}{" "}
                      <span className="text-xs font-normal text-ink/40">{r.pct}</span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-ink/[0.05]">
                    <div
                      className="h-full rounded-full"
                      style={{ background: c.bar, width: `${r.w}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
