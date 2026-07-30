import type { Establishment } from "@/lib/data/establishments";
import { normalizeWeekly } from "@/lib/domain/schedule";

type DbEst = {
  id: string; name: string; slug: string; city: string; neighborhood: string | null;
  type: string; cuisine: string | null; rating: unknown; rankingOrders: number;
  weeklyHours: unknown; logoImg: string | null;
};

export function toRankingEstablishment(e: DbEst): Establishment {
  return {
    id: e.id,
    name: e.name,
    slug: e.slug,
    city: e.city,
    neigh: e.neighborhood ?? "",
    tipo: e.type,
    cuisine: e.cuisine ?? "",
    orders: e.rankingOrders,
    rating: e.rating == null ? null : Number(e.rating),
    logo: e.logoImg ?? undefined,
    hours: normalizeWeekly(e.weeklyHours),
  };
}
