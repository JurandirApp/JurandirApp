import { prisma } from "./prisma";

export function getRankingEstablishments() {
  return prisma.establishment.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
  });
}
