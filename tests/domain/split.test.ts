import { describe, it, expect } from "vitest";
import { round2, splitToEstablishment } from "@/lib/domain/pricing";

describe("splitToEstablishment", () => {
  it("estabelecimento recebe total menos a taxa da plataforma", () => {
    expect(splitToEstablishment(100, 8)).toBe(92);
  });
  it("arredonda em 2 casas", () => {
    expect(splitToEstablishment(100.1, 8)).toBe(92.1);
    expect(round2(1.014)).toBe(1.01);
    expect(round2(1.016)).toBe(1.02);
  });
});

import { splitPlatformFee, splitShares, computeTotals } from "@/lib/domain/pricing";

describe("splitPlatformFee (comissão na conta dividida)", () => {
  const sum = (a: number[]) => Math.round(a.reduce((s, v) => s + v, 0) * 100) / 100;

  it("proporcional ao valor de cada parte; soma = platformFee", () => {
    // conta 100, comissão 8% → total 108, fee 8; 2 partes de 54 → 4 cada
    expect(splitPlatformFee(8, [54, 54])).toEqual([4, 4]);
  });

  it("resto do arredondamento fica na ÚLTIMA parte", () => {
    // fee 1 em 3 partes iguais → 0.33, 0.33, 0.34
    expect(splitPlatformFee(1, [10, 10, 10])).toEqual([0.33, 0.33, 0.34]);
  });

  it("soma sempre bate com a platformFee do pedido (vários casos)", () => {
    for (const [subtotal, pct, n] of [
      [37.9, 8, 3],
      [100.01, 5, 7],
      [12.5, 10, 8],
      [999.99, 3.5, 4],
      [0.5, 8, 2],
    ] as const) {
      const { platformFee, total } = computeTotals(subtotal, pct, 10);
      const shares = splitShares(total, n);
      const fees = splitPlatformFee(platformFee, shares);
      expect(fees).toHaveLength(n);
      expect(sum(fees)).toBe(platformFee);
      fees.forEach((f, i) => {
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThan(shares[i]);
      });
    }
  });

  it("sem comissão (ou total zero) → zeros", () => {
    expect(splitPlatformFee(0, [5, 5])).toEqual([0, 0]);
    expect(splitPlatformFee(1, [0, 0])).toEqual([0, 0]);
    expect(splitPlatformFee(1, [])).toEqual([]);
  });

  it("guarda: a fatia nunca alcança o valor da parte (bar recebe ≥ 1 centavo)", () => {
    expect(splitPlatformFee(5, [1, 1])).toEqual([0.99, 0.99]);
  });
});
