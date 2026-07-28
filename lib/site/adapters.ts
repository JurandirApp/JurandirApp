import type { Establishment, WeekSchedule } from "@/lib/data/establishments";

const EMPTY_WEEK: WeekSchedule = [null, null, null, null, null, null, null];

type DbEst = {
  id: string; name: string; slug: string; city: string; neighborhood: string | null;
  type: string; cuisine: string | null; rating: unknown; rankingOrders: number;
  weeklyHours: unknown; logoImg: string | null;
};

export function toRankingEstablishment(e: DbEst): Establishment {
  const hours = Array.isArray(e.weeklyHours)
    ? (e.weeklyHours as WeekSchedule)
    : EMPTY_WEEK;
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
    hours: hours.length === 7 ? hours : EMPTY_WEEK,
  };
}
