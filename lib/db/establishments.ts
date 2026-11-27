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

/** Liga/desliga o Módulo do Garçom (entrega pelo garçom) do PRÓPRIO bar — só
 *  mexe na flag do id informado (o chamador garante que é o bar logado). */
export async function setWaiterModuleEnabled(id: string, enabled: boolean): Promise<boolean> {
  const e = await prisma.establishment.update({
    where: { id },
    data: { waiterModuleEnabled: enabled },
    select: { waiterModuleEnabled: true },
  });
  return e.waiterModuleEnabled;
}
