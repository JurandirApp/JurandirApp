import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  register: vi.fn(),
  getMode: vi.fn(),
  getCards: vi.fn(),
  ensureMode: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    establishment: { findUnique: m.findUnique, findMany: m.findMany, update: m.update, updateMany: m.updateMany },
  },
}));
vi.mock("@/lib/db/settings", () => ({ getTunaMode: m.getMode, getTunaCardsEnabled: m.getCards }));
vi.mock("@/lib/payments/tuna", async (orig) => {
  const real = await orig<typeof import("@/lib/payments/tuna")>();
  return { ...real, registerTunaMerchant: m.register, ensureTunaMode: m.ensureMode };
});

import { registerEstablishmentInTuna, getEstablishmentTunaStatus, rerouteUnreadyTunaBars } from "@/lib/db/tuna";
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
  m.ensureMode.mockResolvedValue("TEST");
  m.findMany.mockResolvedValue([]);
  m.updateMany.mockResolvedValue({ count: 1 });
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
    for (const err of [new TunaError(503, null, "x"), new TunaError(502, null, ""), new Error("fetch failed")]) {
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
  it("modo da Tuna indisponível (fail closed) → tryLater, sem gravar nem chamar a Tuna", async () => {
    m.ensureMode.mockRejectedValue(new TunaError(424, null, JSON.stringify({ message: "modo da Tuna indisponível" })));
    expect(await registerEstablishmentInTuna("e1", form)).toEqual({ ok: false, error: "tryLater" });
    expect(m.update).not.toHaveBeenCalled();
    expect(m.register).not.toHaveBeenCalled();
  });
  it("falha no Register → loga só o resumo do erro + id do bar (nunca corpo/documento)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const bodies = [
        new TunaError(422, -124, JSON.stringify({ code: -124, document: "12345678000190", message: { message: "Doc 12345678000190 inválido" } })),
        new TunaError(503, null, JSON.stringify({ legalRepresentative: { document: "12345678909" } })),
      ];
      for (const err of bodies) {
        warn.mockClear();
        m.register.mockRejectedValueOnce(err);
        await registerEstablishmentInTuna("e1", form);
        const out = JSON.stringify(warn.mock.calls);
        expect(out).toContain("[tuna/register]");
        expect(out).toContain("e1");
        expect(out).toContain("TunaError " + err.status);
        expect(out).not.toContain("12345678000190");
        expect(out).not.toContain("12345678909");
      }
    } finally {
      warn.mockRestore();
    }
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

describe("rerouteUnreadyTunaBars", () => {
  type Bar = {
    id: string; slug: string; tunaMerchantEnv: "TEST" | "PRODUCTION" | null;
    tunaPixStatus: string | null; tunaCardStatus: string | null;
    gatewayPix: string; gatewayCredit: string; gatewayDebit: string; gatewayApplePay: string; gatewayGooglePay: string;
  };
  const bar = (o: Partial<Bar> = {}): Bar => ({
    id: "e1", slug: "bar-do-ze", tunaMerchantEnv: "TEST", tunaPixStatus: "active", tunaCardStatus: "active",
    gatewayPix: "TUNA", gatewayCredit: "TUNA", gatewayDebit: "TUNA", gatewayApplePay: "TUNA", gatewayGooglePay: "TUNA",
    ...o,
  });
  type UpdateArg = { where: Record<string, unknown> & { id: { in: string[] } }; data: Record<string, string> };
  /** Campo → { ids, valor novo } de cada updateMany feito. */
  const updates = () =>
    Object.fromEntries(
      (m.updateMany.mock.calls as [UpdateArg][]).map(([a]) => {
        const [field, value] = Object.entries(a.data)[0];
        expect(a.where[field]).toBe("TUNA"); // só troca o que AINDA é Tuna
        return [field, { ids: a.where.id.in, value }];
      }),
    );

  it("busca só bares com algum método na Tuna", async () => {
    await rerouteUnreadyTunaBars("TEST", true);
    expect(m.findMany.mock.calls[0][0].where).toEqual({
      OR: [
        { gatewayPix: "TUNA" }, { gatewayCredit: "TUNA" }, { gatewayDebit: "TUNA" },
        { gatewayApplePay: "TUNA" }, { gatewayGooglePay: "TUNA" },
      ],
    });
  });

  it("modo virou PRODUCTION: bar cadastrado em TEST volta pro padrão em todos os métodos", async () => {
    m.findMany.mockResolvedValue([bar({ id: "e1", tunaMerchantEnv: "TEST" })]);
    expect(await rerouteUnreadyTunaBars("PRODUCTION", true)).toBe(1);
    expect(updates()).toEqual({
      gatewayPix: { ids: ["e1"], value: "MERCADO_PAGO" },
      gatewayCredit: { ids: ["e1"], value: "MERCADO_PAGO" },
      gatewayDebit: { ids: ["e1"], value: "MERCADO_PAGO" },
      gatewayApplePay: { ids: ["e1"], value: "PAGARME" },
      gatewayGooglePay: { ids: ["e1"], value: "PAGARME" },
    });
  });

  it("modo virou TEST: bar cadastrado em PRODUCTION volta pro padrão", async () => {
    m.findMany.mockResolvedValue([bar({ id: "e2", tunaMerchantEnv: "PRODUCTION" })]);
    expect(await rerouteUnreadyTunaBars("TEST", true)).toBe(1);
    expect(Object.keys(updates())).toHaveLength(5);
  });

  it("cartões desligados: só crédito/débito/carteiras na Tuna voltam; Pix fica", async () => {
    m.findMany.mockResolvedValue([bar()]);
    expect(await rerouteUnreadyTunaBars("TEST", false)).toBe(1);
    const u = updates();
    expect(u).not.toHaveProperty("gatewayPix");
    expect(u).toEqual({
      gatewayCredit: { ids: ["e1"], value: "MERCADO_PAGO" },
      gatewayDebit: { ids: ["e1"], value: "MERCADO_PAGO" },
      gatewayApplePay: { ids: ["e1"], value: "PAGARME" },
      gatewayGooglePay: { ids: ["e1"], value: "PAGARME" },
    });
  });

  it("bar pronto fica intocado (0 alterados)", async () => {
    m.findMany.mockResolvedValue([bar()]);
    expect(await rerouteUnreadyTunaBars("TEST", true)).toBe(0);
    expect(m.updateMany).not.toHaveBeenCalled();
  });

  it("rotas que não são Tuna ficam intocadas", async () => {
    m.findMany.mockResolvedValue([
      bar({ id: "e3", tunaMerchantEnv: "PRODUCTION", gatewayCredit: "PAGARME", gatewayDebit: "PAGBANK", gatewayApplePay: "PAGARME", gatewayGooglePay: "PAGBANK" }),
    ]);
    expect(await rerouteUnreadyTunaBars("TEST", true)).toBe(1);
    expect(updates()).toEqual({ gatewayPix: { ids: ["e3"], value: "MERCADO_PAGO" } });
  });

  it("TEST com bar fora de TUNA_TEST_SLUGS → volta; vários bares contam uma vez cada", async () => {
    m.findMany.mockResolvedValue([
      bar({ id: "e1" }), // pronto
      bar({ id: "e4", slug: "outro" }), // invisível em TEST
      bar({ id: "e5", tunaPixStatus: "analysis", gatewayCredit: "MERCADO_PAGO", gatewayDebit: "MERCADO_PAGO", gatewayApplePay: "PAGARME", gatewayGooglePay: "PAGARME" }),
    ]);
    expect(await rerouteUnreadyTunaBars("TEST", true)).toBe(2);
    const u = updates();
    expect(u.gatewayPix).toEqual({ ids: ["e4", "e5"], value: "MERCADO_PAGO" });
    expect(u.gatewayCredit).toEqual({ ids: ["e4"], value: "MERCADO_PAGO" });
  });

  it("usa o modo e a chave PASSADOS (não lê banco/cache) e loga só a contagem", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      m.findMany.mockResolvedValue([bar({ id: "e1", tunaMerchantEnv: "PRODUCTION" })]);
      expect(await rerouteUnreadyTunaBars("PRODUCTION", true)).toBe(0);
      expect(m.getMode).not.toHaveBeenCalled();
      expect(m.getCards).not.toHaveBeenCalled();
      expect(m.ensureMode).not.toHaveBeenCalled();
      const out = JSON.stringify(log.mock.calls);
      expect(out).toContain("[tuna/reroute]");
      expect(out).not.toContain("bar-do-ze");
    } finally {
      log.mockRestore();
    }
  });
});
