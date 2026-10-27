import { handleTunaPaymentWebhook } from "@/lib/db/tuna-webhook";
import { ensureTunaMode } from "@/lib/payments/tuna";
import {
  isSafeTunaId,
  parseTunaPaymentNotification,
  tunaErrorSummary,
  tunaWebhookAuth,
  tunaWebhookShouldRetry,
} from "@/lib/payments/tuna-webhook";

const ok = () => new Response("ok", { status: 200 });

/** Webhook de pagamento da Tuna. Não é assinado: só um segredo Bearer opcional
 *  (TUNA_WEBHOOK_SECRET / _TEST — o que bater diz o ambiente). O corpo nunca
 *  marca pago: só dispara a re-consulta do Payment/Status pelo paymentKey.
 *  Ids do corpo validados (formato curto) antes de usar/logar; log só com
 *  paymentKey/statusId. Erro transitório ao reconciliar (inclui 408/429 da
 *  Tuna e o modo da Tuna indisponível) → 500 (a Tuna re-tenta); notificação de
 *  outro ambiente que não o modo atual → 503 (re-entrega depois); recusa
 *  definitiva e o resto → 200; segredo errado → 401. */
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
  if (!isSafeTunaId(n.paymentKey) || (n.partnerUniqueId !== "" && !isSafeTunaId(n.partnerUniqueId))) {
    console.warn("[tuna/webhook] id inválido"); // não ecoa o valor (controlado por quem posta)
    return ok();
  }
  const { paymentKey } = n;
  console.log("[tuna/webhook]", JSON.stringify({ env, paymentKey, statusId: n.statusId.slice(0, 8) }));

  // Notificação de um ambiente com o modo no outro: a re-consulta usaria a
  // credencial do modo atual (a cobrança é da outra conta). 503 SEM consultar a
  // Tuna — ela re-entrega, e a notificação é processada quando o modo voltar.
  // Modo indisponível (banco fora) → 500, a Tuna re-tenta.
  if (env !== "any") {
    let mode: Awaited<ReturnType<typeof ensureTunaMode>>;
    try {
      mode = await ensureTunaMode();
    } catch (e) {
      console.error("[tuna/webhook] modo da Tuna indisponível", JSON.stringify({ paymentKey, error: tunaErrorSummary(e) }));
      return new Response("retry", { status: 500 });
    }
    if (env !== mode) {
      console.warn("[tuna/webhook] ambiente da notificação ≠ modo atual", JSON.stringify({ env, mode, paymentKey }));
      return new Response("retry", { status: 503 });
    }
  }

  try {
    const outcome = await handleTunaPaymentWebhook(paymentKey, n.partnerUniqueId);
    console.log("[tuna/webhook] resultado", JSON.stringify({ paymentKey, outcome }));
    return ok();
  } catch (e) {
    const retry = tunaWebhookShouldRetry(e);
    console.error(
      "[tuna/webhook] falha ao reconciliar",
      JSON.stringify({ paymentKey, error: tunaErrorSummary(e), retry }),
    );
    return retry ? new Response("retry", { status: 500 }) : ok();
  }
}
