import { describe, it, expect } from "vitest";
import { methodToKey, toPanelOrder, waiterNameOf } from "@/lib/panel/adapters";

describe("methodToKey", () => {
  it("maps enum → pt key", () => {
    expect(methodToKey("PIX")).toBe("pix");
    expect(methodToKey("CREDIT")).toBe("credito");
  });
});

describe("toPanelOrder", () => {
  const base = {
    id: "o1", number: 41, code: "PED-1", establishmentId: "e1",
    status: "AWAITING_PAYMENT", locationLabel: "Guarda-sol nº 22", posto: "Posto 3",
    customerName: "Marina", note: null, createdAt: new Date("2026-07-01T12:00:00Z"),
    // subtotal 156, mas o total REAL salvo (com taxas) é 100 no fixture — a
    // auditoria deve usar este total, nunca recalcular taxa a partir dos itens.
    total: 100,
    items: [{ qty: 4, name: "Caipirinha", unitPrice: 22 }, { qty: 1, name: "Camarão", unitPrice: 68 }],
    payment: null,
    splitShares: [{ method: "PIX", paid: true, amount: 39 }, { method: null, paid: false, amount: 39 }],
  };
  it("maps split order", () => {
    const o = toPanelOrder(base as never);
    expect(o.id).toBe(41);
    expect(o.dbId).toBe("o1");
    expect(o.st).toBe("aguardando");
    expect(o.items).toEqual([[4, "Caipirinha", 22], [1, "Camarão", 68]]);
    expect(o.splits).toEqual({ people: 2, paid: 1, paidAmt: 39 });
    expect(o.loc).toBe("Guarda-sol nº 22");
  });
  it("expõe o total real do pedido (auditoria não recalcula taxa)", () => {
    const o = toPanelOrder(base as never);
    expect(o.total).toBe(100);
  });
  it("maps single-payment order", () => {
    const o = toPanelOrder({
      ...base, status: "IN_PRODUCTION", splitShares: [],
      payment: { method: "CREDIT", cardMask: "Visa •••• 4412" },
    } as never);
    expect(o.st).toBe("producao");
    expect(o.pay).toBe("credito");
    expect(o.card).toBe("Visa •••• 4412");
    expect(o.splits).toBeUndefined();
  });
});

describe("waiterName (garçom que atendeu o pedido)", () => {
  const ev = (type: string, name: string | null) => ({ type, waiter: name ? { name } : null });
  it("prefere quem ENTREGOU; sem entrega, quem PEGOU; sem garçom → undefined", () => {
    expect(waiterNameOf([ev("PICKED", "Ana"), ev("DELIVERED", "Bruno")])).toBe("Bruno");
    expect(waiterNameOf([ev("PICKED", "Ana")])).toBe("Ana");
    expect(waiterNameOf([])).toBeUndefined();
    expect(waiterNameOf(undefined)).toBeUndefined();
    expect(waiterNameOf([ev("DELIVERED", null)])).toBeUndefined();
  });
  it("vários garçons → nomes sem repetir, em ordem", () => {
    expect(
      waiterNameOf([ev("DELIVERED", "Ana"), ev("DELIVERED", "Bruno"), ev("DELIVERED", "Ana")]),
    ).toBe("Ana, Bruno");
  });
  it("toPanelOrder inclui waiterName só quando há garçom", () => {
    const base = {
      id: "o1", number: 1, code: "PED-1", status: "DELIVERED", locationLabel: "Mesa 1", posto: null,
      customerName: null, note: null, createdAt: new Date(), total: 10,
      items: [], payment: { method: "PIX", cardMask: null }, splitShares: [],
    };
    expect(toPanelOrder({ ...base, events: [ev("DELIVERED", "Carla")] } as never).waiterName).toBe("Carla");
    expect(toPanelOrder(base as never)).not.toHaveProperty("waiterName");
  });
});
