import { authWaiter } from "@/lib/auth/waiter";
import { deliverItem } from "@/lib/db/delivery";
import { deliverItemSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/** POST — garçom entrega N unidades de um item mediante código (scoped por estabelecimento). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const s = await authWaiter(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });

  const { id } = await ctx.params;
  const parsed = deliverItemSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 422, headers: CORS });

  const r = await deliverItem(s.establishmentId, s.userId, id, parsed.data.qty, parsed.data.code);
  // TODO(Plano 5): push ao cliente 'entregue'
  if (!r.ok) {
    const status = r.error === "code" ? 422 : r.error === "notfound" ? 404 : 409;
    return Response.json({ ok: false, error: r.error }, { status, headers: CORS });
  }
  return Response.json({ ok: true, orderDone: r.orderDone }, { headers: CORS });
}
