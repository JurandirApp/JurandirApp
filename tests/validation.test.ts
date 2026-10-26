import { describe, it, expect } from "vitest";
import { loginSchema, orderCreateSchema, leadCreateSchema, tunaMerchantSchema } from "@/lib/validation";

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

describe("tunaMerchantSchema", () => {
  const base = {
    documentType: "CNPJ", document: "12345678000190", name: "Bar LTDA", fantasyName: "Bar",
    pixKeyType: "2", pixKey: "12345678000190",
    contact: { name: "Ze", email: "ze@bar.com", phone: "11999990000" },
    legalRepresentative: { name: "Ze", document: "12345678909", birthday: "1980-01-02" },
    bank: { bankCode: "341", agency: "1234", account: "0733-7", accountType: "C" },
    address: { street: "Rua A", number: "10", neighborhood: "Centro", city: "SP", state: "SP", postalCode: "01000000" },
    acceptedContract: true,
  };
  it("aceita CNPJ completo (stateFiscalDocument default ISENTO)", () => {
    const r = tunaMerchantSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.stateFiscalDocument).toBe("ISENTO");
  });
  it("rejeita acceptedContract false", () => {
    expect(tunaMerchantSchema.safeParse({ ...base, acceptedContract: false }).success).toBe(false);
  });
  it("rejeita PF sem birthday; aceita com PF completo", () => {
    const pf = { ...base, documentType: "CPF", document: "12345678909" };
    expect(tunaMerchantSchema.safeParse(pf).success).toBe(false);
    expect(
      tunaMerchantSchema.safeParse({ ...pf, birthday: "1990-01-01", motherName: "M", occupation: "O" }).success,
    ).toBe(true);
  });
  it("rejeita UF de 3 letras", () => {
    expect(tunaMerchantSchema.safeParse({ ...base, address: { ...base.address, state: "SPX" } }).success).toBe(false);
  });
});
