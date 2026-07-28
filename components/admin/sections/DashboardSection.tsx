"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { PAY_META, feeNum, type PayKey } from "@/lib/data/admin";
import { money } from "@/lib/panel/helpers";
import { useAdmin } from "../context";

export function DashboardSection() {
  const { scopedScaled } = useAdmin();
  const t = useTranslations("admin.dashboard");
  const tm = useTranslations("admin.method");
  const tt = useTranslations("admin.tipo");

  const view = useMemo(() => {
    const ests = scopedScaled;
    const ativos = ests.filter((e) => e.status === "ativo");
    const gmv = ests.reduce((s, e) => s + e.pRevenue, 0);
    const feeRev = ests.reduce((s, e) => s + (e.pRevenue * feeNum(e.fee)) / 100, 0);
    const totalOrders = ests.reduce((s, e) => s + e.pOrders, 0);

    const byPay: Record<PayKey, number> = { credito: 0, debito: 0, pix: 0, usdc: 0 };
    ests.forEach((e) =>
      (Object.keys(byPay) as PayKey[]).forEach((k) => {
        byPay[k] += e.pByPay[k];
      }),
    );
    const payTotal = Object.values(byPay).reduce((a, b) => a + b, 0) || 1;

    const statsA = [
      { label: t("gmv"), value: money(gmv), sub: t("gmvSub"), color: "#141821" },
      { label: t("feeRev"), value: money(feeRev), sub: t("feeRevSub"), color: "#059669" },
      { label: t("orders"), value: totalOrders.toLocaleString("pt-BR"), sub: "", color: "#141821" },
      { label: t("avgTicket"), value: money(totalOrders ? gmv / totalOrders : 0), sub: "", color: "#141821" },
    ];
    const statsB = [
      { label: t("establishments"), value: String(ests.length), sub: t("estSub", { active: ativos.length, pending: ests.length - ativos.length }), color: "#141821" },
      { label: t("usdc"), value: `${((byPay.usdc / payTotal) * 100).toFixed(1)}%`, sub: t("usdcSub"), color: "#0E565B" },
      { label: t("avgFee"), value: `${(ests.reduce((s, e) => s + feeNum(e.fee), 0) / (ests.length || 1)).toFixed(1)}%`, sub: "", color: "#141821" },
      { label: t("gmvActive"), value: money(ativos.length ? gmv / ativos.length : 0), sub: "", color: "#141821" },
    ];

    const DC = 2 * Math.PI * 42;
    const keys = Object.keys(PAY_META) as PayKey[];
    const fracs = keys.map((k) => ({ k, frac: byPay[k] / payTotal }));
    const payBars = fracs.map((s, i) => {
      const offsetFrac = fracs.slice(0, i).reduce((a, x) => a + x.frac, 0);
      return {
        key: s.k,
        label: tm(s.k),
        color: PAY_META[s.k].color,
        val: money(byPay[s.k]),
        pct: `${(s.frac * 100).toFixed(0)}%`,
        w: Math.round(s.frac * 100),
        dash: `${(s.frac * DC).toFixed(2)} ${DC.toFixed(2)}`,
        offset: (-offsetFrac * DC).toFixed(2),
      };
    });
    const gmvShort =
      gmv >= 1000
        ? "R$ " + (gmv / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + "k"
        : money(gmv);

    const types = [...new Set(ests.map((e) => e.tipo))];
    const byType = types
      .map((tipo) => {
        const g = ests.filter((e) => e.tipo === tipo);
        const revenue = g.reduce((s, e) => s + e.pRevenue, 0);
        const ordersN = g.reduce((s, e) => s + e.pOrders, 0);
        return { tipo, count: g.length, revenue, ordersN, ticket: ordersN ? revenue / ordersN : 0 };
      })
      .filter((g) => g.count > 0)
      .sort((a, b) => b.revenue - a.revenue);
    const tRev = byType.reduce((s, g) => s + g.revenue, 0) || 1;
    const tOrd = byType.reduce((s, g) => s + g.ordersN, 0) || 1;
    const typeBars = byType.map((g) => ({
      key: g.tipo,
      tipo: tt(g.tipo),
      ticket: money(g.ticket),
      countLabel: t("estCount", { count: g.count }),
      revW: Math.round((g.revenue / tRev) * 100),
      revPct: `${((g.revenue / tRev) * 100).toFixed(0)}%`,
      revVal: money(g.revenue),
      ordW: Math.round((g.ordersN / tOrd) * 100),
      ordPct: `${((g.ordersN / tOrd) * 100).toFixed(0)}%`,
      ordVal: g.ordersN.toLocaleString("pt-BR"),
    }));

    const top = [...ests].sort((a, b) => b.pRevenue - a.pRevenue).slice(0, 5);
    const maxRev = top[0]?.pRevenue || 1;
    const topList = top.map((e, k) => ({
      key: e.id,
      medal: `${k + 1}º`,
      name: e.name,
      live: !!e.isLive,
      rev: money(e.pRevenue),
      fee: money((e.pRevenue * feeNum(e.fee)) / 100),
      w: Math.round((e.pRevenue / maxRev) * 100),
    }));

    return { statsA, statsB, payBars, gmvShort, typeBars, topList };
  }, [scopedScaled, t, tm, tt]);

  const { statsA, statsB, payBars, gmvShort, typeBars, topList } = view;

  return (
    <div>
      {[statsA, statsB].map((group, gi) => (
        <div
          key={gi}
          className="mb-3 grid gap-3 last:mb-5"
          style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}
        >
          {group.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border-2 border-ink bg-white p-4 shadow-hard"
            >
              <p className="m-0 text-xs font-semibold text-ink/50">{s.label}</p>
              <p
                className="m-0 mt-1.5 font-display text-[27px] font-extrabold leading-none"
                style={{ color: s.color }}
              >
                {s.value}
              </p>
              {s.sub && <p className="m-0 mt-1 text-[11px] text-ink/50">{s.sub}</p>}
            </div>
          ))}
        </div>
      ))}

      {/* GMV by payment method */}
      <div className="mb-5 rounded-2xl border-2 border-ink bg-white p-5 shadow-hard">
        <h2 className="m-0 mb-4 font-display text-sm font-bold">
          {t("payTitle")}{" "}
          <span className="font-normal text-ink/40">· {t("platform")}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-7">
          <div className="relative h-40 w-40 flex-shrink-0">
            <svg viewBox="0 0 100 100" className="h-40 w-40 -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(20,24,33,.08)" strokeWidth="15" />
              {payBars.map((p) => (
                <circle
                  key={p.key}
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke={p.color}
                  strokeWidth="15"
                  strokeDasharray={p.dash}
                  strokeDashoffset={p.offset}
                  strokeLinecap="butt"
                />
              ))}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-[10px] font-semibold uppercase tracking-[.05em] text-ink/45">
                {t("gmvCenter")}
              </span>
              <span className="font-display text-[15px] font-extrabold leading-tight">
                {gmvShort}
              </span>
            </div>
          </div>
          <div className="flex min-w-[260px] flex-1 flex-col gap-3.5">
            {payBars.map((p) => (
              <div key={p.key}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="flex items-center gap-2 font-semibold text-ink/85">
                    <span
                      className="h-3 w-3 rounded"
                      style={{ background: p.color }}
                    />
                    {p.label}
                  </span>
                  <span className="font-bold">
                    {p.val}{" "}
                    <span className="text-xs font-medium text-ink/45">· {p.pct}</span>
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-ink/[0.08]">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ background: p.color, width: `${p.w}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* By establishment type */}
      <div className="mb-5 rounded-2xl border-2 border-ink bg-white p-5 shadow-hard">
        <h2 className="m-0 mb-1 font-display text-sm font-bold">
          {t("byType")}
        </h2>
        <p className="m-0 mb-4 text-xs text-ink/50">{t("byTypeSub")}</p>
        <div className="flex flex-col gap-4">
          {typeBars.map((g) => (
            <div key={g.key}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-sm font-bold">{g.tipo}</span>
                <span className="text-[11px] text-ink/50">
                  {t("avgTicketLabel")} <b className="text-ink">{g.ticket}</b> ·{" "}
                  {g.countLabel}
                </span>
              </div>
              <TypeBar label={t("revenue")} color="#FF6B4A" w={g.revW} pct={g.revPct} val={g.revVal} />
              <TypeBar label={t("sales")} color="#0C6A70" w={g.ordW} pct={g.ordPct} val={g.ordVal} />
            </div>
          ))}
        </div>
      </div>

      {/* Top establishments */}
      <div className="rounded-2xl border-2 border-ink bg-white p-5 shadow-hard">
        <h2 className="m-0 mb-4 font-display text-sm font-bold">
          {t("top")}
        </h2>
        <div className="flex flex-col gap-3">
          {topList.map((r) => (
            <div key={r.key}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 font-medium text-ink/80">
                  <span className="w-6 text-center text-[15px] font-extrabold text-ink/45">
                    {r.medal}
                  </span>
                  {r.name}
                  {r.live && (
                    <span className="rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-bold text-sand">
                      {t("live")}
                    </span>
                  )}
                </span>
                <span className="flex-shrink-0 text-xs text-ink/50">
                  <b className="text-sm text-ink">{r.rev}</b> · {t("fee")} {r.fee}
                </span>
              </div>
              <div className="ml-8 h-2.5 overflow-hidden rounded-full bg-ink/[0.08]">
                <div
                  className="h-full rounded-full bg-coral"
                  style={{ width: `${r.w}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TypeBar({
  label,
  color,
  w,
  pct,
  val,
}: {
  label: string;
  color: string;
  w: number;
  pct: string;
  val: string;
}) {
  return (
    <div className="mb-1 flex items-center gap-2 last:mb-0">
      <span className="w-20 flex-shrink-0 text-[11px] font-semibold text-ink/50">
        {label}
      </span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink/[0.08]">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ background: color, width: `${w}%` }}
        />
      </div>
      <span className="w-28 flex-shrink-0 text-right text-[11px] font-semibold">
        {pct} <span className="font-normal text-ink/40">· {val}</span>
      </span>
    </div>
  );
}
