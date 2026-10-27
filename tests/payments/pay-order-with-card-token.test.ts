import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const m = vi.hoisted(() => ({
  findUnique: vi.fn(),
  paymentUpdate: vi.fn(),
  createCardTokenPayment: vi.fn(),
  providerName: "TUNA",
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    order: { findUnique: m.findUnique },
    payment: { update: m.paymentUpdate },
  },
}));
vi.mock("@/lib/payments", () => ({
  resolveWalletGateway: () => "TUNA",
  getProviderByName: () => ({ name: m.providerName, createCardTokenPayment: m.createCardTokenPayment }),
}));

import { payOrderWithCardToken } from "@/lib/db/payments";
import { TunaError } from "@/lib/payments/tuna";
import { PagarmeError } from "@/lib/payments/pagarme";

const SESSION = "sess_SEGREDO_123";
const CARD = "ct_TOKEN_CARTAO_999";
const CPF = "12345678909";

let warn: ReturnType<typeof vi.spyOn>;

function useGateway(provider: "TUNA" | "PAGARME") {
  m.providerName = provider;
  m.findUnique.mockResolvedValue({
    id: "o1",
    code: "ABC123",
    status: "AWAITING_PAYMENT",
    total: 50,
    platformFee: 4,
    customerName: "Ana Souza",
    customerPhone: null,
    establishment: { id: "e1" },
    payment: { id: "p1", method: "CREDIT", provider },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  useGateway("TUNA");
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

/** Nenhum log pode conter sessão, token do cartão ou CPF. */
function expectNoSecretsLogged() {
  const logged = JSON.stringify(warn.mock.calls);
  expect(logged).not.toContain(SESSION);
  expect(logged).not.toContain(CARD);
  expect(logged).not.toContain(CPF);
}

const pay = (tuna?: Parameters<typeof payOrderWithCardToken>[7]) =>
  payOrderWithCardToken("o1", CARD, 1, "credit", CPF, undefined, undefined, tuna);

describe("payOrderWithCardToken — Tuna", () => {
  it("repassa o `tuna` ao provider e devolve o desafio 3DS (grava a cobrança)", async () => {
    const challenge = { url: "https://acs.example/challenge", token: "jwt", paRequest: "pa" };
    m.createCardTokenPayment.mockResolvedValue({ chargeId: "PK1", status: "pending", challenge });
    const tuna = { sessionId: SESSION, brand: "Visa", threeDs: { referenceId: "r1", transactionId: "t1" } };
    const r = await pay(tuna);
    expect(m.createCardTokenPayment.mock.calls[0][0]).toMatchObject({ tuna, cardToken: CARD, method: "credit" });
    expect(r).toEqual({ status: "pending", statusDetail: undefined, challenge });
    expect(m.paymentUpdate).toHaveBeenCalledWith({ where: { id: "p1" }, data: { gatewayChargeId: "PK1" } });
  });

  it("recusa definitiva (code < 0) → failed com a mensagem curta da Tuna, nunca o corpo cru", async () => {
    const body = JSON.stringify({
      code: -111,
      customer: { document: CPF },
      tokenSession: SESSION,
      message: { source: 1, code: "SRVX", message: "Cartão recusado pelo emissor" },
    });
    m.createCardTokenPayment.mockRejectedValue(new TunaError(422, -111, body));
    const r = await pay({ sessionId: SESSION });
    expect(r).toEqual({ status: "failed", statusDetail: "Cartão recusado pelo emissor" });
    expect(m.paymentUpdate).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    expectNoSecretsLogged();
  });

  it("recusa definitiva sem mensagem legível → tuna:<status>", async () => {
    m.createCardTokenPayment.mockRejectedValue(new TunaError(422, null, `<html>${CPF}</html>`));
    const r = await pay({ sessionId: SESSION });
    expect(r).toEqual({ status: "failed", statusDetail: "tuna:422" });
    expectNoSecretsLogged();
  });

  it("recusa local (débito sem 3DS) → failed com o texto da recusa", async () => {
    m.createCardTokenPayment.mockRejectedValue(
      new TunaError(422, null, JSON.stringify({ message: "débito Tuna exige autenticação 3DS" })),
    );
    expect(await pay({ sessionId: SESSION })).toEqual({
      status: "failed",
      statusDetail: "débito Tuna exige autenticação 3DS",
    });
  });

  it("incerto (5xx / -108 retentativa) → pending, sem gravar cobrança", async () => {
    m.createCardTokenPayment.mockRejectedValue(
      new TunaError(503, -108, JSON.stringify({ code: -108, tokenSession: SESSION, document: CPF })),
    );
    const r = await pay({ sessionId: SESSION });
    expect(r).toEqual({ status: "pending" });
    expect(m.paymentUpdate).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    expectNoSecretsLogged();
  });

  it("HTML de 502 → pending, sem ecoar o corpo", async () => {
    m.createCardTokenPayment.mockRejectedValue(new TunaError(502, null, `<html>${CPF}</html>`));
    expect(await pay({ sessionId: SESSION })).toEqual({ status: "pending" });
    expectNoSecretsLogged();
  });

  it("rede/timeout (erro comum) → pending", async () => {
    m.createCardTokenPayment.mockRejectedValue(new TypeError("fetch failed"));
    expect(await pay({ sessionId: SESSION })).toEqual({ status: "pending" });
  });

  it("sem `tuna` → o input do provider não ganha a chave", async () => {
    m.createCardTokenPayment.mockResolvedValue({ chargeId: "PK2", status: "pending" });
    await payOrderWithCardToken("o1", CARD, 1, "credit");
    expect(m.createCardTokenPayment.mock.calls[0][0]).not.toHaveProperty("tuna");
  });
});

describe("payOrderWithCardToken — outros gateways (comportamento inalterado)", () => {
  beforeEach(() => useGateway("PAGARME"));

  it("erro do Pagar.me → failed com a mensagem do erro, como antes", async () => {
    const e = new PagarmeError(422, "token inválido");
    m.createCardTokenPayment.mockRejectedValue(e);
    const r = await payOrderWithCardToken("o1", CARD, 1, "credit");
    expect(r).toEqual({ status: "failed", statusDetail: e.message });
  });

  it("5xx do Pagar.me continua failed (sem pending)", async () => {
    const e = new PagarmeError(502, "bad gateway");
    m.createCardTokenPayment.mockRejectedValue(e);
    const r = await payOrderWithCardToken("o1", CARD, 1, "credit");
    expect(r).toEqual({ status: "failed", statusDetail: e.message });
  });

  it("resultado sem desafio mantém o formato { status, statusDetail }", async () => {
    m.createCardTokenPayment.mockResolvedValue({ chargeId: "ch_1", status: "pending", statusDetail: "x" });
    const r = await payOrderWithCardToken("o1", CARD, 1, "credit");
    expect(r).toEqual({ status: "pending", statusDetail: "x" });
    expect(Object.keys(r)).toEqual(["status", "statusDetail"]);
  });
});
