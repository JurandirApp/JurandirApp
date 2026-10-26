import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  register: vi.fn(),
  getMode: vi.fn(),
  getCards: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { establishment: { findUnique: m.findUnique, update: m.update } },
}));
vi.mock("@/lib/db/settings", () => ({ getTunaMode: m.getMode, getTunaCardsEnabled: m.getCards }));
vi.mock("@/lib/payments/tuna", async (orig) => {
  const real = await orig<typeof import("@/lib/payments/tuna")>();
  return { ...real, registerTunaMerchant: m.register, ensureTunaMode: async () => "TEST" as const };
});

import { registerEstablishmentInTuna, getEstablishmentTunaStatus } from "@/lib/db/tuna";
import { TunaError } from "@/lib/payments/tuna";

const form = {
  documentType: "CNPJ", document: "12.345.678/0001-90", name: "Bar LTDA", fantasyName: "Bar",
  pixKeyType: "2", pixKey: "12345678000190",
  contact: { name: "Ze", email: "ze@bar.com", phone: "11999990000" },
  legalRepresentative: { name: "Ze", document: "123.456.789-09", birthday: "1980-01-02" },
  bank: { bankCode: "341", agency: "1234", account: "0733-7", accountType: "C" },
  address: { street: "Rua A", number: "10", neighborhood: "Centro", city: "SP", state: "sp", postalCode: "01000-000" },
  acceptedContract: true,
};
const est = (o: Record<string, unknown> = {}) => ({
  slug: "bar-do-ze", tunaMerchantEnv: null, tunaPixStatus: null, tunaCardStatus: null, ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TUNA_MERCHANT_CONDITION = "cond1";
  process.env.TUNA_TEST_SLUGS = "bar-do-ze";
  m.findUnique.mockResolvedValue(est());
  m.update.mockResolvedValue({});
  m.register.mockResolvedValue({ merchantId: "86" });
  m.getMode.mockResolvedValue("TEST");
  m.getCards.mockResolvedValue(false);
});

describe("registerEstablishmentInTuna", () => {
  it("formulário inválido → invalid", async () => {
    expect(await registerEstablishmentInTuna("e1", {})).toEqual({ ok: false, error: "invalid" });
  });
  it("sem condition → notConfigured", async () => {
    process.env.TUNA_MERCHANT_CONDITION = "";
    expect(await registerEstablishmentInTuna("e1", form)).toEqual({ ok: false, error: "notConfigured" });
  });
  it("TEST + slug fora da allowlist → notAvailable (sem chamar a Tuna)", async () => {
    process.env.TUNA_TEST_SLUGS = "outro";
    expect(await registerEstablishmentInTuna("e1", form)).toEqual({ ok: false, error: "notAvailable" });
    expect(m.register).not.toHaveBeenCalled();
  });
  it.each(["analysis", "active"])("mesmo ambiente + %s → alreadyRegistered", async (st) => {
    m.findUnique.mockResolvedValue(est({ tunaMerchantEnv: "TEST", tunaPixStatus: st, tunaCardStatus: st }));
    expect(await registerEstablishmentInTuna("e1", form)).toEqual({ ok: false, error: "alreadyRegistered" });
    expect(m.register).not.toHaveBeenCalled();
  });
  it("outro ambiente → permite recadastro", async () => {
    m.findUnique.mockResolvedValue(est({ tunaMerchantEnv: "PRODUCTION", tunaPixStatus: "active", tunaCardStatus: "active" }));
    expect((await registerEstablishmentInTuna("e1", form)).ok).toBe(true);
  });
  it.each(["rejected", "error"])("mesmo ambiente + %s → permite recadastro", async (st) => {
    m.findUnique.mockResolvedValue(est({ tunaMerchantEnv: "TEST", tunaPixStatus: st, tunaCardStatus: st }));
    expect((await registerEstablishmentInTuna("e1", form)).ok).toBe(true);
  });
  it("sucesso: persiste antes da chamada e depois grava merchantId; documentos só dígitos", async () => {
    expect(await registerEstablishmentInTuna("e1", form)).toEqual({ ok: true });
    const first = m.update.mock.calls[0][0].data;
    expect(first).toMatchObject({
      tunaMerchantExternalId: "jur_e1", tunaMerchantEnv: "TEST", tunaPixStatus: "analysis", tunaCardStatus: "analysis",
      tunaMerchantId: null,
    });
    expect(first.tunaContractAcceptedAt).toBeInstanceOf(Date);
    expect(m.update.mock.invocationCallOrder[0]).toBeLessThan(m.register.mock.invocationCallOrder[0]);
    expect(m.update.mock.calls[1][0].data).toEqual({ tunaMerchantId: "86" });
    const sent = m.register.mock.calls[0][0];
    expect(sent.document).toBe("12345678000190");
    expect(sent.address).toMatchObject({ postalCode: "01000000", state: "SP" });
  });
  it("5xx / rede → tryLater e statuses seguem analysis", async () => {
    for (const err of [new TunaError(503, null, "x"), new Error("fetch failed")]) {
      m.update.mockClear();
      m.register.mockRejectedValueOnce(err);
      expect(await registerEstablishmentInTuna("e1", form)).toEqual({ ok: false, error: "tryLater" });
      expect(m.update).toHaveBeenCalledTimes(1);
    }
  });
  it("resposta sem merchantId → tryLater", async () => {
    m.register.mockResolvedValue({ merchantId: "" });
    expect(await registerEstablishmentInTuna("e1", form)).toEqual({ ok: false, error: "tryLater" });
  });
  it("recusa definitiva → statuses error + mensagem da Tuna", async () => {
    m.register.mockRejectedValue(
      new TunaError(422, -124, JSON.stringify({ code: -124, message: { message: "Documento inválido" } })),
    );
    expect(await registerEstablishmentInTuna("e1", form)).toEqual({ ok: false, error: "Documento inválido" });
    expect(m.update.mock.calls[1][0].data).toEqual({ tunaPixStatus: "error", tunaCardStatus: "error" });
  });
});

describe("getEstablishmentTunaStatus", () => {
  it("status de outro ambiente → null", async () => {
    m.findUnique.mockResolvedValue(est({ tunaMerchantEnv: "PRODUCTION", tunaPixStatus: "active", tunaCardStatus: "active" }));
    expect(await getEstablishmentTunaStatus("e1")).toMatchObject({ registered: false, pixStatus: null, cardStatus: null });
  });
  it("mesmo ambiente → devolve os status", async () => {
    m.findUnique.mockResolvedValue(est({ tunaMerchantEnv: "TEST", tunaPixStatus: "analysis", tunaCardStatus: "active" }));
    expect(await getEstablishmentTunaStatus("e1")).toMatchObject({ registered: true, pixStatus: "analysis", cardStatus: "active" });
  });
});
