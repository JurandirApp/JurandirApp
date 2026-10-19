import { describe, it, expect } from "vitest";
import { cardChargeMethod } from "@/lib/db/payments";

describe("cardChargeMethod", () => {
  it("deriva o tipo da cobrança do método gravado no pedido", () => {
    expect(cardChargeMethod("DEBIT")).toBe("debit");
    expect(cardChargeMethod("CREDIT")).toBe("credit");
    expect(cardChargeMethod("PIX")).toBeNull();
    expect(cardChargeMethod(null)).toBeNull();
  });
});
