import { describe, it, expect } from "vitest";
import { walletChargeDecision } from "@/lib/payments/wallet-web";

describe("walletChargeDecision", () => {
  it("charge → charge", () => {
    expect(walletChargeDecision({ kind: "charge" })).toBe("charge");
  });
  it("settled paid nunca cobra", () => {
    expect(walletChargeDecision({ kind: "settled", status: "paid" })).toBe("settled");
  });
  it("settled pending nunca cobra", () => {
    expect(walletChargeDecision({ kind: "settled", status: "pending" })).toBe("settled");
  });
  it("notfound → notfound", () => {
    expect(walletChargeDecision({ kind: "notfound" })).toBe("notfound");
  });
});
