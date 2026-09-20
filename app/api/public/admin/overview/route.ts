import { authAdmin } from "@/lib/auth/bearer";
import { getAdminEstablishments, listAllOrders } from "@/lib/db/admin";
import { aggregatePlatformOverview, METHOD, num } from "@/lib/admin/overview";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

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

  // Só pedidos PAGOS entram nos totais (GMV/taxas/contagem/método) — ver
  // aggregatePlatformOverview. Antes somava tudo, inclusive AWAITING_PAYMENT.
  const { perEst, byPayment, gmvTotal, feesTotal, paidOrders } =
    aggregatePlatformOverview(orders);

  const establishments = ests.map((e) => {
    const a = perEst.get(e.id) ?? { orders: 0, gmv: 0, fees: 0 };
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
      waiterModuleEnabled: e.waiterModuleEnabled,
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
      totals: { gmv: gmvTotal, fees: feesTotal, orders: paidOrders, count: ests.length },
      backlog,
    },
    { headers: CORS },
  );
}
