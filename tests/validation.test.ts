import { describe, it, expect } from "vitest";
import { loginSchema, orderCreateSchema, leadCreateSchema } from "@/lib/validation";

describe("loginSchema", () => {
  it("aceita credenciais válidas", () => {
    const r = loginSchema.safeParse({ email: "a@b.com", password: "x", remember: true });
    expect(r.success).toBe(true);
  });
  it("aceita usuário (não-email) como identificador", () => {
    expect(loginSchema.safeParse({ email: "bardoze", password: "x" }).success).toBe(true);
  });
  it("rejeita identificador vazio", () => {
    expect(loginSchema.safeParse({ email: "", password: "x" }).success).toBe(false);
  });
  it("aplica remember=false por padrão", () => {
    const r = loginSchema.parse({ email: "a@b.com", password: "x" });
    expect(r.remember).toBe(false);
  });
});

describe("orderCreateSchema", () => {
  const base = {
    establishmentId: "e1",
    locationLabel: "Guarda-sol nº 14",
    items: [{ name: "Combo", qty: 1, unitPrice: 99 }],
  };
  it("aceita pagamento total", () => {
    const r = orderCreateSchema.safeParse({
      ...base,
      payment: { kind: "full", method: "PIX" },
    });
    expect(r.success).toBe(true);
  });
  it("aceita split de 2 a 8", () => {
    const r = orderCreateSchema.safeParse({
      ...base,
      payment: { kind: "split", shares: [{ method: "PIX" }, { method: null }] },
    });
    expect(r.success).toBe(true);
  });
  it("rejeita split de 1 pessoa", () => {
    const r = orderCreateSchema.safeParse({
      ...base,
      payment: { kind: "split", shares: [{ method: "PIX" }] },
    });
    expect(r.success).toBe(false);
  });
  it("rejeita pedido sem itens", () => {
    const r = orderCreateSchema.safeParse({
      ...base,
      items: [],
      payment: { kind: "full", method: "PIX" },
    });
    expect(r.success).toBe(false);
  });
});

describe("leadCreateSchema", () => {
  it("exige nome e estabelecimento", () => {
    expect(leadCreateSchema.safeParse({ name: "", establishmentName: "" }).success).toBe(false);
    expect(
      leadCreateSchema.safeParse({ name: "Ana", establishmentName: "Bar X" }).success,
    ).toBe(true);
  });
});
