import { handleTunaPaymentWebhook } from "@/lib/db/tuna-webhook";
import { isDefiniteGatewayFailure } from "@/lib/payments/gateway-errors";
import {
  parseTunaPaymentNotification,
  tunaErrorSummary,
  tunaWebhookAuth,
} from "@/lib/payments/tuna-webhook";

const ok = () => new Response("ok", { status: 200 });

/** Webhook de pagamento da Tuna. Não é assinado: só um segredo Bearer opcional
 *  (TUNA_WEBHOOK_SECRET / _TEST — o que bater diz o ambiente). O corpo nunca
 *  marca pago: só dispara a re-consulta do Payment/Status pelo paymentKey.
 *  Log só com paymentKey/statusId. Erro transitório ao reconciliar → 500 (a
 *  Tuna re-tenta); recusa definitiva da Tuna e o resto → 200; segredo errado → 401. */
export async function POST(req: Request): Promise<Response> {
  const env = tunaWebhookAuth(req.headers.get("authorization"), {
    prod: process.env.TUNA_WEBHOOK_SECRET,
    test: process.env.TUNA_WEBHOOK_SECRET_TEST,
  });
  if (env === "unauthorized") {
    console.warn("[tuna/webhook] não autorizado");
    return new Response("unauthorized", { status: 401 });
  }

  let n: ReturnType<typeof parseTunaPaymentNotification>;
  try {
    const raw = await req.text();
    n = parseTunaPaymentNotification(raw ? JSON.parse(raw) : null);
  } catch {
    n = null;
  }
  if (!n) {
    console.warn("[tuna/webhook] corpo inválido ou sem paymentKey");
    return ok();
  }
  console.log("[tuna/webhook]", JSON.stringify({ env, paymentKey: n.paymentKey, statusId: n.statusId }));

  try {
    const outcome = await handleTunaPaymentWebhook(n.paymentKey, n.partnerUniqueId);
    console.log("[tuna/webhook] resultado", n.paymentKey, outcome);
    return ok();
  } catch (e) {
    const transient = !isDefiniteGatewayFailure(e);
    console.error(
      "[tuna/webhook] falha ao reconciliar",
      n.paymentKey,
      tunaErrorSummary(e),
      transient ? "(transitório → 500)" : "(definitivo → 200)",
    );
    return transient ? new Response("retry", { status: 500 }) : ok();
  }
}
