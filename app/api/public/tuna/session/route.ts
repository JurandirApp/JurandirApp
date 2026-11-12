import { prisma } from "@/lib/db/prisma";
import { getTunaCardsEnabled } from "@/lib/db/settings";
import {
  buildTunaCustomer,
  createTunaSession,
  ensureTunaMode,
  TunaError,
  tunaChargeFailed,
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
 * Retentativa: pedido Tuna cuja cobrança anterior foi RECUSADA na Tuna (Status
 * pelo paymentKey) abre sessão de novo — o cliente tenta outro cartão no mesmo
 * pedido. Cobrança paga/pendente/sem resposta → 409 (não cobra de novo).
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
    // Cobrança anterior conta como "viva" salvo se a Tuna diz que foi recusada
    // (só consulta pedido de cartão Tuna ainda aguardando pagamento).
    const chargeId = order?.payment?.gatewayChargeId ?? null;
    const retryable =
      !!chargeId &&
      order?.status === "AWAITING_PAYMENT" &&
      order.payment?.provider === "TUNA" &&
      (order.payment.method === "CREDIT" || order.payment.method === "DEBIT") &&
      (await tunaChargeFailed(chargeId));
    const decision = decideTunaSession(
      order
        ? {
            status: order.status,
            method: order.payment?.method ?? null,
            provider: order.payment?.provider ?? null,
            hasGatewayCharge: !!chargeId && !retryable,
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
