import { prisma } from "./prisma";
import {
  aggregateDebitPayout,
  type DebitGateway,
  type DebitPayoutInput,
  type DebitPayoutRow,
} from "../domain/payout";

export function getAdminEstablishments() {
  return prisma.establishment.findMany({
    orderBy: { name: "asc" },
    include: {
      users: { where: { role: "ESTABLISHMENT" }, take: 1, select: { email: true } },
    },
  });
}

export function listMonthlyStats() {
  return prisma.monthlyStat.findMany();
}

export function listAllOrders() {
  return prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: { items: true, payment: true, splitShares: { select: { id: true } } },
  });
}

export function listSearchEvents() {
  return prisma.searchEvent.findMany({ orderBy: { createdAt: "desc" } });
}

/** Débito (Pagar.me/PagBank) pago, agregado por bar e gateway: quanto repassar via Pix. */
export async function listDebitPayout(from: Date, to: Date): Promise<DebitPayoutRow[]> {
  const rows = await prisma.payment.findMany({
    where: {
      method: "DEBIT",
      provider: { in: ["PAGARME", "PAGBANK"] },
      confirmedAt: { not: null, gte: from, lte: to },
    },
    select: {
      provider: true,
      splitToEstablishment: true,
      order: {
        select: {
          total: true,
          platformFee: true,
          establishmentId: true,
          establishment: { select: { name: true } },
        },
      },
    },
  });
  const inputs: DebitPayoutInput[] = [];
  for (const r of rows) {
    const o = r.order;
    if (!o) continue;
    inputs.push({
      provider: r.provider as DebitGateway,
      establishmentId: o.establishmentId,
      nome: o.establishment?.name ?? "",
      total: Number(o.total),
      platformFee: Number(o.platformFee),
      splitToEstablishment: r.splitToEstablishment == null ? null : Number(r.splitToEstablishment),
    });
  }
  return aggregateDebitPayout(inputs);
}
