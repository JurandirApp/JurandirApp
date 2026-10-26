import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const m = vi.hoisted(() => ({
  handlePayment: vi.fn(),
  applyMerchant: vi.fn(),
}));

vi.mock("@/lib/db/tuna-webhook", () => ({
  handleTunaPaymentWebhook: m.handlePayment,
  applyTunaMerchantWebhook: m.applyMerchant,
}));

import { POST as paymentPOST } from "@/app/api/webhooks/tuna/route";
import { POST as merchantPOST } from "@/app/api/webhooks/tuna/merchant/route";
import { TunaError } from "@/lib/payments/tuna";

const ENV_KEYS = [
  "TUNA_WEBHOOK_SECRET",
  "TUNA_WEBHOOK_SECRET_TEST",
  "TUNA_MERCHANT_WEBHOOK_SECRET",
  "TUNA_MERCHANT_WEBHOOK_SECRET_TEST",
];

const req = (body: unknown, auth?: string) =>
  new Request("https://jurandir.app.br/api/webhooks/tuna", {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const pixPaid = {
  id: 104574372,
  paymentKey: "134D946015A08C9",
  partnerUniqueId: "ABC123",
  statusId: "2",
  amount: 19.5,
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ENV_KEYS) delete process.env[k];
  m.handlePayment.mockResolvedValue("reconciled");
  m.applyMerchant.mockResolvedValue("updated");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/tuna (pagamento)", () => {
  it("segredo configurado e header errado/ausente → 401, sem reconciliar", async () => {
    process.env.TUNA_WEBHOOK_SECRET = "s-prod";
    expect((await paymentPOST(req(pixPaid, "Bearer errado"))).status).toBe(401);
    expect((await paymentPOST(req(pixPaid))).status).toBe(401);
    expect(m.handlePayment).not.toHaveBeenCalled();
  });

  it("segredo certo (prod ou teste) → reconcilia pelo paymentKey + partnerUniqueId e responde 200", async () => {
    process.env.TUNA_WEBHOOK_SECRET = "s-prod";
    process.env.TUNA_WEBHOOK_SECRET_TEST = "s-test";
    expect((await paymentPOST(req(pixPaid, "Bearer s-test"))).status).toBe(200);
    expect((await paymentPOST(req(pixPaid, "Bearer s-prod"))).status).toBe(200);
    expect(m.handlePayment).toHaveBeenCalledWith("134D946015A08C9", "ABC123");
  });

  it("corpo inválido ou sem paymentKey → 200 sem reconciliar", async () => {
    expect((await paymentPOST(req("{nao é json"))).status).toBe(200);
    expect((await paymentPOST(req({ statusId: "2" }))).status).toBe(200);
    expect(m.handlePayment).not.toHaveBeenCalled();
  });

  it("erro transitório (banco/rede) ao reconciliar → 500 (a Tuna re-tenta)", async () => {
    m.handlePayment.mockRejectedValue(new Error("db down"));
    expect((await paymentPOST(req(pixPaid))).status).toBe(500);
    m.handlePayment.mockRejectedValue(new TunaError(503, null, "indisponível"));
    expect((await paymentPOST(req(pixPaid))).status).toBe(500);
  });

  it("recusa definitiva da Tuna (4xx) ao reconciliar → 200 (não adianta re-tentar)", async () => {
    m.handlePayment.mockRejectedValue(new TunaError(422, -111, "{}"));
    expect((await paymentPOST(req(pixPaid))).status).toBe(200);
  });

  it("log só com ids/status (nunca o corpo)", async () => {
    const log = vi.mocked(console.log);
    await paymentPOST(req({ ...pixPaid, customer: { document: "12345678909" } }));
    const out = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toContain("134D946015A08C9");
    expect(out).not.toContain("12345678909");
    expect(out).not.toContain("19.5");
  });
});

describe("POST /api/webhooks/tuna/merchant", () => {
  const registerOk = {
    merchantId: 86,
    code: 1,
    message: { source: "Split", code: "SRVMerchantRegisterOk", message: "ok", info: { bank: "segredo" } },
    externalId: "jur_e1",
    serviceId: 69,
    serviceName: "Tuna Split para PIX",
    kycLevel: "1",
  };

  it("segredo configurado e header errado → 401", async () => {
    process.env.TUNA_MERCHANT_WEBHOOK_SECRET_TEST = "m-test";
    expect((await merchantPOST(req(registerOk, "Bearer errado"))).status).toBe(401);
    expect(m.applyMerchant).not.toHaveBeenCalled();
  });

  it("não usa o segredo do webhook de pagamento", async () => {
    process.env.TUNA_WEBHOOK_SECRET = "s-prod";
    process.env.TUNA_MERCHANT_WEBHOOK_SECRET = "m-prod";
    expect((await merchantPOST(req(registerOk, "Bearer s-prod"))).status).toBe(401);
  });

  it("segredo de teste → aplica com env TEST", async () => {
    process.env.TUNA_MERCHANT_WEBHOOK_SECRET = "m-prod";
    process.env.TUNA_MERCHANT_WEBHOOK_SECRET_TEST = "m-test";
    expect((await merchantPOST(req(registerOk, "Bearer m-test"))).status).toBe(200);
    expect(m.applyMerchant).toHaveBeenCalledWith({
      env: "TEST",
      externalId: "jur_e1",
      serviceId: 69,
      serviceName: "Tuna Split para PIX",
      messageCode: "SRVMerchantRegisterOk",
      kycLevel: "1",
    });
  });

  it("repasse (SRVMerchantPayment*) → só log, 200", async () => {
    for (const code of ["SRVMerchantPaymentOk", "SRVMerchantPaymenError"]) {
      const body = { ...registerOk, serviceId: 0, serviceName: "SYSTEM", message: { code } };
      expect((await merchantPOST(req(body))).status).toBe(200);
    }
    expect(m.applyMerchant).not.toHaveBeenCalled();
  });

  it("corpo inválido ou sem externalId → 200 sem aplicar", async () => {
    expect((await merchantPOST(req("lixo"))).status).toBe(200);
    expect((await merchantPOST(req({ message: { code: "SRVMerchantRegisterOk" } }))).status).toBe(200);
    expect(m.applyMerchant).not.toHaveBeenCalled();
  });

  it("falha de banco ao aplicar → 500 (a Tuna re-tenta; não perde a aprovação)", async () => {
    m.applyMerchant.mockRejectedValue(new Error("db down"));
    expect((await merchantPOST(req(registerOk))).status).toBe(500);
  });

  it("log sem dados bancários/mensagem da Tuna", async () => {
    const log = vi.mocked(console.log);
    await merchantPOST(req(registerOk));
    const out = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toContain("jur_e1");
    expect(out).toContain("SRVMerchantRegisterOk");
    expect(out).not.toContain("segredo");
  });
});
