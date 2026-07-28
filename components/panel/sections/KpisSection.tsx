"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import {
  CATS,
  CAT_COLORS,
  CAT_ICON,
  PAY_LOGOS,
  PM,
  type PayMethod,
} from "@/lib/data/panel";
import { fmtDateTime, money, orderTotal, padId } from "@/lib/panel/helpers";
import { categoryShares, scaleEstStats, topItems } from "@/lib/panel/adapters";
import { usePanel } from "../context";

const CN = Object.keys(CATS);

const pillStyle = (active: boolean) =>
  active
    ? { background: "#141821", color: "#EDD8A3" }
    : { background: "rgba(237,216,163,.4)", color: "rgba(20,24,33,.7)" };

export function KpisSection() {
  const {
    orders,
    menu,
    stats,
    now,
    period,
    setPeriod,
    openPay,
    setOpenPay,
    itemCat,
    setItemCat,
  } = usePanel();
  const tr = useTranslations("panel");

  const catOf = useMemo(() => {
    const m: Record<string, string> = {};
    menu.forEach((i) => (m[i.name] = i.cat));
    return m;
  }, [menu]);

  const view = useMemo(() => {
    const st0 = new Date(now);
    st0.setHours(0, 0, 0, 0);
    const minTs =
      period === "hoje"
        ? st0.getTime()
        : period === "7d"
          ? now - 7 * 864e5
          : period === "30d"
            ? now - 30 * 864e5
            : 0;
    const data = orders.filter((o) => o.ts >= minTs && o.st !== "aguardando");

    // Rollup headline (establishment-wide, scaled to the selected period).
    const { revenue, orders: rollupOrders, byPay } = scaleEstStats(stats, period, now);

    // Category donut — fractions from real items, but values + center scaled
    // to the rollup revenue so the donut total matches the headline.
    const C = 2 * Math.PI * 42;
    const shares = categoryShares(data, catOf);
    const catSegs = shares.map((s, i) => {
      const offsetFrac = shares.slice(0, i).reduce((a, x) => a + x.frac, 0);
      return {
        key: s.cat,
        label: s.cat,
        color: CAT_COLORS[s.cat] || "#94a3b8",
        dash: `${(s.frac * C).toFixed(2)} ${C.toFixed(2)}`,
        offset: (-offsetFrac * C).toFixed(2),
        pct: `${Math.round(s.frac * 100)}%`,
        val: money(s.frac * revenue),
      };
    });

    // Payment breakdown — totals from the rollup; per-order detail list stays
    // real (from raw single-payment orders), even if shorter than the rollup.
    const singles = data.filter((o) => !o.splits);
    const payTotals = (Object.keys(PM) as PayMethod[]).map((id) => {
      const os = singles.filter((o) => o.pay === id);
      return { id, os, total: byPay[id] };
    });
    const maxPay = Math.max(...payTotals.map((p) => p.total), 1);
    const grand = payTotals.reduce((s, p) => s + p.total, 0) || 1;

    // Top items
    const entries = topItems(data, catOf, itemCat).map(
      (t): [string, { qty: number; rev: number }] => [t.name, { qty: t.qty, rev: t.rev }],
    );
    const maxQty = Math.max(...entries.map(([, t]) => t.qty), 1);
    const maxRev = Math.max(...entries.map(([, t]) => t.rev), 1);
    const mk = (
      arr: [string, { qty: number; rev: number }][],
      metric: "qty" | "rev",
      max: number,
    ) =>
      arr.slice(0, 5).map(([name, t], k) => ({
        key: name,
        medal: `${k + 1}º`,
        name,
        primary: metric === "qty" ? `${t.qty} un` : money(t.rev),
        secondary: metric === "qty" ? money(t.rev) : `${t.qty} un`,
        w: Math.round(((metric === "qty" ? t.qty : t.rev) / max) * 100),
      }));
    const rankQty = mk([...entries].sort((a, b) => b[1].qty - a[1].qty), "qty", maxQty);
    const rankRev = mk([...entries].sort((a, b) => b[1].rev - a[1].rev), "rev", maxRev);

    return { data, revenue, rollupOrders, catSegs, payTotals, maxPay, grand, rankQty, rankRev };
  }, [orders, stats, catOf, now, period, itemCat]);

  const { data, revenue, rollupOrders, catSegs, payTotals, maxPay, grand, rankQty, rankRev } = view;

  const statCards = [
    { label: tr("kpis.revenue"), value: money(revenue), color: "#EF5130" },
    { label: tr("kpis.orders"), value: String(rollupOrders), color: "#141821" },
    { label: tr("kpis.avgTicket"), value: money(rollupOrders ? revenue / rollupOrders : 0), color: "#0C6A70" },
    { label: tr("kpis.inProduction"), value: String(data.filter((o) => o.st === "producao").length), color: "#f59e0b" },
  ];
  const catCenter =
    revenue >= 1000 ? "R$ " + (revenue / 1000).toFixed(1).replace(".", ",") + "k" : money(revenue);

  return (
    <div>
      {/* Period tabs */}
      <div className="mb-4 flex gap-1 rounded-xl border-2 border-ink bg-white p-1 shadow-hard">
        {["hoje", "7d", "30d", "tudo"].map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setPeriod(id)}
            className="flex-1 rounded-lg py-2 text-sm font-medium"
            style={{
              background: period === id ? "#141821" : "transparent",
              color: period === id ? "#EDD8A3" : "rgba(20,24,33,.5)",
            }}
          >
            {tr(`kpis.${id}`)}
          </button>
        ))}
      </div>

      {/* Stat cards */}
      <div
        className="mb-5 grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}
      >
        {statCards.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border-2 border-ink bg-white p-4 shadow-hard"
          >
            <p className="m-0 text-xs text-ink/50">{s.label}</p>
            <p
              className="m-0 mt-1 font-display text-2xl font-extrabold"
              style={{ color: s.color }}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Donut + payments */}
      <div
        className="mb-4 grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fit,minmax(380px,1fr))" }}
      >
        <div className="rounded-2xl border-2 border-ink bg-white p-5 shadow-hard">
          <h2 className="m-0 mb-4 font-display text-sm font-semibold text-ink/70">
            {tr("kpis.salesByCategory")}
          </h2>
          <div className="flex items-center gap-6">
            <div className="relative h-[150px] w-[150px] flex-shrink-0">
              <svg viewBox="0 0 100 100" className="h-[150px] w-[150px] -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(20,24,33,.06)" strokeWidth="15" />
                {catSegs.map((s) => (
                  <circle
                    key={s.key}
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke={s.color}
                    strokeWidth="15"
                    strokeDasharray={s.dash}
                    strokeDashoffset={s.offset}
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[10px] font-semibold uppercase tracking-[.05em] text-ink/45">
                  {tr("kpis.sales")}
                </span>
                <span className="font-display text-[15px] font-extrabold leading-tight">
                  {catCenter}
                </span>
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              {catSegs.length === 0 && (
                <p className="m-0 text-sm text-ink/40">{tr("kpis.noSales")}</p>
              )}
              {catSegs.map((s) => (
                <div
                  key={s.key}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2 text-ink/80">
                    <span
                      className="h-3 w-3 flex-shrink-0 rounded-[3px]"
                      style={{ background: s.color }}
                    />
                    <span className="truncate">{tr(`cat.${s.label}`)}</span>
                  </span>
                  <span className="flex-shrink-0 text-xs text-ink/60">
                    <b className="text-sm text-ink">{s.pct}</b> · {s.val}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border-2 border-ink bg-white p-5 shadow-hard">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="m-0 font-display text-sm font-semibold text-ink/70">
              {tr("kpis.salesByMethod")}
            </h2>
            <span className="text-[11px] text-ink/40">{tr("kpis.tapToDetail")}</span>
          </div>
          {payTotals.map((p) => {
            const pm = PM[p.id];
            const logo = PAY_LOGOS[p.id];
            const open = openPay === p.id;
            return (
              <div key={p.id} className="border-b border-ink/[0.08] py-3 last:border-0">
                <button
                  type="button"
                  onClick={() => setOpenPay(open ? null : p.id)}
                  className="w-full bg-transparent p-0 text-left"
                >
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2.5 font-semibold text-ink/85">
                      <span
                        className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[11px]"
                        style={{
                          background: logo ? "#fff" : pm.color,
                          border: logo ? "1px solid rgba(20,24,33,.12)" : "none",
                        }}
                      >
                        {logo ? (
                          <span
                            className="h-[22px] w-[22px] bg-contain bg-center bg-no-repeat"
                            style={{ backgroundImage: `url("${logo}")` }}
                          />
                        ) : (
                          <Icon name={pm.icon} size={18} className="text-white" />
                        )}
                      </span>
                      {tr(`pay.${p.id}`)}
                      <span className="font-normal text-ink/40">
                        · {tr("kpis.payments", { count: p.os.length })}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-bold">{money(p.total)}</span>
                      <Icon
                        name="expand_more"
                        size={16}
                        className="text-ink/40 transition-transform duration-150"
                        style={{ transform: open ? "rotate(180deg)" : "none" }}
                      />
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sand/40">
                      <div
                        className="h-full rounded-full transition-[width] duration-500"
                        style={{
                          background: pm.color,
                          width: `${Math.round((p.total / maxPay) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="w-9 text-right text-[11px] text-ink/40">
                      {Math.round((p.total / grand) * 100)}%
                    </span>
                  </div>
                </button>
                {open && (
                  <div className="mt-3 flex flex-col gap-2">
                    {p.os.length === 0 && (
                      <p className="m-0 py-2 text-center text-xs text-ink/40">
                        {tr("kpis.noPaymentsWith", { method: tr(`pay.${p.id}`) })}
                      </p>
                    )}
                    {p.os.map((o) => (
                      <div
                        key={o.id}
                        className="flex items-start justify-between gap-2 rounded-xl bg-sand/30 p-3"
                      >
                        <div className="min-w-0">
                          <p className="m-0 text-sm font-semibold text-ink/80">
                            {tr("pedidos.order", { id: padId(o.id) })}
                            {o.cust ? ` · ${o.cust}` : ""}
                          </p>
                          <p className="m-0 mt-0.5 text-xs text-ink/40">
                            {o.loc} · {fmtDateTime(o.ts)}
                          </p>
                          <span className="mt-1.5 inline-block rounded-full bg-sand/60 px-2 py-0.5 text-[11px] font-medium text-ink/70">
                            {tr("kpis.singlePayment", { method: tr(`pay.${p.id}`) })}
                          </span>
                        </div>
                        <p className="m-0 flex-shrink-0 font-bold">
                          {money(orderTotal(o))}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Top items */}
      <div className="rounded-2xl border-2 border-ink bg-white p-5 shadow-hard">
        <h2 className="m-0 mb-3 font-display text-sm font-semibold text-ink/70">
          {tr("kpis.topItems")}
        </h2>
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {["Todos", ...CN].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setItemCat(c)}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium"
              style={pillStyle(itemCat === c)}
            >
              {c !== "Todos" && <Icon name={CAT_ICON[c]} size={13} />}
              {c === "Todos" ? tr("cardapio.all") : tr(`cat.${c}`)}
            </button>
          ))}
        </div>

        <RankBlock
          icon="group"
          iconColor="#f59e0b"
          title={tr("kpis.byQuantity")}
          emptyLabel={tr("kpis.noData")}
          rows={rankQty}
          barColor="#fbbf24"
        />
        <div className="my-4 h-px bg-ink/10" />
        <RankBlock
          icon="trending_up"
          iconColor="#10b981"
          title={tr("kpis.byRevenue")}
          emptyLabel={tr("kpis.noData")}
          rows={rankRev}
          barColor="#10b981"
        />
      </div>
    </div>
  );
}

function RankBlock({
  icon,
  iconColor,
  title,
  emptyLabel,
  rows,
  barColor,
}: {
  icon: string;
  iconColor: string;
  title: string;
  emptyLabel: string;
  rows: { key: string; medal: string; name: string; primary: string; secondary: string; w: number }[];
  barColor: string;
}) {
  return (
    <>
      <p className="m-0 mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.05em] text-ink/50">
        <Icon name={icon} size={13} style={{ color: iconColor }} />
        {title}
      </p>
      <div className="flex flex-col gap-3">
        {rows.length === 0 && (
          <p className="m-0 text-sm text-ink/40">{emptyLabel}</p>
        )}
        {rows.map((r) => (
          <div key={r.key}>
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2 font-medium text-ink/80">
                <span className="w-6 text-center text-[13px] font-extrabold text-ink/45">
                  {r.medal}
                </span>
                {r.name}
              </span>
              <span className="flex-shrink-0 text-xs text-ink/60">
                <b className="text-sm text-ink">{r.primary}</b> · {r.secondary}
              </span>
            </div>
            <div className="ml-8 h-2 overflow-hidden rounded-full bg-sand/40">
              <div
                className="h-full rounded-full"
                style={{ background: barColor, width: `${r.w}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
