import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const m = vi.hoisted(() => ({
  findUnique: vi.fn(),
  paymentUpdate: vi.fn(),
  createWalletPayment: vi.fn(),
  getCards: vi.fn(),
  /** Provider Tuna REAL (guarda de prontidão); null = provider falso (PagBank). */
  real: null as null | import("@/lib/payments/types").PaymentProvider,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    order: { findUnique: m.findUnique },
    payment: { update: m.paymentUpdate },
  },
}));
vi.mock("@/lib/payments", () => ({
  resolveWalletGateway: () => (m.real ? "TUNA" : "PAGBANK"),
  getProviderByName: () => m.real ?? { name: "PAGBANK", createWalletPayment: m.createWalletPayment },
}));
vi.mock("@/lib/db/settings", () => ({ getTunaCardsEnabled: m.getCards }));

import { payOrderWithWallet } from "@/lib/db/payments";
import { PagbankError } from "@/lib/payments/pagbank";
import { PagarmeError } from "@/lib/payments/pagarme";
import { TunaError, tunaProvider, __setTunaModeForTests } from "@/lib/payments/tuna";

beforeEach(() => {
  vi.clearAllMocks();
  m.findUnique.mockResolvedValue({
    id: "o1",
    code: "ABC123",
    status: "AWAITING_PAYMENT",
    total: 50,
    platformFee: 4,
    establishment: { id: "e1" },
    payment: { id: "p1" },
  });
});

describe("payOrderWithWallet - erro do gateway", () => {
  it("4xx do PagBank → recusa definitiva (sem uncertain)", async () => {
    m.createWalletPayment.mockRejectedValue(new PagbankError(400, "cartão recusado"));
    const r = await payOrderWithWallet("o1", "google_pay", "tok");
    expect(r.status).toBe("failed");
    expect(r.uncertain).toBeUndefined();
    expect(m.paymentUpdate).not.toHaveBeenCalled();
  });
  it("4xx do Pagar.me → recusa definitiva (sem uncertain)", async () => {
    m.createWalletPayment.mockRejectedValue(new PagarmeError(422, "token inválido"));
    const r = await payOrderWithWallet("o1", "apple_pay", "tok");
    expect(r.status).toBe("failed");
    expect(r.uncertain).toBeUndefined();
  });
  it("5xx do gateway → uncertain", async () => {
    m.createWalletPayment.mockRejectedValue(new PagbankError(502, "bad gateway"));
    const r = await payOrderWithWallet("o1", "google_pay", "tok");
    expect(r).toMatchObject({ status: "failed", uncertain: true });
    expect(m.paymentUpdate).not.toHaveBeenCalled();
  });
  it("rede/timeout → uncertain", async () => {
    m.createWalletPayment.mockRejectedValue(new TypeError("fetch failed"));
    const r = await payOrderWithWallet("o1", "google_pay", "tok");
    expect(r).toMatchObject({ status: "failed", uncertain: true });
  });
  it("erro da Tuna → só a mensagem curta, nunca o corpo cru", async () => {
    const body = JSON.stringify({ code: -1, customer: { document: "12345678909" }, message: { message: "Recusado" } });
    m.createWalletPayment.mockRejectedValue(new TunaError(422, -1, body));
    expect(await payOrderWithWallet("o1", "google_pay", "tok")).toEqual({ status: "failed", statusDetail: "Recusado" });
    m.createWalletPayment.mockRejectedValue(new TunaError(502, null, "<html>12345678909</html>"));
    expect(await payOrderWithWallet("o1", "google_pay", "tok")).toEqual({
      status: "failed",
      statusDetail: "tuna:502",
      uncertain: true,
    });
  });
  it("aprovado → grava a cobrança (sem uncertain)", async () => {
    m.createWalletPayment.mockResolvedValue({ chargeId: "ch_1", status: "pending" });
    const r = await payOrderWithWallet("o1", "google_pay", "tok");
    expect(r).toEqual({ status: "pending", statusDetail: undefined });
    expect(m.paymentUpdate).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { gatewayChargeId: "ch_1", provider: "PAGBANK" },
    });
  });
});

describe("payOrderWithWallet — guarda de prontidão da Tuna (provider real)", () => {
  let fetchFn: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    m.real = tunaProvider;
    m.getCards.mockResolvedValue(true);
    process.env.TUNA_TEST_SLUGS = "bar-teste";
    process.env.TUNA_ACCOUNT_TEST = "acc_t";
    process.env.TUNA_APPTOKEN_TEST = "tok_t";
    fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);
    m.findUnique.mockResolvedValue({
      id: "o1",
      code: "ABC123",
      status: "AWAITING_PAYMENT",
      total: 50,
      platformFee: 4,
      establishment: {
      id: "e1",
      slug: "bar-teste",
      tunaMerchantExternalId: "jur_e1",
      tunaMerchantEnv: "TEST",
      tunaPixStatus: "active",
      tunaCardStatus: "active",
    },
      payment: { id: "p1" },
    });
  });
  afterEach(() => {
    m.real = null;
    __setTunaModeForTests(null);
    delete process.env.TUNA_TEST_SLUGS;
    delete process.env.TUNA_ACCOUNT_TEST;
    delete process.env.TUNA_APPTOKEN_TEST;
    vi.unstubAllGlobals();
  });

  it("cartões da Tuna desligados → failed definitivo (sem uncertain), nem NewSession", async () => {
    __setTunaModeForTests("TEST");
    m.getCards.mockResolvedValue(false);
    expect(await payOrderWithWallet("o1", "google_pay", "tok")).toEqual({
      status: "failed",
      statusDetail: "bar não está pronto na Tuna (cartão, TEST)",
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(m.paymentUpdate).not.toHaveBeenCalled();
  });

  it("modo em PRODUCTION com o bar cadastrado em TEST → failed definitivo, nada enviado", async () => {
    __setTunaModeForTests("PRODUCTION");
    const r = await payOrderWithWallet("o1", "apple_pay", "tok");
    expect(r).toEqual({ status: "failed", statusDetail: "bar não está pronto na Tuna (cartão, PRODUCTION)" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
