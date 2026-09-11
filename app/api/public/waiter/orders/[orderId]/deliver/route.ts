import { authWaiter } from "@/lib/auth/waiter";
import { deliverOrderItems } from "@/lib/db/delivery";
import { deliverOrderSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/** POST — garçom entrega VÁRIOS itens de um pedido de uma vez, com um código só
 *  (os 4 últimos do telefone que o cliente mostra no app dele). Scoped por
 *  estabelecimento; tudo-ou-nada. */
export async function POST(req: Request, ctx: { params: Promise<{ orderId: string }> }): Promise<Response> {
  const s = await authWaiter(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });

  const { orderId } = await ctx.params;
  const parsed = deliverOrderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 422, headers: CORS });

  const r = await deliverOrderItems(s.establishmentId, s.userId, orderId, parsed.data.items, parsed.data.code);
  // TODO(Plano 5): push ao cliente 'entregue'
  if (!r.ok) {
    const status = r.error === "code" ? 422 : r.error === "notfound" ? 404 : 409;
    return Response.json({ ok: false, error: r.error }, { status, headers: CORS });
  }
  return Response.json({ ok: true, orderDone: r.orderDone }, { headers: CORS });
}
