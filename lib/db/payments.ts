import { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getProviderByName, resolveWalletGateway } from "@/lib/payments";
import type { CardBillingAddress, CardBrickData, ChargeStatus } from "@/lib/payments/types";
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

/** Decisão PURA (testável) do fluxo resiliente de cobrança, dado o estado do
 *  pedido:
 *  - `notfound`: pedido não existe.
 *  - `settled-paid`: já saiu de AWAITING_PAYMENT (pago/em produção).
 *  - `reconcile`: já tem cobrança no gateway (gatewayChargeId) → reconcilia, não
 *    cobra de novo (evita duplicar).
 *  - `charge`: ainda precisa cobrar.
 *
 *  ⚠️ O createOrder cria uma Payment PLACEHOLDER (gatewayChargeId null) que SEMPRE
 *  existe — por isso a decisão olha `hasGatewayCharge`, NÃO "tem payment". */
export function decideOrderCharge(
  o: { status: OrderStatus; hasGatewayCharge: boolean } | null,
): "notfound" | "settled-paid" | "reconcile" | "charge" {
  if (!o) return "notfound";
  if (o.status !== OrderStatus.AWAITING_PAYMENT) return "settled-paid";
  return o.hasGatewayCharge ? "reconcile" : "charge";
}

/** Fluxo resiliente do app: o pedido é criado ANTES de cobrar, então o app fica
 *  com o id e nunca trava. Decide se ainda precisamos cobrar (`charge`) ou se já
 *  está resolvido — pago, ou com cobrança em andamento (`settled`) — para NÃO
 *  cobrar o mesmo pedido duas vezes numa retentativa/timeout. */
export async function resolveChargeableOrder(
  orderId: string,
): Promise<
  | { kind: "charge"; id: string }
  | { kind: "settled"; status: "paid" | "pending" }
  | { kind: "notfound" }
> {
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, payment: { select: { gatewayChargeId: true } } },
  });
  const decision = decideOrderCharge(
    o ? { status: o.status, hasGatewayCharge: !!o.payment?.gatewayChargeId } : null,
  );
  if (decision === "notfound") return { kind: "notfound" };
  if (decision === "settled-paid") return { kind: "settled", status: "paid" };
  if (decision === "reconcile") {
    await reconcileOrder(orderId);
    const again = await prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    const paid = !!again && again.status !== OrderStatus.AWAITING_PAYMENT;
    return { kind: "settled", status: paid ? "paid" : "pending" };
  }
  return { kind: "charge", id: o!.id };
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

/** Cobra o cartão do pedido via `card_token` da tokenização (Pagar.me v5). O CPF
 *  vem por parâmetro (não é gravado no Order). Aprovado → confirma e vai pra
 *  produção; devolve o status pra UI reagir. */
export async function payOrderWithCardToken(
  orderId: string,
  cardToken: string,
  installments: number,
  method: "credit" | "debit",
  customerDocument?: string,
  billing?: CardBillingAddress,
): Promise<{ status: ChargeStatus; statusDetail?: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { establishment: true, payment: true },
  });
  if (!order?.payment || order.status !== OrderStatus.AWAITING_PAYMENT) {
    return { status: "failed" };
  }
  const provider = getProviderByName(order.payment.provider ?? "PAGARME");
  if (!provider.createCardTokenPayment) return { status: "failed" };
  let res;
  try {
    res = await provider.createCardTokenPayment({
      est: order.establishment,
      reference: order.code,
      total: Number(order.total),
      platformFee: Number(order.platformFee),
      description: `Pedido ${order.code}`,
      cardToken,
      installments,
      method,
      customerName: order.customerName ?? undefined,
      customerDocument: customerDocument ?? undefined,
      customerPhone: order.customerPhone ?? undefined,
      billing,
    });
  } catch (e) {
    return { status: "failed", statusDetail: e instanceof Error ? e.message : String(e) };
  }
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
  // O pedido nasce como CREDIT (provider = gateway do crédito); a carteira tem
  // gateway próprio, então cobra por ele e grava no payment (reconcile/webhook).
  const gateway = resolveWalletGateway(order.establishment, walletType);
  const provider = getProviderByName(gateway);
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
    data: { gatewayChargeId: res.chargeId, provider: gateway },
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
