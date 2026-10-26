import { authEstablishment } from "@/lib/auth/bearer";
import { getEstablishmentTunaStatus, registerEstablishmentInTuna } from "@/lib/db/tuna";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/** GET — situação do cadastro do bar na Tuna (visível? registrado? Pix/cartão). */
export async function GET(req: Request): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  const status = await getEstablishmentTunaStatus(s.establishmentId!);
  return Response.json(status, { headers: CORS });
}

/** POST — cadastra o bar na Tuna (corpo = formulário). Só quando `visible`. */
export async function POST(req: Request): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  const status = await getEstablishmentTunaStatus(s.establishmentId!);
  if (!status.visible) return Response.json({ error: "notAvailable" }, { status: 403, headers: CORS });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid" }, { status: 400, headers: CORS });
  }
  const r = await registerEstablishmentInTuna(s.establishmentId!, body);
  if (r.error === "notAvailable") return Response.json({ error: "notAvailable" }, { status: 403, headers: CORS });
  return Response.json(r, { status: r.ok ? 200 : 400, headers: CORS });
}
