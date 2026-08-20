import { authAdmin } from "@/lib/auth/bearer";
import { getAdminEstablishments, listAllOrders } from "@/lib/db/admin";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

const METHOD: Record<string, string> = { CREDIT: "credito", DEBIT: "debito", PIX: "pix", USDC: "usdc" };
const num = (v: unknown): number => Number(v ?? 0);

/**
 * GET /api/public/admin/overview — visão geral da plataforma (ADMIN):
 * estabelecimentos com agregados (pedidos, GMV, fees), quebra por método,
 * totais, e o backlog de compras. Uma chamada alimenta Dashboard/Cadastros/Backlog.
 */
export async function GET(req: Request): Promise<Response> {
  const s = await authAdmin(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });

  const [ests, orders] = await Promise.all([getAdminEstablishments(), listAllOrders()]);
  const estById = new Map(ests.map((e) => [e.id, e]));

  const agg = new Map<string, { orders: number; gmv: number; fees: number }>();
  const byPayment: Record<string, number> = { pix: 0, credito: 0, debito: 0, usdc: 0, split: 0 };
  let gmvTotal = 0;
  let feesTotal = 0;

  for (const o of orders) {
    const t = num(o.total);
    const fee = num(o.platformFee);
    gmvTotal += t;
    feesTotal += fee;
    const a = agg.get(o.establishmentId) ?? { orders: 0, gmv: 0, fees: 0 };
    a.orders += 1;
    a.gmv += t;
    a.fees += fee;
    agg.set(o.establishmentId, a);
    const m = o.payment ? (METHOD[o.payment.method] ?? "pix") : "split";
    byPayment[m] = (byPayment[m] ?? 0) + t;
  }

  const establishments = ests.map((e) => {
    const a = agg.get(e.id) ?? { orders: 0, gmv: 0, fees: 0 };
    return {
      id: e.id,
      name: e.name,
      owner: e.owner,
      type: e.type,
      city: e.city ?? "—",
      plan: e.plan,
      feePct: e.platformFeePct,
      ownerEmail: e.users[0]?.email ?? "",
      orders: a.orders,
      gmv: a.gmv,
      fees: a.fees,
      active: e.status === "ACTIVE",
    };
  });

  const backlog = orders.slice(0, 60).map((o) => {
    const est = estById.get(o.establishmentId);
    const isSplit = o.splitShares.length > 0;
    const method = o.payment ? (METHOD[o.payment.method] ?? "pix") : (isSplit ? "split" : "pix");
    return {
      code: o.code,
      estab: est?.name ?? "—",
      city: est?.city ?? "—",
      method,
      card: o.payment?.cardMask ?? "",
      total: num(o.total),
      items: o.items.map((i) => `${i.qty}× ${i.name}`).join(", "),
      ts: o.createdAt.getTime(),
    };
  });

  return Response.json(
    {
      establishments,
      byPayment,
      totals: { gmv: gmvTotal, fees: feesTotal, orders: orders.length, count: ests.length },
      backlog,
    },
    { headers: CORS },
  );
}
