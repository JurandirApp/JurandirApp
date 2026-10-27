import { prisma } from "@/lib/db/prisma";
import { reconcileByChargeId, reconcileOrder } from "@/lib/db/payments";
import { ensureTunaMode, tunaPost } from "@/lib/payments/tuna";
import {
  isTunaAttachCandidate,
  nextTunaStatus,
  shouldAttachTunaPayment,
  tunaServiceGroup,
  type TunaWebhookEnv,
} from "@/lib/payments/tuna-webhook";

// Webhooks da Tuna — parte com banco. Nunca marca pago pelo corpo: tudo passa
// pelo re-fetch autoritativo (Payment/Status) via reconcileByChargeId.
// Erros propagam: a rota decide 500 (transitório, a Tuna re-tenta) × 200.

export type TunaPaymentOutcome = "reconciled" | "share" | "attached" | "otherProvider" | "unknown";

/** Webhook de pagamento. Ordem:
 *  1. `Payment.gatewayChargeId === paymentKey` (Tuna) → reconcilia.
 *  2. Parte de conta dividida (`SplitShare.gatewayChargeId`) → reconcilia o
 *     pedido (reconcileOrder já trata as partes).
 *  3. Cobrança INCERTA (Init sem resposta, `gatewayChargeId` nulo): acha o
 *     pedido pelo código (`partnerUniqueId` do corpo), consulta o Status NA
 *     TUNA e só anexa o paymentKey se a Tuna confirmar o mesmo pedido. */
export async function handleTunaPaymentWebhook(
  paymentKey: string,
  partnerUniqueId: string,
): Promise<TunaPaymentOutcome> {
  const payment = await prisma.payment.findUnique({
    where: { gatewayChargeId: paymentKey },
    select: { provider: true },
  });
  if (payment) {
    if (payment.provider !== "TUNA") return "otherProvider";
    await reconcileByChargeId(paymentKey);
    return "reconciled";
  }

  const share = await prisma.splitShare.findFirst({
    where: { gatewayChargeId: paymentKey, provider: "TUNA" },
    select: { orderId: true },
  });
  if (share) {
    await reconcileOrder(share.orderId);
    return "share";
  }

  if (!partnerUniqueId) return "unknown";
  const order = await prisma.order.findUnique({
    where: { code: partnerUniqueId },
    select: {
      code: true,
      status: true,
      payment: { select: { id: true, provider: true, gatewayChargeId: true } },
    },
  });
  // Só consulta a Tuna se houver um pedido Tuna pendente sem cobrança gravada.
  if (!isTunaAttachCandidate(order)) return "unknown";
  await ensureTunaMode();
  const status = await tunaPost<unknown>("engine", "/api/Payment/Status", { paymentKey });
  if (!shouldAttachTunaPayment(order, status, paymentKey)) return "unknown";
  // Guard no null: se outro fluxo (retentativa/reconciliação) gravou antes, não sobrescreve.
  const attached = await prisma.payment.updateMany({
    where: { id: order.payment.id, gatewayChargeId: null },
    data: { gatewayChargeId: paymentKey },
  });
  if (attached.count === 0) return "unknown";
  await reconcileByChargeId(paymentKey);
  return "attached";
}

export type TunaMerchantOutcome = "updated" | "unchanged" | "notfound" | "otherEnv";

/** Webhook de cadastro do bar (uma notificação por provedor de split). Acha o
 *  bar pelo `externalId`; ignora se o ambiente do segredo não é o do cadastro;
 *  atualiza o status do grupo (Pix/cartão) e o `kycLevel` quando vier. */
export async function applyTunaMerchantWebhook(n: {
  env: Exclude<TunaWebhookEnv, "unauthorized">;
  externalId: string;
  serviceId: unknown;
  serviceName: unknown;
  messageCode: string;
  kycLevel: string | null;
}): Promise<TunaMerchantOutcome> {
  const est = await prisma.establishment.findFirst({
    where: { tunaMerchantExternalId: n.externalId },
    select: { id: true, tunaMerchantEnv: true, tunaPixStatus: true, tunaCardStatus: true, tunaKycLevel: true },
  });
  if (!est) return "notfound";
  if (n.env !== "any" && n.env !== est.tunaMerchantEnv) return "otherEnv";

  let changed = false;
  const group = tunaServiceGroup(n.serviceId, n.serviceName);
  if (group) {
    const pix = group === "pix";
    const current = pix ? est.tunaPixStatus : est.tunaCardStatus;
    const next = nextTunaStatus(current, n.messageCode);
    if (next !== current) {
      const data = pix ? { tunaPixStatus: next } : { tunaCardStatus: next };
      if (next === "active") {
        await prisma.establishment.update({ where: { id: est.id }, data });
      } else {
        // Recusa/bloqueio/erro nunca derruba um grupo que outro provedor já
        // aprovou — nem numa corrida entre duas notificações simultâneas.
        const notActive = pix
          ? [{ tunaPixStatus: null }, { tunaPixStatus: { not: "active" } }]
          : [{ tunaCardStatus: null }, { tunaCardStatus: { not: "active" } }];
        await prisma.establishment.updateMany({ where: { id: est.id, OR: notActive }, data });
      }
      changed = true;
    }
  }
  if (n.kycLevel !== null && n.kycLevel !== est.tunaKycLevel) {
    await prisma.establishment.update({ where: { id: est.id }, data: { tunaKycLevel: n.kycLevel } });
    changed = true;
  }
  return changed ? "updated" : "unchanged";
}
