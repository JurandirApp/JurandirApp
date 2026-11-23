import { ensureTunaMode } from "@/lib/payments/tuna";
import { tunaGoogleGatewayMerchantId } from "@/lib/payments/wallet-web-env";

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
 * GET /api/public/tuna/wallet-config
 * Config das carteiras da Tuna no modo atual: `{ googlePay: { gateway: "tuna",
 * gatewayMerchantId } }`. O app usa isto quando o Google Pay do bar está na
 * Tuna, em vez do id fixo no build — trocar o id é só mudar a env na Vercel.
 * Modo indisponível → `{ googlePay: null }` (o app esconde o Google Pay da Tuna).
 * Nada aqui é segredo (vai pro cliente).
 */
export async function GET(): Promise<Response> {
  try {
    const mode = await ensureTunaMode();
    return Response.json(
      { googlePay: { gateway: "tuna", gatewayMerchantId: tunaGoogleGatewayMerchantId(mode) } },
      { headers: HEADERS },
    );
  } catch {
    return Response.json({ googlePay: null }, { headers: HEADERS });
  }
}
