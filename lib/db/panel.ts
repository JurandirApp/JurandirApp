import { prisma } from "./prisma";

export function getEstablishment(id: string) {
  return prisma.establishment.findUnique({ where: { id } });
}
/** Comandas de impressão recentes do estabelecimento (+ código do pedido). */
export async function listPanelPrintJobs(establishmentId: string, limit = 10) {
  const jobs = await prisma.printJob.findMany({
    where: { establishmentId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, kind: true, status: true, error: true, createdAt: true, orderId: true },
  });
  const orderIds = jobs.map((j) => j.orderId).filter((x): x is string => Boolean(x));
  const orders = orderIds.length
    ? await prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, code: true } })
    : [];
  const codeById = new Map(orders.map((o) => [o.id, o.code]));
  return jobs.map((j) => ({
    id: j.id,
    kind: j.kind,
    status: j.status,
    error: j.error,
    createdAt: j.createdAt,
    code: j.orderId ? (codeById.get(j.orderId) ?? "—") : "TESTE",
  }));
}
export function listPanelOrders(
  establishmentId: string,
  range?: { from: Date; to: Date },
) {
  return prisma.order.findMany({
    where: {
      establishmentId,
      ...(range ? { createdAt: { gte: range.from, lt: range.to } } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { items: true, payment: true, splitShares: true },
  });
}
export function listPanelMenu(establishmentId: string) {
  return prisma.menuItem.findMany({
    where: { establishmentId },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });
}
export function listPanelQrSpots(establishmentId: string) {
  return prisma.qrSpot.findMany({ where: { establishmentId }, orderBy: { createdAt: "asc" } });
}
export function listPanelStats(establishmentId: string) {
  return prisma.monthlyStat.findMany({ where: { establishmentId } });
}
