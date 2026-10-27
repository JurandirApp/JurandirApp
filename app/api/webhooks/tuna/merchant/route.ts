import { applyTunaMerchantWebhook } from "@/lib/db/tuna-webhook";
import { ensureTunaMode } from "@/lib/payments/tuna";
import {
  isSafeTunaId,
  isTunaPayoutCode,
  parseTunaMerchantNotification,
  tunaErrorSummary,
  tunaWebhookAuth,
} from "@/lib/payments/tuna-webhook";

const ok = () => new Response("ok", { status: 200 });

/** Webhook de merchant da Tuna (cadastro do bar + repasses). Segredo Bearer
 *  opcional próprio (TUNA_MERCHANT_WEBHOOK_SECRET / _TEST) — o que bater diz o
 *  ambiente, e notificação de outro ambiente que não o do cadastro é ignorada.
 *  O corpo NÃO é re-consultado (não há API pra isso) e "active" nunca cai: por
 *  isso, sem segredo configurado, só aceita em TESTE (homologação) — em
 *  PRODUÇÃO falha fechado (401).
 *  Log só com externalId/message.code/serviceId (nunca dados bancários nem a
 *  mensagem da Tuna). Falha de banco (inclui ler o modo da Tuna) → 500 (a Tuna
 *  re-tenta; não perde a aprovação); o resto → 200; segredo errado → 401. */
export async function POST(req: Request): Promise<Response> {
  const env = tunaWebhookAuth(req.headers.get("authorization"), {
    prod: process.env.TUNA_MERCHANT_WEBHOOK_SECRET,
    test: process.env.TUNA_MERCHANT_WEBHOOK_SECRET_TEST,
  });
  if (env === "unauthorized") {
    console.warn("[tuna/merchant] não autorizado");
    return new Response("unauthorized", { status: 401 });
  }
  if (env === "any") {
    let mode: Awaited<ReturnType<typeof ensureTunaMode>>;
    try {
      mode = await ensureTunaMode();
    } catch (e) {
      // Sem saber o modo não dá pra decidir o fail closed: 500, a Tuna re-tenta.
      console.error("[tuna/merchant] modo da Tuna indisponível", JSON.stringify({ error: tunaErrorSummary(e) }));
      return new Response("retry", { status: 500 });
    }
    if (mode === "PRODUCTION") {
      console.warn("[tuna/merchant] sem segredo configurado em produção");
      return new Response("unauthorized", { status: 401 });
    }
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
  const { externalId } = n;
  if (externalId !== "" && !isSafeTunaId(externalId)) {
    console.warn("[tuna/merchant] id inválido"); // não ecoa o valor (controlado por quem posta)
    return ok();
  }
  const serviceId =
    typeof n.serviceId === "number" || typeof n.serviceId === "string"
      ? String(n.serviceId).slice(0, 16)
      : null;
  console.log(
    "[tuna/merchant]",
    JSON.stringify({ env, externalId, code: n.messageCode.slice(0, 64), serviceId }),
  );

  // Repasse ao bar: só registra (não muda o cadastro).
  if (isTunaPayoutCode(n.messageCode)) return ok();
  if (!externalId) return ok();

  try {
    const outcome = await applyTunaMerchantWebhook({
      env,
      externalId,
      serviceId: n.serviceId,
      serviceName: n.serviceName,
      messageCode: n.messageCode,
      kycLevel: n.kycLevel,
    });
    console.log("[tuna/merchant] resultado", JSON.stringify({ externalId, outcome }));
    return ok();
  } catch (e) {
    console.error("[tuna/merchant] falha ao aplicar", JSON.stringify({ externalId, error: tunaErrorSummary(e) }));
    return new Response("retry", { status: 500 });
  }
}
