import { createOrder, getOrdersByIds } from "@/lib/db/orders";
import { payOrderWithCardToken } from "@/lib/db/payments";
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
 * POST /api/public/orders/card
 * Body: { order: <orderCreateInput com payment.method=CREDIT|DEBIT>,
 *         cardToken: string, installments?: number, method?: "credit"|"debit" }
 * Cria o pedido e cobra o cartão via `card_token` (tokenização Pagar.me v5 — o
 * app tokeniza com a chave pública; o cartão cru NUNCA chega aqui).
 */
export async function POST(req: Request): Promise<Response> {
  let body: { order?: unknown; cardToken?: unknown; installments?: unknown; method?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400, headers: CORS });
  }

  const cardToken = typeof body.cardToken === "string" ? body.cardToken : "";
  if (!cardToken) {
    return Response.json({ ok: false, error: "tokenRequired" }, { status: 422, headers: CORS });
  }
  const method = body.method === "debit" ? "debit" : "credit";
  const installments =
    typeof body.installments === "number" && Number.isInteger(body.installments) && body.installments > 0
      ? body.installments
      : 1;

  const parsed = orderCreateSchema.safeParse(body.order);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalidOrder" }, { status: 422, headers: CORS });
  }

  try {
    const created = await createOrder(parsed.data);
    const pay = await payOrderWithCardToken(created.id, cardToken, installments, method, parsed.data.customerDocument);
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
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[orders/card] falha ao cobrar cartão:", detail);
    return Response.json({ ok: false, status: "failed", error: "failed" }, { status: 500, headers: CORS });
  }
}
