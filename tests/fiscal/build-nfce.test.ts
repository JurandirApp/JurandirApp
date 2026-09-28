import { describe, it, expect } from "vitest";
import { buildNfceInput, emissaoISOAgora, type FiscalItemFields } from "@/lib/fiscal/build-nfce";
import { FiscalValidationError } from "@/lib/fiscal/types";
import type { Establishment, Order, OrderItem, PaymentMethod } from "@prisma/client";

// Entrada de item do teste (unitPrice como number; o build coage com Number()).
type ItemInput = { menuItemId?: string; name?: string; qty?: number; unitPrice?: number };

const estNormal = {
  id: "est_1",
  regimeTributario: "3", // Normal → CST
  cnpj: "12345678000199",
  fiscalEnv: "HOMOLOGACAO",
} as unknown as Establishment;

const estSimples = { ...estNormal, regimeTributario: "1" } as unknown as Establishment; // Simples → CSOSN

const fiscalOk: FiscalItemFields = {
  ncm: "22030000",
  cfop: "5102",
  origem: "0",
  cstIcms: "00",
  csosnIcms: "102",
  cest: null,
  cClassTrib: null,
  unidadeComercial: "UN",
};

function order(items: ItemInput[]): Order & { items: OrderItem[] } {
  return {
    id: "o1",
    code: "PED-1",
    customerName: "Ana",
    items: items.map((i, idx) => ({
      id: `oi${idx}`,
      menuItemId: `m${idx}`,
      name: `Item ${idx}`,
      qty: 1,
      unitPrice: 10,
      ...i,
    })),
  } as unknown as Order & { items: OrderItem[] };
}

describe("emissaoISOAgora", () => {
  it("formata a data no fuso de Brasília (-03:00)", () => {
    expect(emissaoISOAgora(new Date("2026-09-25T15:00:00Z"))).toBe("2026-09-25T12:00:00.000-03:00");
  });
});

describe("buildNfceInput", () => {
  it("monta itens, total e pagamento a partir do pedido (regime Normal, Pix)", () => {
    const o = order([
      { menuItemId: "mA", name: "Chopp", qty: 2, unitPrice: 10 },
      { menuItemId: "mB", name: "Porção", qty: 1, unitPrice: 30 },
    ]);
    const map = new Map<string, FiscalItemFields>([
      ["mA", fiscalOk],
      ["mB", fiscalOk],
    ]);

    const input = buildNfceInput({
      est: estNormal,
      order: o,
      ref: "PED-1",
      fiscalByMenuItemId: map,
      paymentMethod: "PIX",
      now: new Date("2026-09-25T15:00:00Z"),
    });

    expect(input.itens).toHaveLength(2);
    expect(input.itens[0]).toMatchObject({
      numero: 1,
      codigo: "mA",
      descricao: "Chopp",
      quantidade: 2,
      valorUnitario: 10,
      valorBruto: 20,
      ncm: "22030000",
      cfop: "5102",
      origem: "0",
      unidade: "UN",
    });
    expect(input.total).toBe(50);
    expect(input.pagamento).toEqual({ forma: "17", valor: 50 });
    expect(input.emissaoISO).toBe("2026-09-25T12:00:00.000-03:00");
    expect(input.consumidor).toEqual({ nome: "Ana" });
  });

  it("aceita o item no Simples quando tem CSOSN mesmo sem CST", () => {
    const map = new Map<string, FiscalItemFields>([["mA", { ...fiscalOk, cstIcms: null }]]);
    const input = buildNfceInput({
      est: estSimples,
      order: order([{ menuItemId: "mA", name: "Chopp" }]),
      ref: "r",
      fiscalByMenuItemId: map,
      paymentMethod: "PIX",
    });
    expect(input.itens).toHaveLength(1);
  });

  it("rejeita no Simples quando falta CSOSN (mesmo com CST preenchido)", () => {
    const map = new Map<string, FiscalItemFields>([["mA", { ...fiscalOk, csosnIcms: null }]]);
    expect(() =>
      buildNfceInput({
        est: estSimples,
        order: order([{ menuItemId: "mA", name: "Chopp" }]),
        ref: "r",
        fiscalByMenuItemId: map,
        paymentMethod: "PIX",
      }),
    ).toThrow(FiscalValidationError);
  });

  it("lança FiscalValidationError listando o item sem NCM", () => {
    const map = new Map<string, FiscalItemFields>([["mA", { ...fiscalOk, ncm: null }]]);
    try {
      buildNfceInput({
        est: estNormal,
        order: order([{ menuItemId: "mA", name: "Chopp Escuro" }]),
        ref: "r",
        fiscalByMenuItemId: map,
        paymentMethod: "PIX",
      });
      throw new Error("deveria ter lançado");
    } catch (e) {
      expect(e).toBeInstanceOf(FiscalValidationError);
      expect((e as FiscalValidationError).missing).toEqual(['"Chopp Escuro" sem NCM']);
      expect((e as Error).message).toContain("Chopp Escuro");
    }
  });

  it.each([
    ["CREDIT", "03"],
    ["DEBIT", "04"],
    ["PIX", "17"],
    ["USDC", "99"],
  ] as [PaymentMethod, string][])("mapeia %s → tPag %s", (method, forma) => {
    const input = buildNfceInput({
      est: estNormal,
      order: order([{ menuItemId: "mA", name: "Chopp" }]),
      ref: "r",
      fiscalByMenuItemId: new Map([["mA", fiscalOk]]),
      paymentMethod: method,
    });
    expect(input.pagamento.forma).toBe(forma);
  });

  it("usa tPag 99 quando não há método de pagamento", () => {
    const input = buildNfceInput({
      est: estNormal,
      order: order([{ menuItemId: "mA", name: "Chopp" }]),
      ref: "r",
      fiscalByMenuItemId: new Map([["mA", fiscalOk]]),
      paymentMethod: null,
    });
    expect(input.pagamento.forma).toBe("99");
  });
});
