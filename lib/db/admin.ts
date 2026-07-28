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
