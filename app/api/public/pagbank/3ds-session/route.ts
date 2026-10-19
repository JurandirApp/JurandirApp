import { prisma } from "@/lib/db/prisma";
import { getPagbankDebitEnabled } from "@/lib/db/settings";
import { buildCustomer, createThreeDsSession } from "@/lib/payments/pagbank";
import { decideThreeDsSession, threeDsAmountCents } from "@/lib/payments/threeds";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * POST /api/public/pagbank/3ds-session
 * Body: { orderId } de um pedido de DÉBITO PagBank ainda não cobrado.
 * Devolve a sessão do SDK 3DS + o valor (centavos) e o cliente que a cobrança vai
 * usar — o PagBank recusa a cobrança se o 3DS foi autenticado com valor diferente.
 */
export async function POST(req: Request): Promise<Response> {
  let orderId = "";
  try {
    const body = (await req.json()) as { orderId?: unknown };
    orderId = typeof body.orderId === "string" ? body.orderId : "";
  } catch {
    /* orderId vazio -> notfound */
  }

  try {
    const enabled = await getPagbankDebitEnabled();
    const order = orderId
      ? await prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } })
      : null;
    const decision = decideThreeDsSession(
      order
        ? {
            status: order.status,
            method: order.payment?.method ?? null,
            provider: order.payment?.provider ?? null,
            hasGatewayCharge: !!order.payment?.gatewayChargeId,
          }
        : null,
      enabled,
    );
    if (decision === "disabled") {
      return Response.json({ error: "debitDisabled" }, { status: 403, headers: CORS });
    }
    if (decision === "notfound" || !order) {
      return Response.json({ error: "orderNotFound" }, { status: 404, headers: CORS });
    }
    if (decision === "notChargeable") {
      return Response.json({ error: "notChargeable" }, { status: 409, headers: CORS });
    }

    const { session, env } = await createThreeDsSession();
    const { tax_id: _taxId, ...customer } = buildCustomer(order.code, {
      name: order.customerName ?? undefined,
      phone: order.customerPhone ?? undefined,
    });
    void _taxId;
    return Response.json(
      { session, env, amount: threeDsAmountCents(Number(order.total)), customer },
      { headers: CORS },
    );
  } catch (e) {
    console.error("[pagbank/3ds-session] falha:", e instanceof Error ? e.message : String(e));
    return Response.json({ error: "unavailable" }, { status: 502, headers: CORS });
  }
}
