import { prisma } from "./prisma";

export function getEstablishmentBySlug(slug: string) {
  return prisma.establishment.findUnique({ where: { slug } });
}

export function getEstablishmentById(id: string) {
  return prisma.establishment.findUnique({ where: { id } });
}

export function listEstablishments() {
  return prisma.establishment.findMany({ orderBy: { name: "asc" } });
}

export function updateEstablishmentFee(id: string, platformFeePct: number) {
  return prisma.establishment.update({ where: { id }, data: { platformFeePct } });
}
