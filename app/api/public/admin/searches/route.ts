import { authAdmin } from "@/lib/auth/bearer";
import { listSearchEvents } from "@/lib/db/admin";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

function topOf(map: Map<string, number>, limit = 8): { label: string; count: number }[] {
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** GET /api/public/admin/searches — o que os visitantes filtram, por dimensão. */
export async function GET(req: Request): Promise<Response> {
  const s = await authAdmin(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });

  const events = await listSearchEvents();
  const city = new Map<string, number>();
  const bairro = new Map<string, number>();
  const culinaria = new Map<string, number>();
  const tipo = new Map<string, number>();
  const bump = (m: Map<string, number>, v: string | null | undefined) => {
    const k = (v ?? "").trim();
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  };
  for (const e of events) {
    bump(city, e.city);
    bump(bairro, e.neighborhood);
    bump(culinaria, e.cuisine);
    bump(tipo, e.type);
  }

  return Response.json(
    {
      total: events.length,
      dims: { city: topOf(city), bairro: topOf(bairro), culinaria: topOf(culinaria), tipo: topOf(tipo) },
    },
    { headers: CORS },
  );
}
