import { SEASON, type AdminEst, type AdminOrder, type PayKey } from "@/lib/data/admin";

export type ScaledEst = AdminEst & {
  pOrders: number;
  pRevenue: number;
  pByPay: Record<PayKey, number>;
};

// [id, label, fraction of the monthly baseline]
export const PERIODS: [string, string, number][] = [
  ["dia", "Dia", 1 / 30],
  ["semana", "Semana", 7 / 30],
  ["quinzena", "Quinzena", 15 / 30],
  ["mes", "Mês", 1],
];

export function periodFraction(period: string): number {
  return PERIODS.find((p) => p[0] === period)?.[2] ?? 1;
}

/** Scaling factor for one establishment given the selected period/month. */
export function factorFor(
  e: AdminEst,
  period: string,
  month: string,
  now: number,
): number {
  if (period !== "mes") return periodFraction(period);
  const [my, mm] = month.split("-").map(Number);
  const monthEnd = new Date(my, mm, 1).getTime(); // start of the month after the selected one
  if (monthEnd <= new Date(e.since).getTime()) return 0;
  const nowMonth = new Date(now).getMonth();
  return SEASON[mm - 1] / SEASON[nowMonth];
}

export function scaleEsts(
  ests: AdminEst[],
  period: string,
  month: string,
  now: number,
): ScaledEst[] {
  return ests.map((e) => {
    const f = factorFor(e, period, month, now);
    return {
      ...e,
      pOrders: Math.round(e.orders * f),
      pRevenue: e.revenue * f,
      pByPay: {
        credito: e.byPay.credito * f,
        debito: e.byPay.debito * f,
        pix: e.byPay.pix * f,
        usdc: e.byPay.usdc * f,
      },
    };
  });
}

export type MonthlyStatLite = {
  establishmentId: string;
  year: number;
  month: number;
  orders: number;
  gmv: number;
  byCredit: number;
  byDebit: number;
  byPix: number;
  byUsdc: number;
};

/** Scale each establishment by the selected month's rollup row and the period fraction. */
export function scaleFromStats(
  ests: AdminEst[],
  stats: MonthlyStatLite[],
  period: string,
  month: string,
): ScaledEst[] {
  const [y, m] = month.split("-").map(Number);
  const frac = periodFraction(period);
  return ests.map((e) => {
    const s = stats.find(
      (x) => x.establishmentId === e.id && x.year === y && x.month === m,
    );
    const g = s ? s.gmv : 0;
    const o = s ? s.orders : 0;
    return {
      ...e,
      pOrders: Math.round(o * frac),
      pRevenue: g * frac,
      pByPay: {
        credito: (s?.byCredit ?? 0) * frac,
        debito: (s?.byDebit ?? 0) * frac,
        pix: (s?.byPix ?? 0) * frac,
        usdc: (s?.byUsdc ?? 0) * frac,
      },
    };
  });
}

/**
 * Agrega os PEDIDOS REAIS pagos por estabelecimento na janela do período/mês —
 * fonte de verdade dos dashboards do admin (substitui o rollup `scaleFromStats`,
 * que não era atualizado a cada pagamento). Janela: "mes" = o mês selecionado
 * inteiro; "dia"/"semana"/"quinzena" = os últimos 1/7/15 dias desse mês até agora.
 */
export function scaleFromOrders(
  ests: AdminEst[],
  orders: AdminOrder[],
  period: string,
  month: string,
  now: number,
): ScaledEst[] {
  const [y, m] = month.split("-").map(Number);
  const monthStart = new Date(y, m - 1, 1).getTime();
  const monthEnd = new Date(y, m, 1).getTime(); // início do mês seguinte (exclusivo)
  const refEnd = Math.min(now, monthEnd);
  const days = period === "dia" ? 1 : period === "semana" ? 7 : period === "quinzena" ? 15 : null;
  const minTs = days == null ? monthStart : Math.max(monthStart, refEnd - days * 864e5);
  const maxTs = period === "mes" ? monthEnd : refEnd;

  type Agg = { orders: number; revenue: number; byPay: Record<PayKey, number> };
  const zero = (): Agg => ({
    orders: 0,
    revenue: 0,
    byPay: { credito: 0, debito: 0, pix: 0, usdc: 0 },
  });
  const agg = new Map<string, Agg>();
  for (const o of orders) {
    if (!o.paid || o.ts < minTs || o.ts >= maxTs) continue;
    const a = agg.get(o.est) ?? zero();
    a.orders += 1;
    a.revenue += o.total;
    if (o.m === "credito" || o.m === "debito" || o.m === "pix" || o.m === "usdc") {
      a.byPay[o.m] += o.total;
    }
    agg.set(o.est, a);
  }
  return ests.map((e) => {
    const a = agg.get(e.id) ?? zero();
    return { ...e, pOrders: a.orders, pRevenue: a.revenue, pByPay: a.byPay };
  });
}

/** Last 12 months as { value: "YYYY-MM", label: "Julho de 2026" / "July 2026" }. */
export function monthOptions(
  now: number,
  locale = "pt",
): { value: string; label: string }[] {
  const intl = locale === "en" ? "en-US" : "pt-BR";
  return Array.from({ length: 12 }, (_, i) => {
    const dd = new Date(now);
    dd.setDate(1);
    dd.setMonth(dd.getMonth() - i);
    const value = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}`;
    const raw = dd.toLocaleDateString(intl, { month: "long", year: "numeric" });
    return { value, label: raw.charAt(0).toUpperCase() + raw.slice(1) };
  });
}
