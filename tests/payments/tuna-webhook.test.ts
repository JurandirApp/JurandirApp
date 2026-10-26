import { describe, it, expect } from "vitest";
import {
  isTunaPayoutCode,
  nextTunaStatus,
  parseTunaMerchantNotification,
  parseTunaPaymentNotification,
  shouldAttachTunaPayment,
  tunaErrorSummary,
  tunaServiceGroup,
  tunaWebhookAuth,
} from "@/lib/payments/tuna-webhook";
import { TunaError } from "@/lib/payments/tuna";

describe("tunaWebhookAuth", () => {
  const secrets = { prod: "segredo-prod", test: "segredo-test" };

  it("sem segredos configurados → any", () => {
    expect(tunaWebhookAuth(null, {})).toBe("any");
    expect(tunaWebhookAuth("Bearer qualquer", {})).toBe("any");
  });
  it("segredos vazios/espaços contam como não configurados → any", () => {
    expect(tunaWebhookAuth(null, { prod: "", test: "  " })).toBe("any");
  });
  it("Bearer com o segredo de produção → PRODUCTION", () => {
    expect(tunaWebhookAuth("Bearer segredo-prod", secrets)).toBe("PRODUCTION");
  });
  it("Bearer com o segredo de teste → TEST", () => {
    expect(tunaWebhookAuth("Bearer segredo-test", secrets)).toBe("TEST");
  });
  it("segredo errado com segredo configurado → unauthorized", () => {
    expect(tunaWebhookAuth("Bearer outro", secrets)).toBe("unauthorized");
    expect(tunaWebhookAuth("Bearer segredo-prod", { test: "segredo-test" })).toBe("unauthorized");
  });
  it("header ausente com segredo configurado → unauthorized", () => {
    expect(tunaWebhookAuth(null, secrets)).toBe("unauthorized");
    expect(tunaWebhookAuth("", { prod: "segredo-prod" })).toBe("unauthorized");
    expect(tunaWebhookAuth("Bearer ", { prod: "segredo-prod" })).toBe("unauthorized");
  });
  it("esquema Bearer sem diferenciar maiúsculas e valor cru (sem Bearer) também valem", () => {
    expect(tunaWebhookAuth("bearer segredo-test", secrets)).toBe("TEST");
    expect(tunaWebhookAuth("segredo-prod", secrets)).toBe("PRODUCTION");
  });
  it("só um ambiente configurado: o outro segredo não autoriza", () => {
    expect(tunaWebhookAuth("Bearer segredo-test", { test: "segredo-test" })).toBe("TEST");
    expect(tunaWebhookAuth("Bearer segredo-test", { prod: "segredo-prod" })).toBe("unauthorized");
  });
});

describe("tunaServiceGroup", () => {
  it("ids de Pix → pix", () => {
    for (const id of [69, 71, 86, 88, 93, 101]) expect(tunaServiceGroup(id, "")).toBe("pix");
    expect(tunaServiceGroup(69, "")).toBe("pix");
  });
  it("ids de cartão → card", () => {
    expect(tunaServiceGroup(41, "")).toBe("card");
    expect(tunaServiceGroup(63, "")).toBe("card");
  });
  it("id em string também vale", () => {
    expect(tunaServiceGroup("71", "")).toBe("pix");
    expect(tunaServiceGroup(" 41 ", undefined)).toBe("card");
  });
  it("id desconhecido → cai pelo nome", () => {
    expect(tunaServiceGroup(999, "Tuna Split para PIX")).toBe("pix");
    expect(tunaServiceGroup(999, "Split Cartão")).toBe("card");
    expect(tunaServiceGroup(undefined, "Card Split")).toBe("card");
  });
  it("sem id conhecido nem nome reconhecível → null", () => {
    expect(tunaServiceGroup(999, "x")).toBeNull();
    expect(tunaServiceGroup(0, "SYSTEM")).toBeNull();
    expect(tunaServiceGroup(null, null)).toBeNull();
  });
});

describe("nextTunaStatus", () => {
  it("null + Ok → active", () => {
    expect(nextTunaStatus(null, "SRVMerchantRegisterOk")).toBe("active");
  });
  it("analysis + Rejected → rejected", () => {
    expect(nextTunaStatus("analysis", "SRVMerchantRegisterRejected")).toBe("rejected");
  });
  it("analysis + Blocked → blocked; analysis + Error → error", () => {
    expect(nextTunaStatus("analysis", "SRVMerchantRegisterBlocked")).toBe("blocked");
    expect(nextTunaStatus("analysis", "SRVMerchantRegisterError")).toBe("error");
  });
  it("active + Rejected → active (outro provedor do grupo já aprovou)", () => {
    expect(nextTunaStatus("active", "SRVMerchantRegisterRejected")).toBe("active");
    expect(nextTunaStatus("active", "SRVMerchantRegisterBlocked")).toBe("active");
    expect(nextTunaStatus("active", "SRVMerchantRegisterError")).toBe("active");
  });
  it("rejected/error + Ok → active", () => {
    expect(nextTunaStatus("rejected", "SRVMerchantRegisterOk")).toBe("active");
    expect(nextTunaStatus("error", "SRVMerchantRegisterOk")).toBe("active");
  });
  it("analysis + código desconhecido → analysis", () => {
    expect(nextTunaStatus("analysis", "SRVAlgumaOutraCoisa")).toBe("analysis");
    expect(nextTunaStatus(null, "")).toBeNull();
  });
});

describe("isTunaPayoutCode", () => {
  it("repasse (inclui o typo do contrato SRVMerchantPaymenError) → true", () => {
    expect(isTunaPayoutCode("SRVMerchantPaymentOk")).toBe(true);
    expect(isTunaPayoutCode("SRVMerchantPaymenError")).toBe(true);
  });
  it("cadastro → false", () => {
    expect(isTunaPayoutCode("SRVMerchantRegisterOk")).toBe(false);
    expect(isTunaPayoutCode("")).toBe(false);
  });
});

describe("shouldAttachTunaPayment", () => {
  const order = (o: Record<string, unknown> = {}) => ({
    code: "ABC123",
    status: "AWAITING_PAYMENT",
    payment: { provider: "TUNA" as string | null, gatewayChargeId: null as string | null },
    ...o,
  });

  it("Status da Tuna confirma o pedido → anexa", () => {
    expect(shouldAttachTunaPayment(order(), { status: "2", partnerUniqueId: "ABC123" }, "PK1")).toBe(true);
  });
  it("lê a chave sem diferenciar maiúsculas (partnerUniqueID)", () => {
    expect(shouldAttachTunaPayment(order(), { PartnerUniqueID: "ABC123" }, "PK1")).toBe(true);
  });
  it("Status de OUTRO pedido → não anexa", () => {
    expect(shouldAttachTunaPayment(order(), { partnerUniqueId: "XYZ999" }, "PK1")).toBe(false);
  });
  it("Status sem partnerUniqueId → não anexa (nunca só pelo corpo do webhook)", () => {
    expect(shouldAttachTunaPayment(order(), { status: "2" }, "PK1")).toBe(false);
    expect(shouldAttachTunaPayment(order(), null, "PK1")).toBe(false);
  });
  it("Status devolvendo outro paymentKey → não anexa", () => {
    expect(
      shouldAttachTunaPayment(order(), { partnerUniqueId: "ABC123", paymentKey: "PK2" }, "PK1"),
    ).toBe(false);
    expect(
      shouldAttachTunaPayment(order(), { partnerUniqueId: "ABC123", paymentKey: "PK1" }, "PK1"),
    ).toBe(true);
  });
  it("pedido já com cobrança, de outro gateway, fora de AWAITING_PAYMENT ou sem pagamento → não anexa", () => {
    const st = { partnerUniqueId: "ABC123" };
    expect(shouldAttachTunaPayment(order({ payment: { provider: "TUNA", gatewayChargeId: "PK0" } }), st, "PK1")).toBe(false);
    expect(shouldAttachTunaPayment(order({ payment: { provider: "PAGARME", gatewayChargeId: null } }), st, "PK1")).toBe(false);
    expect(shouldAttachTunaPayment(order({ status: "IN_PRODUCTION" }), st, "PK1")).toBe(false);
    expect(shouldAttachTunaPayment(order({ payment: null }), st, "PK1")).toBe(false);
    expect(shouldAttachTunaPayment(null, st, "PK1")).toBe(false);
  });
  it("paymentKey vazio → não anexa", () => {
    expect(shouldAttachTunaPayment(order(), { partnerUniqueId: "ABC123" }, " ")).toBe(false);
  });
});

describe("parseTunaPaymentNotification", () => {
  it("extrai paymentKey, statusId e partnerUniqueId (chaves sem diferenciar maiúsculas)", () => {
    expect(
      parseTunaPaymentNotification({ id: 1, PaymentKey: " PK1 ", statusId: 2, partnerUniqueID: "ABC123" }),
    ).toEqual({ paymentKey: "PK1", statusId: "2", partnerUniqueId: "ABC123" });
  });
  it("sem paymentKey ou corpo que não é objeto → null", () => {
    expect(parseTunaPaymentNotification({ statusId: "2" })).toBeNull();
    expect(parseTunaPaymentNotification(null)).toBeNull();
    expect(parseTunaPaymentNotification([{ paymentKey: "PK1" }])).toBeNull();
    expect(parseTunaPaymentNotification("PK1")).toBeNull();
  });
});

describe("parseTunaMerchantNotification", () => {
  it("extrai externalId, message.code, serviço e kycLevel", () => {
    expect(
      parseTunaMerchantNotification({
        merchantId: 86,
        code: 1,
        message: { source: "x", code: "SRVMerchantRegisterOk", message: "ok" },
        externalId: "jur_e1",
        serviceId: 69,
        serviceName: "Tuna Split para PIX",
        kycLevel: 1,
      }),
    ).toEqual({
      externalId: "jur_e1",
      messageCode: "SRVMerchantRegisterOk",
      serviceId: 69,
      serviceName: "Tuna Split para PIX",
      kycLevel: "1",
    });
  });
  it("kycLevel ausente/nulo → null; letra → mantém", () => {
    expect(parseTunaMerchantNotification({ externalId: "e", message: { code: "c" } })?.kycLevel).toBeNull();
    expect(parseTunaMerchantNotification({ externalId: "e", kycLevel: null })?.kycLevel).toBeNull();
    expect(parseTunaMerchantNotification({ externalId: "e", kycLevel: "A" })?.kycLevel).toBe("A");
  });
  it("corpo que não é objeto → null", () => {
    expect(parseTunaMerchantNotification(null)).toBeNull();
    expect(parseTunaMerchantNotification([])).toBeNull();
  });
});

describe("tunaErrorSummary", () => {
  it("TunaError → só status/code (nunca o corpo)", () => {
    const out = tunaErrorSummary(new TunaError(422, -111, '{"customer":{"document":"12345678909"}}'));
    expect(out).toBe("TunaError 422/-111");
    expect(tunaErrorSummary(new TunaError(503, null, "x"))).toBe("TunaError 503");
  });
  it("erro com code (Prisma) → nome + code; SyntaxError → só o nome", () => {
    const pe = Object.assign(new Error("Unique constraint failed"), { name: "PrismaClientKnownRequestError", code: "P2002" });
    expect(tunaErrorSummary(pe)).toBe("PrismaClientKnownRequestError P2002");
    expect(tunaErrorSummary(new SyntaxError('Unexpected token, "<html>dado" is not valid JSON'))).toBe("SyntaxError");
  });
  it("outros → nome + mensagem curta", () => {
    expect(tunaErrorSummary(new TypeError("fetch failed"))).toBe("TypeError: fetch failed");
    expect(tunaErrorSummary("x")).toBe("erro");
  });
});
