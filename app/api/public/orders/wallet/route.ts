import { createOrder, getOrdersByIds } from "@/lib/db/orders";
import { payOrderWithWallet, resolveChargeableOrder } from "@/lib/db/payments";
import { orderCreateSchema } from "@/lib/validation";
import { toClientOrder } from "@/lib/app/adapters";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * POST /api/public/orders/wallet
 * Body: { order: <orderCreateInput>, walletType: "google_pay"|"apple_pay", token: <string> }
 * Cria o pedido (cartão) e cobra na hora com o token da carteira via Pagar.me.
 * Aprovado → pedido volta "em produção". O estabelecimento precisa de recebedor
 * Pagar.me e `gatewayCredit = PAGARME`.
 */
export async function POST(req: Request): Promise<Response> {
  let body: { order?: unknown; orderId?: unknown; walletType?: unknown; token?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400, headers: CORS });
  }

  const walletType = body.walletType === "apple_pay" ? "apple_pay" : "google_pay";
  const token = typeof body.token === "string" ? body.token : "";
  if (!token) {
    return Response.json({ ok: false, error: "tokenRequired" }, { status: 422, headers: CORS });
  }

  // Resiliente (novo app): pedido já criado, só cobra. Compat: cria + cobra.
  const existingId = typeof body.orderId === "string" ? body.orderId.trim() : "";

  try {
    let targetId: string;
    if (existingId) {
      const r = await resolveChargeableOrder(existingId);
      if (r.kind === "notfound") {
        return Response.json({ ok: false, error: "orderNotFound" }, { status: 404, headers: CORS });
      }
      if (r.kind === "settled") {
        const [f] = await getOrdersByIds([existingId]);
        return Response.json(
          { ok: true, status: r.status, order: f ? toClientOrder(f) : null },
          { headers: CORS },
        );
      }
      targetId = r.id;
    } else {
      const parsed = orderCreateSchema.safeParse(body.order);
      if (!parsed.success) {
        return Response.json({ ok: false, error: "invalidOrder" }, { status: 422, headers: CORS });
      }
      const created = await createOrder(parsed.data);
      targetId = created.id;
    }

    const pay = await payOrderWithWallet(targetId, walletType, token);
    const [fresh] = await getOrdersByIds([targetId]);
    return Response.json(
      {
        ok: pay.status !== "failed",
        status: pay.status, // paid | pending | failed
        detail: pay.statusDetail,
        order: fresh ? toClientOrder(fresh) : null,
      },
      { headers: CORS },
    );
  } catch (e) {
    // Loga o motivo real (ex.: PagarmeError com o campo inválido do token) pra
    // diagnosticar a cobrança de carteira sem vazar detalhe do gateway pro app.
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[orders/wallet] falha ao cobrar carteira:", detail);
    return Response.json({ ok: false, status: "failed", error: "failed" }, { status: 500, headers: CORS });
  }
}
