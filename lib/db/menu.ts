import { OrderStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { menuItemUpsertSchema, type MenuItemUpsertInput } from "../validation";

export function listMenu(establishmentId: string) {
  return prisma.menuItem.findMany({
    where: { establishmentId },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });
}

/** Nomes dos itens mais pedidos (por quantidade somada), considerando apenas
 *  pedidos confirmados (em produção ou entregues). Agrega por `name` porque os
 *  OrderItems guardam o nome (o `menuItemId` fica null no fluxo do cliente).
 *  Usado no carrossel "Os mais pedidos"; vazio se ainda não houve pedidos. */
export async function getPopularItemNames(
  establishmentId: string,
  limit = 6,
): Promise<string[]> {
  const rows = await prisma.orderItem.groupBy({
    by: ["name"],
    where: {
      order: {
        establishmentId,
        status: { in: [OrderStatus.IN_PRODUCTION, OrderStatus.DELIVERED] },
      },
    },
    _sum: { qty: true },
    orderBy: { _sum: { qty: "desc" } },
    take: limit,
  });
  return rows.map((r) => r.name);
}

export async function upsertMenuItem(input: MenuItemUpsertInput) {
  const data = menuItemUpsertSchema.parse(input);
  const { id, establishmentId, oldPrice, measure, unit, ...rest } = data;
  const scalar = {
    ...rest,
    oldPrice: oldPrice ?? null,
    measure: measure ?? null,
    unit: unit ?? null,
  };
  if (id) {
    // Update is scoped by establishmentId too (defense-in-depth): a cross-tenant
    // id updates 0 rows even if a caller forgets the ownership pre-check.
    const r = await prisma.menuItem.updateMany({ where: { id, establishmentId }, data: scalar });
    if (r.count === 0) return null; // not found / not owned
    return prisma.menuItem.findUnique({ where: { id } });
  }
  return prisma.menuItem.create({
    data: { ...scalar, establishment: { connect: { id: establishmentId } } },
  });
}

export function deleteMenuItem(id: string, establishmentId: string) {
  // Scope by establishmentId so a tenant can only delete its own items.
  return prisma.menuItem.deleteMany({ where: { id, establishmentId } });
}
