import { describe, it, expect } from "vitest";
import { appToEnum, toClientOrder, toAppMenuItem } from "@/lib/app/adapters";
import { fees } from "@/lib/app/helpers";

describe("appToEnum", () => {
  it("maps app pay id → Prisma enum", () => {
    expect(appToEnum("credito")).toBe("CREDIT");
    expect(appToEnum("pix")).toBe("PIX");
    expect(appToEnum("usdc")).toBe("USDC");
  });
});

describe("fees", () => {
  it("comissão da plataforma SOMADA ao que o cliente paga (grand)", () => {
    // est=12, base=112, fee=9% de 112=10.08, grand=112+10.08=122.08
    expect(fees(100, 9, 12)).toEqual({ fee: 10.08, est: 12, grand: 122.08 });
  });
  it("usa os defaults 8%/10% quando nenhuma % é passada", () => {
    // est=10, base=110, fee=8% de 110=8.8, grand=110+8.8=118.8
    expect(fees(100)).toEqual({ fee: 8.8, est: 10, grand: 118.8 });
  });
});

describe("toAppMenuItem", () => {
  const make = (id: string, sortOrder: number) =>
    toAppMenuItem({
      id, name: "Caipirinha", description: "d", price: 22, oldPrice: 28,
      photo: "p", measure: 300, unit: "ml", category: "Bebidas", subcategory: "Drinks", sortOrder,
    } as never);

  it("id numérico é derivado do dbId (único e estável), não do sortOrder", () => {
    const a = make("cuid1", 0);
    expect(a.dbId).toBe("cuid1");
    expect(a.price).toBe(22);
    expect(a.old).toBe(28);
    expect(typeof a.id).toBe("number");
    // Estável: o mesmo dbId sempre gera o mesmo id.
    expect(make("cuid1", 5).id).toBe(a.id);
  });

  it("itens com o MESMO sortOrder têm ids DIFERENTES (corrige a colisão do carrinho)", () => {
    // Antes o id era o sortOrder (default 0) → todos colidiam no mesmo id, e
    // adicionar um item ao carrinho fazia todos aparecerem como adicionados.
    expect(make("cuidA", 0).id).not.toBe(make("cuidB", 0).id);
  });
});

describe("toClientOrder", () => {
  const base = {
    id: "o1", number: 12, code: "PED-ABC", status: "IN_PRODUCTION",
    customerName: "Rômulo", note: "sem gelo", createdAt: new Date("2026-07-01T12:00:00Z"),
    subtotal: 121, platformFee: 9.68, serviceFee: 12.1,
    items: [{ qty: 1, name: "Combo Casal", unitPrice: 99 }, { qty: 1, name: "Caipirinha", unitPrice: 22 }],
  };
  it("maps a full-payment order", () => {
    const o = toClientOrder({
      ...base, payment: { method: "CREDIT", installments: 3 }, splitShares: [],
    } as never);
    expect(o.id).toBe(12);
    expect(o.dbId).toBe("o1");
    expect(o.code).toBe("PED-ABC");
    expect(o.status).toBe("producao");
    expect(o.total).toBe(121); // subtotal
    expect(o.fee).toBe(9.68);
    expect(o.est).toBe(12.1);
    expect(o.grand).toBe(142.78); // subtotal + serviço + comissão (o que o cliente paga)
    expect(o.pay).toEqual({ id: "credito", parc: 3 });
    expect(o.splits).toBeNull();
    expect(o.name).toBe("Rômulo");
  });
  it("maps a split order", () => {
    const o = toClientOrder({
      ...base, status: "AWAITING_PAYMENT", payment: null,
      splitShares: [{ personIndex: 0, method: "PIX", paid: true, amount: 71.39 }, { personIndex: 1, method: null, paid: false, amount: 71.39 }],
    } as never);
    expect(o.status).toBe("aguardando");
    expect(o.pay).toBeNull();
    expect(o.splits).toEqual([{ m: "pix", amount: 71.39 }, { m: null, amount: 71.39 }]);
  });
});
