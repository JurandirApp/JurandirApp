/**
 * Agregação da visão geral da plataforma (admin). Lógica pura, sem I/O.
 *
 * Regra central: **só pedido PAGO entra nos números.** Pago = `Order.status` em
 * `{IN_PRODUCTION, DELIVERED}`. `AWAITING_PAYMENT` (não pago / Pix expirado) NÃO
 * conta — senão o GMV/taxas/contagem da plataforma ficam inflados.
 */

/** Status de `Order` que representam um pedido efetivamente pago. */
const PAID = new Set(["IN_PRODUCTION", "DELIVERED"]);

/** Enum do gateway → rótulo curto usado no dashboard. */
export const METHOD: Record<string, string> = {
  CREDIT: "credito",
  DEBIT: "debito",
  PIX: "pix",
  USDC: "usdc",
};

export const num = (v: unknown): number => Number(v ?? 0);

export interface OverviewOrder {
  establishmentId: string;
  status: string;
  total: unknown;
  platformFee: unknown;
  payment: { method: string } | null;
  splitShares: { id: string }[];
}

export interface EstAgg {
  orders: number;
  gmv: number;
  fees: number;
}

export interface OverviewAgg {
  perEst: Map<string, EstAgg>;
  byPayment: Record<string, number>;
  gmvTotal: number;
  feesTotal: number;
  /** Nº de pedidos PAGOS (não é orders.length). */
  paidOrders: number;
}

export function aggregatePlatformOverview(orders: OverviewOrder[]): OverviewAgg {
  const perEst = new Map<string, EstAgg>();
  const byPayment: Record<string, number> = { pix: 0, credito: 0, debito: 0, usdc: 0, split: 0 };
  let gmvTotal = 0;
  let feesTotal = 0;
  let paidOrders = 0;

  for (const o of orders) {
    if (!PAID.has(o.status)) continue; // não pago não entra em nenhum total
    const t = num(o.total);
    const fee = num(o.platformFee);
    gmvTotal += t;
    feesTotal += fee;
    paidOrders += 1;

    const a = perEst.get(o.establishmentId) ?? { orders: 0, gmv: 0, fees: 0 };
    a.orders += 1;
    a.gmv += t;
    a.fees += fee;
    perEst.set(o.establishmentId, a);

    const m = o.payment ? (METHOD[o.payment.method] ?? "pix") : "split";
    byPayment[m] = (byPayment[m] ?? 0) + t;
  }

  return { perEst, byPayment, gmvTotal, feesTotal, paidOrders };
}
