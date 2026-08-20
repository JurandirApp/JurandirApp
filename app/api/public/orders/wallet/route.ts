import { createOrder, getOrdersByIds } from "@/lib/db/orders";
import { payOrderWithWallet } from "@/lib/db/payments";
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
  let body: { order?: unknown; walletType?: unknown; token?: unknown };
  try {
    body = (await req.json()) as { order?: unknown; walletType?: unknown; token?: unknown };
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400, headers: CORS });
  }

  const walletType = body.walletType === "apple_pay" ? "apple_pay" : "google_pay";
  const token = typeof body.token === "string" ? body.token : "";
  if (!token) {
    return Response.json({ ok: false, error: "tokenRequired" }, { status: 422, headers: CORS });
  }
  const parsed = orderCreateSchema.safeParse(body.order);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalidOrder" }, { status: 422, headers: CORS });
  }

  try {
    const created = await createOrder(parsed.data);
    const pay = await payOrderWithWallet(created.id, walletType, token);
    const [fresh] = await getOrdersByIds([created.id]);
    return Response.json(
      {
        ok: pay.status !== "failed",
        status: pay.status, // paid | pending | failed
        detail: pay.statusDetail,
        order: toClientOrder(fresh ?? created),
      },
      { headers: CORS },
    );
  } catch {
    return Response.json({ ok: false, status: "failed", error: "failed" }, { status: 500, headers: CORS });
  }
}
