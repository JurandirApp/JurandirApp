import { describe, it, expect } from "vitest";
import { scaleFromStats, type MonthlyStatLite } from "@/lib/admin/scale";
import type { AdminEst } from "@/lib/data/admin";

const est = (id: string): AdminEst => ({
  id, name: id, owner: "", city: "", neigh: "", tipo: "Bar", plan: "Básico",
  status: "ativo", since: "2025-01-01", fee: "8", orders: 0, revenue: 0,
  byPay: { credito: 0, debito: 0, pix: 0, usdc: 0 },
  phone: "", email: "", website: "", whatsapp: "", instagram: "",
  user: "", password: "", posto: "", radius: "",
});
const stat = (establishmentId: string): MonthlyStatLite => ({
  establishmentId, year: 2026, month: 7, orders: 300, gmv: 30000,
  byCredit: 12000, byDebit: 6000, byPix: 9000, byUsdc: 3000,
});

describe("scaleFromStats", () => {
  it("mês cheio usa o stat do mês", () => {
    const [r] = scaleFromStats([est("a")], [stat("a")], "mes", "2026-07");
    expect(r.pOrders).toBe(300);
    expect(r.pRevenue).toBe(30000);
    expect(r.pByPay.pix).toBe(9000);
  });
  it("dia = 1/30 do mês", () => {
    const [r] = scaleFromStats([est("a")], [stat("a")], "dia", "2026-07");
    expect(r.pOrders).toBe(10);
    expect(r.pRevenue).toBeCloseTo(1000, 2);
  });
  it("mês sem stat vira zero", () => {
    const [r] = scaleFromStats([est("a")], [stat("a")], "mes", "2026-06");
    expect(r.pOrders).toBe(0);
    expect(r.pRevenue).toBe(0);
  });
});
