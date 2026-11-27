import { authEstablishment } from "@/lib/auth/bearer";
import { setWaiterModuleEnabled } from "@/lib/db/establishments";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * POST /api/public/establishment/waiter-module   { enabled: boolean }
 * O estabelecimento logado (Bearer JWT) liga/desliga o próprio Módulo do Garçom
 * (botão/fluxo de entrega). Resposta: { ok: true, enabled }.
 */
export async function POST(req: Request): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers: CORS });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid" }, { status: 400, headers: CORS });
  }
  const enabled = (body as { enabled?: unknown } | null)?.enabled;
  if (typeof enabled !== "boolean") {
    return Response.json({ ok: false, error: "invalid" }, { status: 422, headers: CORS });
  }

  try {
    const on = await setWaiterModuleEnabled(s.establishmentId!, enabled);
    return Response.json({ ok: true, enabled: on }, { headers: CORS });
  } catch {
    return Response.json({ ok: false, error: "failed" }, { status: 500, headers: CORS });
  }
}
