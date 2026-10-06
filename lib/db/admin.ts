import { prisma } from "./prisma";

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

/** Débito Pagar.me pago, agregado por bar: quanto repassar via Pix. */
export async function listDebitPayout(from: Date, to: Date) {
  const rows = await prisma.payment.findMany({
    where: { method: "DEBIT", provider: "PAGARME", confirmedAt: { not: null, gte: from, lte: to } },
    select: {
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
  const byEst = new Map<
    string,
    { establishmentId: string; nome: string; qtd: number; bruto: number; taxa: number; aRepassar: number }
  >();
  for (const r of rows) {
    const o = r.order;
    if (!o) continue;
    const cur = byEst.get(o.establishmentId) ?? {
      establishmentId: o.establishmentId,
      nome: o.establishment?.name ?? "",
      qtd: 0,
      bruto: 0,
      taxa: 0,
      aRepassar: 0,
    };
    cur.qtd += 1;
    cur.bruto += Number(o.total);
    cur.taxa += Number(o.platformFee);
    cur.aRepassar += Number(r.splitToEstablishment ?? Number(o.total) - Number(o.platformFee));
    byEst.set(o.establishmentId, cur);
  }
  return [...byEst.values()].sort((a, b) => b.aRepassar - a.aRepassar);
}
