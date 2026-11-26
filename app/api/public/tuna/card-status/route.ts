import { resolveTunaCardCharge } from "@/lib/db/payments";

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
 * GET /api/public/tuna/card-status?orderId=xxx
 * Situação da cobrança de cartão Tuna de um pedido — usado pelo app enquanto a
 * tela do banco (desafio 3DS) está aberta, pra saber na hora se o cliente
 * recusou. Só CONSULTA (nunca cobra). `{ status: "paid" | "failed" | "pending" }`
 * — mesma regra do `tunaCardStatusAction` do site. Erro → "pending".
 */
export async function GET(req: Request): Promise<Response> {
  const orderId = new URL(req.url).searchParams.get("orderId")?.trim() ?? "";
  if (!orderId || orderId.length > 64) {
    return Response.json({ status: "pending" }, { status: 422, headers: HEADERS });
  }
  try {
    const r = await resolveTunaCardCharge(orderId);
    // "charge" = a cobrança anterior foi recusada na Tuna (o pedido aceita outro cartão).
    if (r.kind === "charge") return Response.json({ status: "failed" }, { headers: HEADERS });
    if (r.kind === "settled" && r.status === "paid") return Response.json({ status: "paid" }, { headers: HEADERS });
    return Response.json({ status: "pending" }, { headers: HEADERS });
  } catch (e) {
    console.error("[tuna/card-status]", e instanceof Error ? e.name : "erro");
    return Response.json({ status: "pending" }, { headers: HEADERS });
  }
}
