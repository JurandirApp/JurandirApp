import { authAdmin } from "@/lib/auth/bearer";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/** POST /api/public/admin/fee { id, pct } — atualiza o fee (%) de um estabelecimento. */
export async function POST(req: Request): Promise<Response> {
  const s = await authAdmin(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });

  let body: { id?: unknown; pct?: unknown };
  try {
    body = (await req.json()) as { id?: unknown; pct?: unknown };
  } catch {
    return Response.json({ error: "invalid" }, { status: 400, headers: CORS });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const pctNum = Number(body.pct);
  if (!id || Number.isNaN(pctNum)) {
    return Response.json({ error: "invalid" }, { status: 422, headers: CORS });
  }
  const clamped = Math.min(100, Math.max(0, Math.round(pctNum)));
  await prisma.establishment.update({ where: { id }, data: { platformFeePct: clamped } });
  return Response.json({ ok: true, feePct: clamped }, { headers: CORS });
}
