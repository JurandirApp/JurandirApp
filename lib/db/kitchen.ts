import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  KitchenClosedError,
  kitchenConfigOf,
  kitchenConfigured,
  kitchenOpenNow,
  normalizeKitchenConfig,
  orderHasKitchenItem,
  type KitchenConfig,
} from "@/lib/domain/kitchen";

/** Config da cozinha do bar + categorias existentes no cardápio (pro multi-select). */
export async function getKitchenConfig(
  establishmentId: string,
): Promise<{ config: KitchenConfig; categories: string[] } | null> {
  const [est, cats] = await Promise.all([
    prisma.establishment.findUnique({
      where: { id: establishmentId },
      select: { kitchenHours: true, kitchenCategories: true },
    }),
    prisma.menuItem.findMany({
      where: { establishmentId },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    }),
  ]);
  if (!est) return null;
  return { config: kitchenConfigOf(est), categories: cats.map((c) => c.category) };
}

/** Salva a config (normalizada) e devolve o que ficou gravado. */
export async function saveKitchenConfig(
  establishmentId: string,
  hours: unknown,
  categories: unknown,
): Promise<KitchenConfig> {
  const cfg = normalizeKitchenConfig(hours, categories);
  await prisma.establishment.update({
    where: { id: establishmentId },
    data: {
      kitchenHours: cfg.hours as unknown as Prisma.InputJsonValue,
      kitchenCategories: cfg.categories,
    },
  });
  return cfg;
}

/**
 * Barra o pedido com item da cozinha quando ela está fechada (lança
 * `KitchenClosedError`). Sem config → nunca bloqueia (nem consulta o cardápio).
 */
export async function assertKitchenAllows(
  est: { id: string; kitchenHours?: unknown; kitchenCategories?: unknown },
  items: { menuItemId?: string | null; name: string }[],
  now: Date = new Date(),
): Promise<void> {
  const cfg = kitchenConfigOf(est);
  if (!kitchenConfigured(cfg) || kitchenOpenNow(cfg, now)) return;
  const kitchenItems = await prisma.menuItem.findMany({
    where: { establishmentId: est.id, category: { in: cfg.categories } },
    select: { id: true, name: true },
  });
  if (orderHasKitchenItem(items, kitchenItems)) throw new KitchenClosedError();
}
