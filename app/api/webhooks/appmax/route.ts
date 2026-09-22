import { reconcileByChargeId } from "@/lib/db/payments";

type AppmaxEvent = {
  event?: string;
  event_type?: string; // order | customer | payment | subscription
  data?: { order_id?: number | string };
};

/** Webhook da Appmax. A Appmax NÃO assina o webhook (sem HMAC/token) — a
 *  segurança vem do **re-fetch autoritativo** em `reconcileByChargeId`: um
 *  atacante não consegue "marcar pago", porque o status é re-consultado na
 *  própria Appmax (`GET /v1/orders/{id}`). O `data.order_id` é a chave de volta
 *  pro nosso pedido (gravamos o order_id da Appmax como `gatewayChargeId`).
 *  Responder 200 rápido (<5s); o processamento é idempotente. */
export async function POST(req: Request): Promise<Response> {
  try {
    const raw = await req.text();
    const ev = (raw ? JSON.parse(raw) : {}) as AppmaxEvent;
    const orderId = ev.data?.order_id;
    if (orderId != null) await reconcileByChargeId(String(orderId));
  } catch {
    // ignora corpo inválido — sempre 200 pra Appmax não re-tentar em loop.
  }
  return new Response("ok", { status: 200 });
}
