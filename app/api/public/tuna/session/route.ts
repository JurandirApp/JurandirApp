import { prisma } from "@/lib/db/prisma";
import { getTunaCardsEnabled } from "@/lib/db/settings";
import {
  buildTunaCustomer,
  createTunaSession,
  ensureTunaMode,
  TunaError,
  tunaSafeMessage,
  tunaTokenUrl,
} from "@/lib/payments/tuna";
import { decideTunaSession } from "@/lib/payments/tuna-readiness";
import { tunaErrorSummary } from "@/lib/payments/tuna-webhook";

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
 * POST /api/public/tuna/session
 * Body: { orderId } de um pedido de CARTÃO (crédito/débito) Tuna ainda não cobrado.
 * Cria a sessão de tokenização (Token/NewSession, com o app token — só aqui no
 * servidor) e devolve `{ sessionId, tokenUrl, env }`: o app/site manda o cartão
 * direto pra `<tokenUrl>/api/Token/Generate` e depois cobra em
 * `/api/public/orders/card` com `tuna.sessionId`. O `sessionId` nunca é logado.
 */
export async function POST(req: Request): Promise<Response> {
  let orderId = "";
  try {
    const body = (await req.json()) as { orderId?: unknown };
    orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
  } catch {
    /* orderId vazio -> notfound */
  }

  try {
    const cardsEnabled = await getTunaCardsEnabled();
    const order = orderId
      ? await prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } })
      : null;
    const decision = decideTunaSession(
      order
        ? {
            status: order.status,
            method: order.payment?.method ?? null,
            provider: order.payment?.provider ?? null,
            hasGatewayCharge: !!order.payment?.gatewayChargeId,
          }
        : null,
      cardsEnabled,
    );
    if (decision === "notfound" || !order) {
      return Response.json({ error: "orderNotFound" }, { status: 404, headers: CORS });
    }
    if (decision === "notChargeable") {
      return Response.json({ error: "notChargeable" }, { status: 409, headers: CORS });
    }
    if (decision === "cardsDisabled") {
      return Response.json({ error: "cardsDisabled" }, { status: 403, headers: CORS });
    }

    const mode = await ensureTunaMode();
    const tokenUrl = tunaTokenUrl();
    // Mesmo customer (id = código, e-mail do pedido) que o Init da cobrança usa.
    const customer = buildTunaCustomer(order.code, { name: order.customerName ?? undefined }, mode);
    const sessionId = await createTunaSession({ id: customer.id, email: customer.email });
    return Response.json({ sessionId, tokenUrl, env: mode }, { headers: CORS });
  } catch (e) {
    const why = e instanceof TunaError ? tunaSafeMessage(e) : tunaErrorSummary(e);
    console.error("[tuna/session] falha:", why);
    return Response.json({ error: "unavailable" }, { status: 502, headers: CORS });
  }
}
