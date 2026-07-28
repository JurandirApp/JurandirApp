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
import { getProvider, type PixCharge } from "@/lib/payments";
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
  const allPaid =
    payment.kind === "split" ? payment.shares.every((s) => s.method !== null) : true;

  // Mercado Pago é o gateway FIXO: todo pagamento cheio (Pix/cartão) gera
  // cobrança real, sem depender de "onboarding".
  //  - Pix  → cobrança direta (QR na hora, aqui).
  //  - Cartão (crédito/débito) → Checkout Pro; aqui o pedido só nasce
  //    AWAITING_PAYMENT e a preferência/URL é criada na action (createCardCheckout).
  const isPixGateway = payment.kind === "full" && payment.method === "PIX";
  const isCardGateway =
    payment.kind === "full" &&
    (payment.method === "CREDIT" || payment.method === "DEBIT");
  const useGateway = isPixGateway || isCardGateway;
  let pix: PixCharge | null = null;
  if (isPixGateway) {
    pix = await getProvider().createPixCharge({
      est,
      reference: code,
      total,
      platformFee,
      customerName: data.customerName ?? undefined,
      description: `Pedido ${code}`,
    });
  }

  const status = useGateway
    ? OrderStatus.AWAITING_PAYMENT
    : allPaid
      ? OrderStatus.IN_PRODUCTION
      : OrderStatus.AWAITING_PAYMENT;

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
                provider: useGateway ? est.paymentProvider : null,
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
              create: payment.shares.map((s, idx) => ({
                personIndex: idx,
                amount: amounts[idx],
                method: s.method,
                paid: s.method !== null,
                paidAt: s.method !== null ? new Date() : null,
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
