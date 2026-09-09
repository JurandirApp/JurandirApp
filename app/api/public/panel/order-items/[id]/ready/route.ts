import { authEstablishment } from "@/lib/auth/bearer";
import { markItemReady } from "@/lib/db/delivery";
import { markReadySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/** POST — bar marca N unidades de um item como prontas (scoped por estabelecimento). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });

  const { id } = await ctx.params;
  const parsed = markReadySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 422, headers: CORS });

  const r = await markItemReady(s.establishmentId!, id, parsed.data.qty);
  // TODO(Plano 5): push aos garçons do bar quando r.ok.
  return Response.json({ ok: r.ok }, { status: r.ok ? 200 : 409, headers: CORS });
}
