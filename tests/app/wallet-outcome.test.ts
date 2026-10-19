import { describe, it, expect } from "vitest";
import { amountMatches, toCents, walletOutcome } from "@/lib/app/wallet-outcome";

describe("walletOutcome", () => {
  const order = { dbId: "o1" };
  it("paid → paid", () => {
    expect(walletOutcome({ ok: true, status: "paid", order })).toBe("paid");
    expect(walletOutcome({ ok: true, status: "paid" })).toBe("paid");
  });
  it("pending → pending", () => {
    expect(walletOutcome({ ok: true, status: "pending", order })).toBe("pending");
    expect(walletOutcome({ ok: true, status: "pending" })).toBe("pending");
  });
  it("failed COM pedido → declined (recusa real do gateway)", () => {
    expect(walletOutcome({ ok: false, status: "failed", order })).toBe("declined");
  });
  it("failed SEM pedido → unknown (exceção no servidor; pode ter cobrado)", () => {
    expect(walletOutcome({ ok: false, status: "failed" })).toBe("unknown");
    expect(walletOutcome({ ok: false, status: "failed", order: undefined })).toBe("unknown");
  });
  it("action lançou (rede/servidor) → unknown", () => {
    expect(walletOutcome("exception")).toBe("unknown");
  });
});

describe("amountMatches", () => {
  it("mesmo valor em centavos → true", () => {
    expect(amountMatches(12.5, 1250)).toBe(true);
    expect(amountMatches(0.1 + 0.2, 30)).toBe(true);
    expect(amountMatches(toCents(57.23) / 100, toCents(57.23))).toBe(true);
  });
  it("valor diferente (carrinho mudou com a folha aberta) → false", () => {
    expect(amountMatches(12.5, 1251)).toBe(false);
    expect(amountMatches(25, 1250)).toBe(false);
  });
  it("valor inválido → false", () => {
    expect(amountMatches(Number.NaN, 0)).toBe(false);
    expect(amountMatches(Number.POSITIVE_INFINITY, 1250)).toBe(false);
  });
});

describe("toCents", () => {
  it("arredonda para centavos inteiros", () => {
    expect(toCents(12.5)).toBe(1250);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(1234.567)).toBe(123457);
  });
});
