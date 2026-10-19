import { describe, it, expect } from "vitest";
import { aggregateDebitPayout, type DebitPayoutInput } from "@/lib/domain/payout";

const base = { establishmentId: "e1", nome: "Bar", splitToEstablishment: null };
const row = (o: Partial<DebitPayoutInput>): DebitPayoutInput => ({
  ...base,
  provider: "PAGARME",
  total: 0,
  platformFee: 0,
  ...o,
});

describe("aggregateDebitPayout", () => {
  it("separa o mesmo bar por gateway", () => {
    const out = aggregateDebitPayout([
      row({ provider: "PAGARME", total: 50, platformFee: 4 }),
      row({ provider: "PAGBANK", total: 20, platformFee: 1.6 }),
      row({ provider: "PAGBANK", total: 30, platformFee: 2.4 }),
    ]);
    expect(out).toHaveLength(2);
    const pb = out.find((r) => r.gateway === "PAGBANK")!;
    const pg = out.find((r) => r.gateway === "PAGARME")!;
    expect(pb).toMatchObject({ qtd: 2, bruto: 50, taxa: 4 });
    expect(pb.aRepassar).toBeCloseTo(46);
    expect(pg).toMatchObject({ qtd: 1, bruto: 50, taxa: 4 });
    expect(pg.aRepassar).toBeCloseTo(46);
  });

  it("splitToEstablishment vence o cálculo", () => {
    const out = aggregateDebitPayout([row({ total: 50, platformFee: 4, splitToEstablishment: 40 })]);
    expect(out[0].aRepassar).toBe(40);
  });

  it("ordena por aRepassar desc", () => {
    const out = aggregateDebitPayout([
      row({ establishmentId: "a", total: 10, platformFee: 1 }),
      row({ establishmentId: "b", total: 100, platformFee: 8 }),
    ]);
    expect(out.map((r) => r.establishmentId)).toEqual(["b", "a"]);
  });
});
