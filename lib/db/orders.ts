import { Prisma, OrderStatus, type PaymentMethod } from "@prisma/client";
import { prisma } from "./prisma";
import {
  GATEWAY_FEE_PCT,
  computeTotals,
  makeOrderCode,
  splitShares,
  splitToEstablishment,
} from "../domain/pricing";
import { orderCreateSchema, type OrderCreateInput } from "../validation";
import { getProvider, resolveGateway, type PixCharge } from "@/lib/payments";
import { enqueuePrintJob } from "./print";

const ORDER_INCLUDE = { items: true, payment: true, splitShares: true } as const;

async function uniqueCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = makeOrderCode();
    const exists = await prisma.order.findUnique({ where: { code } });
    if (!exists) return code;
  }
  throw new Error("could not generate a unique order code");
}

export async function createOrder(input: OrderCreateInput) {
  const data = orderCreateSchema.parse(input);
  const est = await prisma.establishment.findUnique({ where: { id: data.establishmentId } });
  if (!est) throw new Error("establishment not found");

  const subtotal = data.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const { platformFee, serviceFee, total } = computeTotals(
    subtotal,
    est.platformFeePct,
    est.serviceFeePct,
  );
  const code = await uniqueCode();

  const payment = data.payment;
  const amounts =
    payment.kind === "split" ? splitShares(total, payment.shares.length) : [];

  // Gateway FIXO por método; toda cobrança cheia (Pix/cartão) é real.
  //  - Pix (cheio)  → cobrança direta (QR na hora, aqui).
  //  - Split        → uma cobrança Pix POR PESSOA (compartilhável); o pedido vai
  //    pra produção quando TODAS as partes forem pagas (reconcile).
  //  - Cartão (crédito/débito) → Checkout Pro; aqui o pedido só nasce
  //    AWAITING_PAYMENT e a preferência/URL é criada na action (createCardCheckout).
  const isPixGateway = payment.kind === "full" && payment.method === "PIX";
  const isCardGateway =
    payment.kind === "full" &&
    (payment.method === "CREDIT" || payment.method === "DEBIT");
  const isSplit = payment.kind === "split";
  const useGateway = isPixGateway || isCardGateway;
  // Gateway resolvido pelo método escolhido (split é sempre Pix).
  const providerName =
    payment.kind === "full" ? resolveGateway(est, payment.method) : null;
  const splitProvider = isSplit ? resolveGateway(est, "PIX") : null;

  let pix: PixCharge | null = null;
  if (isPixGateway) {
    pix = await getProvider(est, "PIX").createPixCharge({
      est,
      reference: code,
      total,
      platformFee,
      customerName: data.customerName ?? undefined,
      description: `Pedido ${code}`,
    });
  }

  // Split: uma cobrança Pix por parte (o valor de cada pessoa).
  let shareCharges: (PixCharge | null)[] = [];
  if (isSplit) {
    const provider = getProvider(est, "PIX");
    shareCharges = await Promise.all(
      amounts.map((amt, i) =>
        provider
          .createPixCharge({
            est,
            reference: `${code}-P${i + 1}`,
            total: amt,
            platformFee: 0,
            customerName: data.customerName ?? undefined,
            description: `Pedido ${code} — parte ${i + 1}/${amounts.length}`,
          })
          .catch(() => null),
      ),
    );
  }

  // Split fica AWAITING até todas as partes caírem (reconcile).
  const status =
    useGateway || isSplit ? OrderStatus.AWAITING_PAYMENT : OrderStatus.IN_PRODUCTION;

  const created = await prisma.order.create({
    data: {
      establishment: { connect: { id: data.establishmentId } },
      code,
      status,
      locationLabel: data.locationLabel,
      posto: data.posto ?? null,
      customerName: data.customerName ?? null,
      note: data.note ?? null,
      subtotal,
      platformFee,
      serviceFee,
      total,
      items: {
        create: data.items.map((i) => ({
          menuItemId: i.menuItemId ?? null,
          name: i.name,
          qty: i.qty,
          unitPrice: i.unitPrice,
        })),
      },
      ...(payment.kind === "full"
        ? {
            payment: {
              create: {
                method: payment.method,
                installments: payment.installments,
                gatewayFeePct: new Prisma.Decimal(GATEWAY_FEE_PCT[payment.method]),
                cardMask: payment.cardMask ?? null,
                provider: useGateway ? providerName : null,
                gatewayChargeId: pix?.chargeId ?? null,
                pixPayload: pix?.pixPayload ?? null,
                pixQrImage: pix?.pixQrImage ?? null,
                splitToEstablishment: useGateway
                  ? new Prisma.Decimal(splitToEstablishment(total, platformFee))
                  : null,
              },
            },
          }
        : {
            splitShares: {
              create: payment.shares.map((_s, idx) => ({
                personIndex: idx,
                amount: amounts[idx],
                method: "PIX" as PaymentMethod,
                paid: false,
                paidAt: null,
                provider: splitProvider,
                gatewayChargeId: shareCharges[idx]?.chargeId ?? null,
                pixPayload: shareCharges[idx]?.pixPayload ?? null,
                pixQrImage: shareCharges[idx]?.pixQrImage ?? null,
              })),
            },
          }),
    },
    include: ORDER_INCLUDE,
  });
  if (created.status === OrderStatus.IN_PRODUCTION) await enqueuePrintJob(created.id);
  return created;
}

/** Mark a friend's share paid; when all shares are paid the order goes to production. */
export async function payShare(
  orderId: string,
  personIndex: number,
  method: PaymentMethod,
) {
  const order = await prisma.$transaction(async (tx) => {
    await tx.splitShare.update({
      where: { orderId_personIndex: { orderId, personIndex } },
      data: { method, paid: true, paidAt: new Date() },
    });
    const remaining = await tx.splitShare.count({ where: { orderId, paid: false } });
    if (remaining === 0) {
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.IN_PRODUCTION },
      });
    }
    return tx.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
  });
  if (order?.status === OrderStatus.IN_PRODUCTION) await enqueuePrintJob(orderId);
  return order;
}

export function deliverOrder(orderId: string) {
  return prisma.order.update({
    where: { id: orderId },
    data: { status: OrderStatus.DELIVERED },
    include: ORDER_INCLUDE,
  });
}

export function listOrders(establishmentId: string, status?: OrderStatus) {
  return prisma.order.findMany({
    where: { establishmentId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    include: ORDER_INCLUDE,
  });
}

export function getOrdersByIds(ids: string[]) {
  return prisma.order.findMany({
    where: { id: { in: ids } },
    orderBy: { createdAt: "desc" },
    include: { items: true, payment: true, splitShares: { orderBy: { personIndex: "asc" } } },
  });
}
