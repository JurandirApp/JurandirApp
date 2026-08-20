import { authEstablishment } from "@/lib/auth/bearer";
import { listMenu, upsertMenuItem, deleteMenuItem } from "@/lib/db/menu";
import { toPanelMenuItem } from "@/lib/panel/adapters";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/** GET — cardápio real do estabelecimento logado (inclui `active`). */
export async function GET(req: Request): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  const rows = await listMenu(s.establishmentId!);
  const items = rows.map((m) => ({ ...toPanelMenuItem(m), active: m.active }));
  return Response.json({ items }, { headers: CORS });
}

/** POST — cria ou edita um item. O establishmentId vem SEMPRE do token. */
export async function POST(req: Request): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid" }, { status: 400, headers: CORS });
  }

  try {
    const item = await upsertMenuItem({
      ...body,
      establishmentId: s.establishmentId!,
    } as Parameters<typeof upsertMenuItem>[0]);
    if (!item) return Response.json({ error: "not found" }, { status: 404, headers: CORS });
    return Response.json({ item: { ...toPanelMenuItem(item), active: item.active } }, { headers: CORS });
  } catch {
    return Response.json({ error: "invalid" }, { status: 422, headers: CORS });
  }
}

/** DELETE ?id=... — exclui um item do estabelecimento logado. */
export async function DELETE(req: Request): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "invalid" }, { status: 422, headers: CORS });
  const r = await deleteMenuItem(id, s.establishmentId!);
  return Response.json({ ok: true, deleted: r.count }, { headers: CORS });
}
