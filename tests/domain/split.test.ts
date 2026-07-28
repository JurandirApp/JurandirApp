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
