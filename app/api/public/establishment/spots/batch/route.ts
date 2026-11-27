import { authEstablishment } from "@/lib/auth/bearer";
import { createQrSpotsBatch } from "@/lib/db/qr";
import { validateBatchLabels } from "@/lib/domain/qr-batch";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/** POST { labels: string[] } — cadastra mesas/guarda-sóis em lote (máx. 200)
 *  no bar da sessão. Repetidos/já cadastrados são pulados.
 *  → { ok: true, created, skipped, spots: string[] } (todos os rótulos do bar);
 *  422 se `labels` for inválido. */
export async function POST(req: Request): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  let body: { labels?: unknown };
  try {
    body = (await req.json()) as { labels?: unknown };
  } catch {
    return Response.json({ error: "invalid" }, { status: 422, headers: CORS });
  }
  const labels = validateBatchLabels(body?.labels);
  if (!labels) return Response.json({ error: "invalid" }, { status: 422, headers: CORS });
  const r = await createQrSpotsBatch(s.establishmentId!, labels);
  return Response.json(
    { ok: true, created: r.created, skipped: r.skipped, spots: r.spots.map((q) => q.label) },
    { headers: CORS },
  );
}
