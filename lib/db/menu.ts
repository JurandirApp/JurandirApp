import { OrderStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { menuItemUpsertSchema, type BulkPriceAdjustInput, type MenuItemUpsertInput } from "../validation";
import {
  computeAdjustment,
  type AdjustableItem,
  type ItemChange,
} from "../pricing/bulk-adjust";

/** Grupos de adicionais (com opções) ordenados — reusado na leitura e no upsert. */
const optionGroupsInclude = {
  optionGroups: {
    orderBy: { sortOrder: "asc" as const },
    include: { options: { orderBy: { sortOrder: "asc" as const } } },
  },
};

export function listMenu(establishmentId: string) {
  return prisma.menuItem.findMany({
    where: { establishmentId },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    include: optionGroupsInclude,
  });
}

/** Itens com desconto real (oldPrice > price) de bares ativos — alimenta a
 *  seção "Ofertas do dia" da Home do app. Cada item traz slug/nome do bar.
 *  Ordena pelo maior desconto; vazio se ninguém tem promoção no momento. */
export async function listOffers(limit = 12) {
  const rows = await prisma.menuItem.findMany({
    where: {
      active: true,
      oldPrice: { not: null },
      establishment: { status: "ACTIVE" },
    },
    include: { establishment: { select: { slug: true, name: true } } },
    orderBy: { updatedAt: "desc" },
    take: 60,
  });
  return rows
    .filter((m) => m.oldPrice != null && Number(m.oldPrice) > Number(m.price))
    .sort(
      (a, b) =>
        1 - Number(b.price) / Number(b.oldPrice) - (1 - Number(a.price) / Number(a.oldPrice)),
    )
    .slice(0, limit);
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
  const { id, establishmentId, oldPrice, measure, unit, optionGroups, ...rest } = data;
  const scalar = {
    ...rest,
    oldPrice: oldPrice ?? null,
    measure: measure ?? null,
    unit: unit ?? null,
  };
  // Nested-create dos grupos de adicionais (sortOrder = ordem no formulário).
  const groupsCreate = (optionGroups ?? []).map((g, gi) => ({
    name: g.name,
    required: g.required,
    minSelect: g.minSelect,
    maxSelect: g.maxSelect,
    sortOrder: gi,
    options: {
      create: g.options.map((o, oi) => ({
        name: o.name,
        priceDelta: o.priceDelta,
        active: o.active,
        sortOrder: oi,
      })),
    },
  }));

  if (id) {
    // Update is scoped by establishmentId too (defense-in-depth): a cross-tenant
    // id updates 0 rows even if a caller forgets the ownership pre-check.
    const r = await prisma.menuItem.updateMany({ where: { id, establishmentId }, data: scalar });
    if (r.count === 0) return null; // not found / not owned
    // Salva o item completo: substitui os grupos por inteiro quando o form os
    // envia. `undefined` = campo não mexido, então preserva o que já existe.
    // Delete + recreate atômico: uma falha não pode deixar o item sem os grupos.
    if (optionGroups !== undefined) {
      await prisma.$transaction([
        prisma.menuItemOptionGroup.deleteMany({ where: { menuItemId: id } }),
        prisma.menuItem.update({ where: { id }, data: { optionGroups: { create: groupsCreate } } }),
      ]);
    }
    return prisma.menuItem.findUnique({ where: { id }, include: optionGroupsInclude });
  }
  return prisma.menuItem.create({
    data: {
      ...scalar,
      establishment: { connect: { id: establishmentId } },
      optionGroups: { create: groupsCreate },
    },
    include: optionGroupsInclude,
  });
}

export function deleteMenuItem(id: string, establishmentId: string) {
  // Scope by establishmentId so a tenant can only delete its own items.
  return prisma.menuItem.deleteMany({ where: { id, establishmentId } });
}

export interface BulkAdjustResult {
  changes: ItemChange[];
  applied: boolean;
}

/**
 * Ajuste de preço em massa. Lê os itens selecionados (SEMPRE escopados ao
 * estabelecimento — ids de outro tenant simplesmente não entram), calcula o
 * "de → para" com a lógica pura testada, e:
 * - `dryRun` → devolve só o preview, sem gravar;
 * - senão → grava preços (e deltas dos adicionais, se `includeAddons`) numa
 *   transação única, pra não deixar o cardápio meio-ajustado.
 */
export async function bulkAdjustPrices(
  establishmentId: string,
  input: BulkPriceAdjustInput,
): Promise<BulkAdjustResult> {
  const rows = await prisma.menuItem.findMany({
    where: { id: { in: input.itemIds }, establishmentId },
    include: optionGroupsInclude,
  });

  const adjustable: AdjustableItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    price: Number(r.price),
    options: r.optionGroups.flatMap((g) =>
      g.options.map((o) => ({ id: o.id, name: o.name, priceDelta: Number(o.priceDelta) })),
    ),
  }));

  const changes = computeAdjustment(adjustable, {
    percent: input.percent,
    rounding: input.rounding,
    includeAddons: input.includeAddons,
  });

  if (input.dryRun) return { changes, applied: false };

  // Todos os ids abaixo vêm da leitura já escopada acima, então são do tenant.
  const writes = changes.flatMap((c) => [
    prisma.menuItem.update({ where: { id: c.id }, data: { price: c.newPrice } }),
    ...c.options.map((o) =>
      prisma.menuItemOption.update({ where: { id: o.id }, data: { priceDelta: o.newDelta } }),
    ),
  ]);
  if (writes.length > 0) await prisma.$transaction(writes);
  return { changes, applied: true };
}
