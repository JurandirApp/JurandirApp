import { ensureTunaMode } from "@/lib/payments/tuna";
import { tunaFingerprintConfig } from "@/lib/payments/tuna-fingerprint";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const HEADERS: Record<string, string> = { ...CORS, "Cache-Control": "no-store" };

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * GET /api/public/tuna/fingerprint
 * Config do Device Fingerprint (CyberSource, antifraude da Tuna) no modo atual
 * da Tuna: `{ enabled: true, orgId, merchantId }` ou `{ enabled: false }` (sem
 * merchant id do modo, ou modo indisponível). O app/site carrega
 * `https://h.online-metrix.net/fp/tags.js?org_id=<orgId>&session_id=<merchantId><id>`
 * e manda só o `<id>` na cobrança. Nada aqui é segredo (vai pro navegador).
 */
export async function GET(): Promise<Response> {
  try {
    const mode = await ensureTunaMode();
    return Response.json(tunaFingerprintConfig(mode), { headers: HEADERS });
  } catch {
    return Response.json({ enabled: false }, { headers: HEADERS });
  }
}
