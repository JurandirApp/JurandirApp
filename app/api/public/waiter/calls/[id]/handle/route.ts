import { authWaiter } from "@/lib/auth/waiter";
import { handleCall } from "@/lib/db/help";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const s = await authWaiter(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  const { id } = await ctx.params;
  const r = await handleCall(id, s.userId, s.establishmentId);
  return Response.json({ ok: r.ok }, { headers: CORS });
}
