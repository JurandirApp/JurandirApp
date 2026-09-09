import { authEstablishment } from "@/lib/auth/bearer";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/** GET — timeline de eventos de um pedido (scoped por estabelecimento). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });

  const { id } = await ctx.params;
  const events = await prisma.orderEvent.findMany({
    where: { orderId: id, order: { establishmentId: s.establishmentId! } },
    orderBy: { at: "asc" },
    include: { waiter: { select: { name: true } } },
  });
  return Response.json({ events }, { headers: CORS });
}
