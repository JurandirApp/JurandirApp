import { createOrder, getOrdersByIds } from "@/lib/db/orders";
import { reconcileOrder } from "@/lib/db/payments";
import { orderCreateSchema } from "@/lib/validation";
import { toClientOrder } from "@/lib/app/adapters";

// Consultas ao Neon a cada request.
export const dynamic = "force-dynamic";

// API pública (cliente anônimo do QR) — liberada p/ o app Flutter.
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * POST /api/public/orders
 * Cria um pedido real (mesma regra do `createOrderAction` do web) e devolve o
 * pedido no formato do app (`toClientOrder`). Pagamento fica adiado: o app
 * envia método CREDIT (placeholder que NÃO dispara cobrança dentro do
 * createOrder), então o pedido nasce AWAITING_PAYMENT sem depender de gateway.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400, headers: CORS });
  }

  const parsed = orderCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid", issues: parsed.error.issues }, { status: 422, headers: CORS });
  }

  try {
    const created = await createOrder(parsed.data);
    return Response.json({ order: toClientOrder(created) }, { status: 201, headers: CORS });
  } catch {
    return Response.json({ error: "failed" }, { status: 500, headers: CORS });
  }
}

/**
 * GET /api/public/orders?ids=a,b,c
 * Status dos pedidos que o cliente guardou localmente (aba Pedidos + tela do Pix).
 * Reconcilia no gateway os que ainda estão AWAITING_PAYMENT — assim que o Pix é
 * pago, o pedido vira "em produção" (idempotente; `reconcileOrder` só chama a
 * Pagar.me quando faz sentido).
 */
export async function GET(req: Request): Promise<Response> {
  const idsParam = new URL(req.url).searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (!ids.length) {
    return Response.json({ orders: [] }, { headers: CORS });
  }

  await Promise.allSettled(ids.map((id) => reconcileOrder(id)));
  const rows = await getOrdersByIds(ids);
  return Response.json({ orders: rows.map(toClientOrder) }, { headers: CORS });
}
