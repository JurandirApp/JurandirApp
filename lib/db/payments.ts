import { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getProviderByName } from "@/lib/payments";
import type { CardBrickData, ChargeStatus } from "@/lib/payments/types";
import { enqueuePrintJob } from "./print";

/** Sincroniza o status do recebedor Pagar.me (webhook recipient.updated). */
export async function syncPagarmeRecipientStatus(
  recipientId: string,
  status: string,
): Promise<void> {
  await prisma.establishment.updateMany({
    where: { pagarmeRecipientId: recipientId },
    data: { pagarmeRecipientStatus: status },
  });
}

/** Flip idempotente do pedido para IN_PRODUCTION quando a cobrança foi paga. */
export async function confirmChargePaid(gatewayChargeId: string): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { gatewayChargeId },
    include: { order: { select: { id: true, status: true } } },
  });
  if (!payment?.order) return;
  if (
    payment.order.status === OrderStatus.IN_PRODUCTION ||
    payment.order.status === OrderStatus.DELIVERED
  ) {
    return; // idempotente
  }
  await prisma.$transaction([
    prisma.order.update({
      where: { id: payment.order.id },
      data: { status: OrderStatus.IN_PRODUCTION },
    }),
    prisma.payment.update({ where: { id: payment.id }, data: { confirmedAt: new Date() } }),
  ]);
  await enqueuePrintJob(payment.order.id);
}

/** Consulta o gateway e confirma se pago. Usado pela reconciliação (dev) e pelo webhook do MP. */
export async function reconcileByChargeId(gatewayChargeId: string): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { gatewayChargeId },
    include: { order: { include: { establishment: true } } },
  });
  if (!payment?.order || payment.order.status !== OrderStatus.AWAITING_PAYMENT) return;
  const status = await getProviderByName(payment.provider ?? "MERCADO_PAGO").getChargeStatus(
    payment.order.establishment,
    gatewayChargeId,
  );
  if (status === "paid") await confirmChargePaid(gatewayChargeId);
}

export async function reconcileOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { establishment: true, payment: true, splitShares: true },
  });
  if (!order || order.status !== OrderStatus.AWAITING_PAYMENT) return;
  // Split real: reconcilia cada parte (Pix por pessoa).
  if (order.splitShares.length > 0) {
    await reconcileSplitShares(order);
    return;
  }
  if (!order.payment) return;
  // Pix (ou cobrança com id já conhecido): reconcilia pelo id do gateway.
  if (order.payment.gatewayChargeId) {
    await reconcileByChargeId(order.payment.gatewayChargeId);
    return;
  }
  // Checkout Pro (cartão): o id do pagamento só existe depois que o cliente paga —
  // procura pelo external_reference (código do pedido) e confirma se aprovado.
  const provider = getProviderByName(order.payment.provider ?? "MERCADO_PAGO");
  if (!provider.findApprovedPayment) return;
  const found = await provider.findApprovedPayment(order.establishment, order.code);
  if (found) {
    await prisma.payment.update({
      where: { id: order.payment.id },
      data: { gatewayChargeId: found.paymentId },
    });
    await confirmChargePaid(found.paymentId);
  }
}

/** Reconcilia as partes de um pedido dividido: consulta cada cobrança Pix, marca
 *  as pagas e, quando TODAS caem, o pedido vai pra produção (+ impressão). */
async function reconcileSplitShares(
  order: Prisma.OrderGetPayload<{ include: { establishment: true; splitShares: true } }>,
): Promise<void> {
  let changed = false;
  for (const sh of order.splitShares) {
    if (sh.paid || !sh.gatewayChargeId) continue;
    const status = await getProviderByName(sh.provider ?? "PAGARME").getChargeStatus(
      order.establishment,
      sh.gatewayChargeId,
    );
    if (status === "paid") {
      await prisma.splitShare.update({
        where: { id: sh.id },
        data: { paid: true, paidAt: new Date() },
      });
      changed = true;
    }
  }
  if (!changed) return;
  const remaining = await prisma.splitShare.count({
    where: { orderId: order.id, paid: false },
  });
  if (remaining === 0) {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.IN_PRODUCTION },
    });
    await enqueuePrintJob(order.id);
  }
}

/** Extrai um motivo legível de um erro do MP (ex.: 400 na criação do pagamento). */
function mpErrorDetail(e: unknown): string {
  if (!(e instanceof Error)) return "erro";
  const m = e.message.match(/MP \d+: ([\s\S]+)$/); // MpError = `MP <status>: <body>`
  if (!m) return e.message.slice(0, 140);
  try {
    const j = JSON.parse(m[1]) as {
      message?: string;
      cause?: { description?: string; code?: string }[];
    };
    return j.cause?.[0]?.description || j.message || m[1].slice(0, 140);
  } catch {
    return m[1].slice(0, 140);
  }
}

/** Cobra o cartão do pedido via token (checkout transparente / Payment Brick).
 *  Aprovado → confirma e vai pra produção. Devolve o status pra UI reagir. */
export async function payOrderWithCard(
  orderId: string,
  brick: CardBrickData,
): Promise<{ status: ChargeStatus; statusDetail?: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { establishment: true, payment: true },
  });
  if (!order?.payment || order.status !== OrderStatus.AWAITING_PAYMENT) {
    return { status: "failed" };
  }
  const provider = getProviderByName(order.payment.provider ?? "MERCADO_PAGO");
  if (!provider.createCardPayment) return { status: "failed" };
  let res;
  try {
    res = await provider.createCardPayment({
      est: order.establishment,
      reference: order.code,
      total: Number(order.total),
      platformFee: Number(order.platformFee),
      description: `Pedido ${order.code}`,
      brick,
    });
  } catch (e) {
    // Erro do MP (ex.: token inválido / conta divergente) → surfacia o motivo.
    return { status: "failed", statusDetail: mpErrorDetail(e) };
  }
  // Guarda o id do pagamento (permite reconciliar pending depois, se for o caso).
  await prisma.payment.update({
    where: { id: order.payment.id },
    data: { gatewayChargeId: res.chargeId },
  });
  if (res.status === "paid") await confirmChargePaid(res.chargeId);
  return { status: res.status, statusDetail: res.statusDetail };
}

/** Cobra o pedido via carteira nativa (Google Pay / Apple Pay) usando o token do
 *  app. Aprovado → confirma e vai pra produção. */
export async function payOrderWithWallet(
  orderId: string,
  walletType: "google_pay" | "apple_pay",
  token: string,
): Promise<{ status: ChargeStatus; statusDetail?: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { establishment: true, payment: true },
  });
  if (!order?.payment || order.status !== OrderStatus.AWAITING_PAYMENT) {
    return { status: "failed" };
  }
  const provider = getProviderByName(order.payment.provider ?? "PAGARME");
  if (!provider.createWalletPayment) return { status: "failed", statusDetail: "gateway sem wallet" };
  let res;
  try {
    res = await provider.createWalletPayment({
      est: order.establishment,
      reference: order.code,
      total: Number(order.total),
      platformFee: Number(order.platformFee),
      description: `Pedido ${order.code}`,
      walletType,
      token,
    });
  } catch (e) {
    return { status: "failed", statusDetail: e instanceof Error ? e.message.slice(0, 160) : "erro" };
  }
  await prisma.payment.update({
    where: { id: order.payment.id },
    data: { gatewayChargeId: res.chargeId },
  });
  if (res.status === "paid") await confirmChargePaid(res.chargeId);
  return { status: res.status, statusDetail: res.statusDetail };
}

/** Cria a preferência de Checkout Pro para um pedido de cartão e devolve a URL de
 *  redirecionamento. Null se não for um pedido de cartão via gateway. */
export async function createCardCheckout(orderId: string): Promise<string | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { establishment: true, payment: true },
  });
  if (!order?.payment || order.status !== OrderStatus.AWAITING_PAYMENT) return null;
  if (order.payment.method !== "CREDIT" && order.payment.method !== "DEBIT") return null;
  const provider = getProviderByName(order.payment.provider ?? "MERCADO_PAGO");
  if (!provider.createCheckoutPreference) return null;
  const pref = await provider.createCheckoutPreference({
    est: order.establishment,
    reference: order.code,
    total: Number(order.total),
    platformFee: Number(order.platformFee),
    items: [{ title: `Pedido ${order.code}`, quantity: 1, unitPrice: Number(order.total) }],
    description: `Pedido ${order.code}`,
    method: order.payment.method as "CREDIT" | "DEBIT",
  });
  return pref.checkoutUrl;
}
