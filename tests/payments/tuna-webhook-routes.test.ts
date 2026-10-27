import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const m = vi.hoisted(() => ({
  handlePayment: vi.fn(),
  applyMerchant: vi.fn(),
  getMode: vi.fn(),
}));

// Só usado quando o atalho de teste do ensureTunaMode é desligado (fail closed).
vi.mock("@/lib/db/settings", () => ({ getTunaMode: m.getMode }));

vi.mock("@/lib/db/tuna-webhook", () => ({
  handleTunaPaymentWebhook: m.handlePayment,
  applyTunaMerchantWebhook: m.applyMerchant,
}));

import { POST as paymentPOST } from "@/app/api/webhooks/tuna/route";
import { POST as merchantPOST } from "@/app/api/webhooks/tuna/merchant/route";
import { TunaError, __setTunaModeForTests } from "@/lib/payments/tuna";

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
  __setTunaModeForTests("TEST");
  m.handlePayment.mockResolvedValue("reconciled");
  m.applyMerchant.mockResolvedValue("updated");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  __setTunaModeForTests(null);
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/tuna (pagamento)", () => {
  it("segredo configurado e header errado/ausente → 401, sem reconciliar", async () => {
    process.env.TUNA_WEBHOOK_SECRET = "s-prod";
    expect((await paymentPOST(req(pixPaid, "Bearer errado"))).status).toBe(401);
    expect((await paymentPOST(req(pixPaid))).status).toBe(401);
    expect(m.handlePayment).not.toHaveBeenCalled();
  });

  it("segredo certo (prod ou teste) do modo atual → reconcilia pelo paymentKey + partnerUniqueId e responde 200", async () => {
    process.env.TUNA_WEBHOOK_SECRET = "s-prod";
    process.env.TUNA_WEBHOOK_SECRET_TEST = "s-test";
    __setTunaModeForTests("TEST");
    expect((await paymentPOST(req(pixPaid, "Bearer s-test"))).status).toBe(200);
    __setTunaModeForTests("PRODUCTION");
    expect((await paymentPOST(req(pixPaid, "Bearer s-prod"))).status).toBe(200);
    expect(m.handlePayment).toHaveBeenCalledTimes(2);
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

describe("POST /api/webhooks/tuna (pagamento) — rodada de correções", () => {
  const logged = (fn: "log" | "warn" | "error") =>
    vi.mocked(console[fn]).mock.calls.map((c) => c.join(" ")).join("\n");

  it.each([408, 429])("TunaError %i no Status (timeout/rate limit) → 500 (transitório)", async (st) => {
    m.handlePayment.mockRejectedValue(new TunaError(st, null, "x"));
    expect((await paymentPOST(req(pixPaid))).status).toBe(500);
  });

  it("paymentKey enorme/estranho → 200 'id inválido', sem reconciliar nem ecoar o valor", async () => {
    const huge = "A".repeat(65);
    const odd = "PK1\n[tuna/webhook] forjado";
    expect((await paymentPOST(req({ ...pixPaid, paymentKey: huge }))).status).toBe(200);
    expect((await paymentPOST(req({ ...pixPaid, paymentKey: odd }))).status).toBe(200);
    expect(m.handlePayment).not.toHaveBeenCalled();
    const out = logged("warn") + logged("log");
    expect(out).toContain("[tuna/webhook] id inválido");
    expect(out).not.toContain(huge);
    expect(out).not.toContain("forjado");
  });

  it("partnerUniqueId inválido → 200 'id inválido'; ausente continua valendo", async () => {
    expect((await paymentPOST(req({ ...pixPaid, partnerUniqueId: "PED 1; drop" }))).status).toBe(200);
    expect(m.handlePayment).not.toHaveBeenCalled();
    const semPartner = { id: pixPaid.id, paymentKey: pixPaid.paymentKey, statusId: pixPaid.statusId };
    expect((await paymentPOST(req(semPartner))).status).toBe(200);
    expect(m.handlePayment).toHaveBeenCalledWith("134D946015A08C9", "");
  });

  it.each([
    ["TEST", "PRODUCTION", "Bearer s-test"],
    ["PRODUCTION", "TEST", "Bearer s-prod"],
  ] as const)(
    "notificação de %s com o modo em %s → 503 SEM consultar a Tuna (ela re-entrega)",
    async (_env, mode, auth) => {
      process.env.TUNA_WEBHOOK_SECRET = "s-prod";
      process.env.TUNA_WEBHOOK_SECRET_TEST = "s-test";
      __setTunaModeForTests(mode);
      expect((await paymentPOST(req(pixPaid, auth))).status).toBe(503);
      expect(m.handlePayment).not.toHaveBeenCalled();
      expect(logged("warn")).toContain("[tuna/webhook] ambiente da notificação ≠ modo atual");
    },
  );

  it("reconciliação lança o 424 do modo indisponível → 500 (a Tuna re-tenta)", async () => {
    m.handlePayment.mockRejectedValue(
      new TunaError(424, null, JSON.stringify({ message: "modo da Tuna indisponível" })),
    );
    expect((await paymentPOST(req(pixPaid))).status).toBe(500);
  });

  it("ambiente do segredo = modo atual (ou sem segredo) → sem aviso", async () => {
    process.env.TUNA_WEBHOOK_SECRET_TEST = "s-test";
    await paymentPOST(req(pixPaid, "Bearer s-test"));
    expect(logged("warn")).not.toContain("ambiente da notificação");
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

  it("sem segredo de merchant configurado em PRODUÇÃO → 401 (fail closed), sem aplicar", async () => {
    __setTunaModeForTests("PRODUCTION");
    expect((await merchantPOST(req(registerOk))).status).toBe(401);
    expect(m.applyMerchant).not.toHaveBeenCalled();
    const out = vi.mocked(console.warn).mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toContain("[tuna/merchant] sem segredo configurado em produção");
    expect(out).not.toContain("jur_e1");
  });

  it("sem segredo de merchant em TESTE (homologação) → aceita com env any", async () => {
    __setTunaModeForTests("TEST");
    expect((await merchantPOST(req(registerOk))).status).toBe(200);
    expect(m.applyMerchant).toHaveBeenCalledWith(expect.objectContaining({ env: "any" }));
  });

  it("segredo configurado em PRODUÇÃO + header certo → aplica", async () => {
    __setTunaModeForTests("PRODUCTION");
    process.env.TUNA_MERCHANT_WEBHOOK_SECRET = "m-prod";
    expect((await merchantPOST(req(registerOk, "Bearer m-prod"))).status).toBe(200);
    expect(m.applyMerchant).toHaveBeenCalledWith(expect.objectContaining({ env: "PRODUCTION" }));
  });

  it("externalId enorme/estranho → 200 'id inválido', sem aplicar nem ecoar", async () => {
    const huge = "jur_" + "x".repeat(80);
    expect((await merchantPOST(req({ ...registerOk, externalId: huge }))).status).toBe(200);
    expect((await merchantPOST(req({ ...registerOk, externalId: "jur_e1\"},{\"x" }))).status).toBe(200);
    expect(m.applyMerchant).not.toHaveBeenCalled();
    const out = [console.warn, console.log]
      .flatMap((f) => vi.mocked(f).mock.calls.map((c) => c.join(" ")))
      .join("\n");
    expect(out).toContain("[tuna/merchant] id inválido");
    expect(out).not.toContain(huge);
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

describe("modo da Tuna indisponível (fail closed) nos webhooks", () => {
  beforeEach(() => {
    // Desliga o atalho de teste do ensureTunaMode: lê o "banco", que falha.
    vi.stubEnv("VITEST", "");
    vi.stubEnv("NODE_ENV", "production");
    __setTunaModeForTests(null);
    m.getMode.mockRejectedValue(new Error("db down"));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("pagamento com segredo (ambiente conhecido) → 500, sem reconciliar", async () => {
    process.env.TUNA_WEBHOOK_SECRET = "s-prod";
    const res = await paymentPOST(req(pixPaid, "Bearer s-prod"));
    expect(res.status).toBe(500);
    expect(m.handlePayment).not.toHaveBeenCalled();
  });

  it("merchant sem segredo → 500 (nem 200 nem 401), sem aplicar", async () => {
    const body = { externalId: "jur_e1", serviceId: 69, message: { code: "SRVMerchantRegisterOk" } };
    const res = await merchantPOST(req(body));
    expect(res.status).toBe(500);
    expect(m.applyMerchant).not.toHaveBeenCalled();
  });
});
