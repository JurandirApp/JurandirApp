import { describe, it, expect } from "vitest";
import {
  GATEWAY_FEE_PCT,
  computeTotals,
  splitShares,
  makeOrderCode,
} from "@/lib/domain/pricing";

describe("computeTotals", () => {
  it("comissão SOMADA à conta do cliente (o bar recebe cheio)", () => {
    const t = computeTotals(121, 8, 10);
    expect(t.serviceFee).toBe(12.1);
    expect(t.platformFee).toBe(10.65); // comissão = 8% de (121 + serviço)
    expect(t.total).toBe(143.75); // subtotal + serviço + comissão (o cliente paga)
  });

  it("arredonda para 2 casas", () => {
    const t = computeTotals(33.33, 8, 10);
    expect(t.serviceFee).toBe(3.33);
    expect(t.platformFee).toBe(2.93);
    expect(t.total).toBe(39.59);
  });
});

describe("splitShares", () => {
  it("divide igualmente com a última parcela absorvendo o resto", () => {
    const s = splitShares(142.78, 2);
    expect(s).toEqual([71.39, 71.39]);
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(142.78, 2);
  });

  it("mantém a soma exata em divisões não exatas", () => {
    const s = splitShares(100, 3);
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2);
    expect(s).toHaveLength(3);
  });
});

describe("GATEWAY_FEE_PCT", () => {
  it("tem as taxas por método", () => {
    expect(GATEWAY_FEE_PCT).toEqual({ CREDIT: 3.49, DEBIT: 1.99, PIX: 0.99, USDC: 1.0 });
  });
});

describe("makeOrderCode", () => {
  it("gera código PED- com 8 hex", () => {
    expect(makeOrderCode()).toMatch(/^PED-[0-9A-F]{8}$/);
  });
});
