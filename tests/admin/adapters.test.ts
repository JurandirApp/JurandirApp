import { describe, it, expect } from "vitest";
import { toAdminOrder, toSearchEventRows, methodToKey } from "@/lib/admin/adapters";

describe("methodToKey", () => {
  it("mapeia enum -> chave pt", () => {
    expect(methodToKey("CREDIT")).toBe("credito");
    expect(methodToKey("PIX")).toBe("pix");
  });
});

describe("toAdminOrder", () => {
  it("monta a string de itens, método e total", () => {
    const o = toAdminOrder(
      {
        id: "o1", code: "PED-1", establishmentId: "e1",
        createdAt: new Date("2026-07-01T12:00:00Z"), total: 96, customerName: "Lucas",
        items: [{ qty: 1, name: "Filé" }, { qty: 2, name: "Heineken" }],
        payment: null, splitShares: [{ id: "s" }],
      } as never,
      0,
    );
    expect(o.est).toBe("e1");
    expect(o.m).toBe("split");
    expect(o.items).toBe("1× Filé, 2× Heineken");
    expect(o.total).toBe(96);
    expect(o.cust).toBe("Lucas");
  });
  it("usa o método do payment quando não é split", () => {
    const o = toAdminOrder(
      {
        id: "o2", code: "PED-2", establishmentId: "e1",
        createdAt: new Date(), total: 50, customerName: null,
        items: [{ qty: 1, name: "X" }],
        payment: { method: "CREDIT", cardMask: "Visa •••• 1" }, splitShares: [],
      } as never,
      1,
    );
    expect(o.m).toBe("credito");
    expect(o.card).toBe("Visa •••• 1");
  });
});

describe("toSearchEventRows", () => {
  it("explode uma linha em pares de dimensão", () => {
    const rows = toSearchEventRows({
      city: "Itajaí/SC", neighborhood: null, cuisine: "Frutos do mar", type: null,
      createdAt: new Date("2026-07-05T00:00:00Z"),
    } as never);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.field).sort()).toEqual(["city", "cuisine"]);
  });
});
