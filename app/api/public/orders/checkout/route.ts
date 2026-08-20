import { createOrder, getOrdersByIds } from "@/lib/db/orders";
import { createCardCheckout } from "@/lib/db/payments";
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
 * POST /api/public/orders/checkout
 * Body: <orderCreateInput> com payment.method = CREDIT | DEBIT.
 * Cria o pedido (AWAITING_PAYMENT) e devolve a URL do CHECKOUT HOSPEDADO da
 * Pagar.me (cartão/3DS acontece lá). O app abre a URL; quando o cliente paga, o
 * GET /orders reconcilia pelo código e o pedido vai pra produção.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400, headers: CORS });
  }

  const parsed = orderCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalid", issues: parsed.error.issues }, { status: 422, headers: CORS });
  }

  try {
    const created = await createOrder(parsed.data);
    const checkoutUrl = await createCardCheckout(created.id);
    const [fresh] = await getOrdersByIds([created.id]);
    return Response.json(
      { ok: !!checkoutUrl, checkoutUrl: checkoutUrl ?? null, order: toClientOrder(fresh ?? created) },
      { status: 201, headers: CORS },
    );
  } catch {
    return Response.json({ ok: false, error: "failed" }, { status: 500, headers: CORS });
  }
}
