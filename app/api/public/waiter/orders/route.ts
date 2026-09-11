import { authWaiter } from "@/lib/auth/waiter";
import { listWaiterOrders } from "@/lib/db/delivery";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/** GET — fila do garçom agrupada por PEDIDO (pedidos em produção com ≥1 item
 *  pronto/em entrega), escopada pelo estabelecimento do garçom logado. */
export async function GET(req: Request): Promise<Response> {
  const s = await authWaiter(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });

  const orders = await listWaiterOrders(s.establishmentId);
  return Response.json({ orders }, { headers: CORS });
}
