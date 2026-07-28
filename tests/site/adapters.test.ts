import { describe, it, expect } from "vitest";
import { toRankingEstablishment } from "@/lib/site/adapters";

describe("toRankingEstablishment", () => {
  it("maps DB establishment → landing ranking shape", () => {
    const r = toRankingEstablishment({
      id: "cuid1", name: "Bar do Zé", city: "Florianópolis/SC", neighborhood: "Jurerê",
      type: "Bar", cuisine: "Boteco", rating: 4.5, rankingOrders: 412,
      weeklyHours: [null, { o: "18:00", c: "23:00" }, null, null, null, null, null],
    } as never);
    expect(r.id).toBe("cuid1");
    expect(r.neigh).toBe("Jurerê");
    expect(r.tipo).toBe("Bar");
    expect(r.cuisine).toBe("Boteco");
    expect(r.rating).toBe(4.5);
    expect(r.orders).toBe(412);
    expect(r.hours).toHaveLength(7);
    expect(r.hours[1]).toEqual({ o: "18:00", c: "23:00" });
  });
  it("handles null cuisine/hours safely", () => {
    const r = toRankingEstablishment({
      id: "c2", name: "X", city: "C", neighborhood: null, type: "Bar",
      cuisine: null, rating: 4, rankingOrders: 0, weeklyHours: null,
    } as never);
    expect(r.neigh).toBe("");
    expect(r.cuisine).toBe("");
    expect(r.hours).toHaveLength(7);
    expect(r.hours.every((h) => h === null)).toBe(true);
  });
});
