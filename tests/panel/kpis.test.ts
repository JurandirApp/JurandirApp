import { describe, it, expect } from "vitest";
import { categoryShares, topItems, scaleEstStats } from "@/lib/panel/adapters";
import type { Order } from "@/lib/data/panel";

const ord = (items: [number, string, number][], st: Order["st"] = "producao"): Order =>
  ({ id: 1, code: "c", st, pay: "pix", loc: "x", ts: 0, items } as Order);
const catOf = { Caipirinha: "Bebidas", Camarão: "Alimentos" } as Record<string, string>;

describe("categoryShares", () => {
  it("sums revenue per category with fractions", () => {
    const r = categoryShares([ord([[2, "Caipirinha", 20], [1, "Camarão", 60]])], catOf);
    // Bebidas 40, Alimentos 60, total 100
    const bev = r.find((x) => x.cat === "Bebidas")!;
    expect(bev.value).toBe(40);
    expect(bev.frac).toBeCloseTo(0.4, 5);
  });
});

describe("topItems", () => {
  it("tallies qty/rev and filters by category", () => {
    const orders = [ord([[3, "Caipirinha", 20], [1, "Camarão", 60]])];
    const all = topItems(orders, catOf, "Todos");
    expect(all.find((t) => t.name === "Caipirinha")!.qty).toBe(3);
    const bev = topItems(orders, catOf, "Bebidas");
    expect(bev.every((t) => t.name === "Caipirinha")).toBe(true);
  });
});

describe("scaleEstStats", () => {
  const now = new Date("2026-07-15T12:00:00Z").getTime();
  const stats = [{ establishmentId: "e1", year: 2026, month: 7, orders: 300, gmv: 30000, byCredit: 12000, byDebit: 6000, byPix: 9000, byUsdc: 3000 }];
  it("full current month for '30d'/'tudo'", () => {
    expect(scaleEstStats(stats, "30d", now).revenue).toBe(30000);
    expect(scaleEstStats(stats, "tudo", now).revenue).toBe(30000);
  });
  it("scales down for hoje/7d", () => {
    expect(scaleEstStats(stats, "hoje", now).revenue).toBeCloseTo(1000, 0);
    expect(scaleEstStats(stats, "7d", now).orders).toBe(70);
  });
});
