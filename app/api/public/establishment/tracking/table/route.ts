import { authEstablishment } from "@/lib/auth/bearer";
import { listTableDetail } from "@/lib/db/tracking";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/** GET ?day=YYYY-MM-DD&label=Mesa%205 — detalhe de UMA mesa do dia (pedidos
 *  pagos agrupados por cliente), do estabelecimento do token. */
export async function GET(req: Request): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });

  const url = new URL(req.url);
  const label = url.searchParams.get("label");
  if (!label) return Response.json({ error: "labelRequired" }, { status: 422, headers: CORS });
  const day = url.searchParams.get("day") || brToday();

  const data = await listTableDetail(s.establishmentId!, day, label);
  return Response.json(data, { headers: CORS });
}

/** Data de hoje no fuso do Brasil (UTC-3), "YYYY-MM-DD". */
function brToday(): string {
  const br = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return br.toISOString().slice(0, 10);
}
