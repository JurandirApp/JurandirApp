import { authEstablishment } from "@/lib/auth/bearer";
import { listWaiters, upsertWaiter, deleteWaiter } from "@/lib/db/waiters";
import { waiterUpsertSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/** GET — lista os garçons do estabelecimento logado. */
export async function GET(req: Request): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  const waiters = await listWaiters(s.establishmentId!);
  return Response.json({ waiters }, { headers: CORS });
}

/** POST — cria ou edita um garçom. O establishmentId vem SEMPRE do token. */
export async function POST(req: Request): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });

  const parsed = waiterUpsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 422, headers: CORS });

  const waiter = await upsertWaiter(s.establishmentId!, parsed.data);
  if (!waiter) return Response.json({ error: "not found" }, { status: 404, headers: CORS });
  return Response.json({ waiter }, { headers: CORS });
}

/** DELETE ?id=... — remove um garçom do estabelecimento logado. */
export async function DELETE(req: Request): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "invalid" }, { status: 422, headers: CORS });
  const r = await deleteWaiter(id, s.establishmentId!);
  return Response.json({ ok: true, deleted: r.count }, { headers: CORS });
}
