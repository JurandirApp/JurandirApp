import { prisma } from "./prisma";
import { searchEventSchema, type SearchEventInput } from "../validation";

export function recordSearchEvent(input: SearchEventInput) {
  const data = searchEventSchema.parse(input);
  return prisma.searchEvent.create({ data });
}

/** Count events grouped by city (for the admin "Buscas" aggregation). */
export function aggregateSearch() {
  return prisma.searchEvent.groupBy({
    by: ["city"],
    _count: { _all: true },
    orderBy: { _count: { city: "desc" } },
  });
}
