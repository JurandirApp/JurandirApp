import { applyTunaMerchantWebhook } from "@/lib/db/tuna-webhook";
import {
  isTunaPayoutCode,
  parseTunaMerchantNotification,
  tunaErrorSummary,
  tunaWebhookAuth,
} from "@/lib/payments/tuna-webhook";

const ok = () => new Response("ok", { status: 200 });

/** Webhook de merchant da Tuna (cadastro do bar + repasses). Segredo Bearer
 *  opcional próprio (TUNA_MERCHANT_WEBHOOK_SECRET / _TEST) — o que bater diz o
 *  ambiente, e notificação de outro ambiente que não o do cadastro é ignorada.
 *  Log só com externalId/message.code/serviceId (nunca dados bancários nem a
 *  mensagem da Tuna). Falha de banco → 500 (a Tuna re-tenta; não perde a
 *  aprovação); o resto → 200; segredo errado → 401. */
export async function POST(req: Request): Promise<Response> {
  const env = tunaWebhookAuth(req.headers.get("authorization"), {
    prod: process.env.TUNA_MERCHANT_WEBHOOK_SECRET,
    test: process.env.TUNA_MERCHANT_WEBHOOK_SECRET_TEST,
  });
  if (env === "unauthorized") {
    console.warn("[tuna/merchant] não autorizado");
    return new Response("unauthorized", { status: 401 });
  }

  let n: ReturnType<typeof parseTunaMerchantNotification>;
  try {
    const raw = await req.text();
    n = parseTunaMerchantNotification(raw ? JSON.parse(raw) : null);
  } catch {
    n = null;
  }
  if (!n) {
    console.warn("[tuna/merchant] corpo inválido");
    return ok();
  }
  const serviceId =
    typeof n.serviceId === "number" || typeof n.serviceId === "string" ? n.serviceId : null;
  console.log(
    "[tuna/merchant]",
    JSON.stringify({ env, externalId: n.externalId, code: n.messageCode, serviceId }),
  );

  // Repasse ao bar: só registra (não muda o cadastro).
  if (isTunaPayoutCode(n.messageCode)) return ok();
  if (!n.externalId) return ok();

  try {
    const outcome = await applyTunaMerchantWebhook({
      env,
      externalId: n.externalId,
      serviceId: n.serviceId,
      serviceName: n.serviceName,
      messageCode: n.messageCode,
      kycLevel: n.kycLevel,
    });
    console.log("[tuna/merchant] resultado", n.externalId, outcome);
    return ok();
  } catch (e) {
    console.error("[tuna/merchant] falha ao aplicar", n.externalId, tunaErrorSummary(e));
    return new Response("retry", { status: 500 });
  }
}
