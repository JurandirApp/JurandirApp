import { getCardPublicKey } from "@/lib/payments/pagbank";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * GET /api/public/pagbank/public-key
 * Chave pública (RSA, base64 SPKI) pra o app criptografar o cartão antes de
 * enviar — o cartão cru nunca chega no backend. É pública por natureza.
 */
export async function GET(): Promise<Response> {
  try {
    const publicKey = await getCardPublicKey();
    return Response.json({ publicKey }, { headers: CORS });
  } catch (e) {
    console.error("[pagbank/public-key] falha:", e instanceof Error ? e.message : String(e));
    return Response.json({ error: "unavailable" }, { status: 502, headers: CORS });
  }
}
