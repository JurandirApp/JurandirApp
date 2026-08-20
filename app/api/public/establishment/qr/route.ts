import { authEstablishment } from "@/lib/auth/bearer";
import { listQrSpots, createQrSpot, deleteQrSpot } from "@/lib/db/qr";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/** GET — slug do estabelecimento (p/ montar a URL do QR) + pontos (mesas/guarda-sóis). */
export async function GET(req: Request): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  const [est, spots] = await Promise.all([
    prisma.establishment.findUnique({ where: { id: s.establishmentId! }, select: { slug: true } }),
    listQrSpots(s.establishmentId!),
  ]);
  return Response.json(
    { slug: est?.slug ?? "", spots: spots.map((q) => ({ id: q.id, label: q.label })) },
    { headers: CORS },
  );
}

/** POST { label } — cria um ponto de QR. */
export async function POST(req: Request): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  let body: { label?: unknown };
  try {
    body = (await req.json()) as { label?: unknown };
  } catch {
    return Response.json({ error: "invalid" }, { status: 400, headers: CORS });
  }
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) return Response.json({ error: "invalid" }, { status: 422, headers: CORS });
  const spot = await createQrSpot(s.establishmentId!, label);
  return Response.json({ spot: { id: spot.id, label: spot.label } }, { headers: CORS });
}

/** DELETE ?id=... — remove um ponto de QR. */
export async function DELETE(req: Request): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "invalid" }, { status: 422, headers: CORS });
  const r = await deleteQrSpot(id, s.establishmentId!);
  return Response.json({ ok: true, deleted: r.count }, { headers: CORS });
}
