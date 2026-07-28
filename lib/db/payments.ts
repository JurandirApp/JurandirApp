import { OrderStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { getProvider } from "@/lib/payments";
import { enqueuePrintJob } from "./print";

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
  const status = await getProvider().getChargeStatus(
    payment.order.establishment,
    gatewayChargeId,
  );
  if (status === "paid") await confirmChargePaid(gatewayChargeId);
}

export async function reconcileOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { establishment: true, payment: true },
  });
  if (!order?.payment || order.status !== OrderStatus.AWAITING_PAYMENT) return;
  // Pix (ou cobrança com id já conhecido): reconcilia pelo id do gateway.
  if (order.payment.gatewayChargeId) {
    await reconcileByChargeId(order.payment.gatewayChargeId);
    return;
  }
  // Checkout Pro (cartão): o id do pagamento só existe depois que o cliente paga —
  // procura pelo external_reference (código do pedido) e confirma se aprovado.
  const provider = getProvider();
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

/** Cria a preferência de Checkout Pro para um pedido de cartão e devolve a URL de
 *  redirecionamento. Null se não for um pedido de cartão via gateway. */
export async function createCardCheckout(orderId: string): Promise<string | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { establishment: true, payment: true },
  });
  if (!order?.payment || order.status !== OrderStatus.AWAITING_PAYMENT) return null;
  if (order.payment.method !== "CREDIT" && order.payment.method !== "DEBIT") return null;
  const provider = getProvider();
  if (!provider.createCheckoutPreference) return null;
  const pref = await provider.createCheckoutPreference({
    est: order.establishment,
    reference: order.code,
    total: Number(order.total),
    platformFee: Number(order.platformFee),
    items: [{ title: `Pedido ${order.code}`, quantity: 1, unitPrice: Number(order.total) }],
    description: `Pedido ${order.code}`,
  });
  return pref.checkoutUrl;
}
