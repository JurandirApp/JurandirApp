import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { getAppSettings } = vi.hoisted(() => ({ getAppSettings: vi.fn() }));
vi.mock("@/lib/db/settings", () => ({ getAppSettings }));
const ensureTunaMode = vi.hoisted(() => vi.fn());
vi.mock("@/lib/payments/tuna", () => ({ ensureTunaMode }));

import { getWalletWebConfig, readWalletWebEnv } from "@/lib/payments/wallet-web-env";

const VARS = [
  "APPLE_PAY_MERCHANT_ID",
  "APPLE_PAY_DISPLAY_NAME",
  "APPLE_PAY_DOMAIN",
  "APPLE_PAY_MERCHANT_CERT",
  "APPLE_PAY_MERCHANT_KEY",
  "APP_BASE_URL",
  "GOOGLE_PAY_MERCHANT_ID",
  "GOOGLE_PAY_PAGARME_GATEWAY_MERCHANT_ID",
  "GOOGLE_PAY_PAGARME_GATEWAY_MERCHANT_ID_TEST",
  "GOOGLE_PAY_PAGBANK_GATEWAY_MERCHANT_ID",
  "GOOGLE_PAY_PAGBANK_GATEWAY_MERCHANT_ID_TEST",
  "GOOGLE_PAY_TEST_SLUGS",
  "TUNA_GOOGLE_GATEWAY_MERCHANT_ID",
  "TUNA_GOOGLE_GATEWAY_MERCHANT_ID_TEST",
];

beforeEach(() => {
  for (const v of VARS) vi.stubEnv(v, "");
  getAppSettings.mockReset();
  ensureTunaMode.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("readWalletWebEnv - ids do gateway por modo (convenção _TEST)", () => {
  it("TEST prefere <NOME>_TEST", () => {
    vi.stubEnv("GOOGLE_PAY_PAGARME_GATEWAY_MERCHANT_ID", "pm_prod");
    vi.stubEnv("GOOGLE_PAY_PAGARME_GATEWAY_MERCHANT_ID_TEST", "pm_test");
    vi.stubEnv("GOOGLE_PAY_PAGBANK_GATEWAY_MERCHANT_ID", "pb_prod");
    vi.stubEnv("GOOGLE_PAY_PAGBANK_GATEWAY_MERCHANT_ID_TEST", "pb_test");
    expect(
      readWalletWebEnv({ PAGARME: "TEST", PAGBANK: "TEST" }).googleGatewayMerchantIds,
    ).toEqual({ PAGARME: "pm_test", PAGBANK: "pb_test" });
  });
  it("TEST sem _TEST cai no <NOME>", () => {
    vi.stubEnv("GOOGLE_PAY_PAGARME_GATEWAY_MERCHANT_ID", "pm_prod");
    expect(
      readWalletWebEnv({ PAGARME: "TEST", PAGBANK: "TEST" }).googleGatewayMerchantIds,
    ).toEqual({ PAGARME: "pm_prod" });
  });
  it("PRODUCTION usa só o <NOME> (ignora o _TEST)", () => {
    vi.stubEnv("GOOGLE_PAY_PAGARME_GATEWAY_MERCHANT_ID", "pm_prod");
    vi.stubEnv("GOOGLE_PAY_PAGARME_GATEWAY_MERCHANT_ID_TEST", "pm_test");
    vi.stubEnv("GOOGLE_PAY_PAGBANK_GATEWAY_MERCHANT_ID_TEST", "pb_test");
    expect(
      readWalletWebEnv({ PAGARME: "PRODUCTION", PAGBANK: "PRODUCTION" })
        .googleGatewayMerchantIds,
    ).toEqual({ PAGARME: "pm_prod" });
  });
  it("modo é por gateway", () => {
    vi.stubEnv("GOOGLE_PAY_PAGARME_GATEWAY_MERCHANT_ID", "pm_prod");
    vi.stubEnv("GOOGLE_PAY_PAGARME_GATEWAY_MERCHANT_ID_TEST", "pm_test");
    vi.stubEnv("GOOGLE_PAY_PAGBANK_GATEWAY_MERCHANT_ID", "pb_prod");
    vi.stubEnv("GOOGLE_PAY_PAGBANK_GATEWAY_MERCHANT_ID_TEST", "pb_test");
    expect(
      readWalletWebEnv({ PAGARME: "TEST", PAGBANK: "PRODUCTION" })
        .googleGatewayMerchantIds,
    ).toEqual({ PAGARME: "pm_test", PAGBANK: "pb_prod" });
  });
  it("sem modos = TEST (mesmo default do banco indisponível)", () => {
    vi.stubEnv("GOOGLE_PAY_PAGBANK_GATEWAY_MERCHANT_ID", "pb_prod");
    vi.stubEnv("GOOGLE_PAY_PAGBANK_GATEWAY_MERCHANT_ID_TEST", "pb_test");
    expect(readWalletWebEnv().googleGatewayMerchantIds).toEqual({ PAGBANK: "pb_test" });
  });
});

describe("readWalletWebEnv - allowlist e domínio", () => {
  it("GOOGLE_PAY_TEST_SLUGS: vírgulas, trim, minúsculo, sem vazios", () => {
    vi.stubEnv("GOOGLE_PAY_TEST_SLUGS", " Bar-Do-Ze , praia-1,, ");
    expect(readWalletWebEnv().googleTestSlugs).toEqual(["bar-do-ze", "praia-1"]);
  });
  it("sem GOOGLE_PAY_TEST_SLUGS -> lista vazia", () => {
    expect(readWalletWebEnv().googleTestSlugs).toEqual([]);
  });
  it("appleDomain normalizado do APPLE_PAY_DOMAIN", () => {
    vi.stubEnv("APPLE_PAY_DOMAIN", "https://Jurandir.app.br/x");
    expect(readWalletWebEnv().appleDomain).toBe("jurandir.app.br");
  });
  it("appleDomain cai no host do APP_BASE_URL; nada -> vazio e cert não pronto", () => {
    vi.stubEnv("APPLE_PAY_MERCHANT_CERT", "cert");
    vi.stubEnv("APPLE_PAY_MERCHANT_KEY", "key");
    vi.stubEnv("APP_BASE_URL", "https://jurandir.app.br");
    expect(readWalletWebEnv().appleDomain).toBe("jurandir.app.br");
    expect(readWalletWebEnv().appleCertReady).toBe(true);
    vi.stubEnv("APP_BASE_URL", "");
    expect(readWalletWebEnv().appleDomain).toBe("");
    expect(readWalletWebEnv().appleCertReady).toBe(false);
  });
});

describe("getWalletWebConfig", () => {
  const est = (googlePay = true, applePay = true, slug = "bar-do-ze") => ({
    slug,
    applePay,
    googlePay,
    gateways: { applePay: "PAGARME", googlePay: "PAGARME" },
  });

  it("nada configurado → tudo null e sem consultar o banco", async () => {
    expect(await getWalletWebConfig(est())).toEqual({ applePay: null, googlePay: null });
    expect(getAppSettings).not.toHaveBeenCalled();
  });
  it("só Apple configurada → não consulta o banco (modos só valem pro Google)", async () => {
    vi.stubEnv("APPLE_PAY_MERCHANT_CERT", "cert");
    vi.stubEnv("APPLE_PAY_MERCHANT_KEY", "key");
    vi.stubEnv("APPLE_PAY_DOMAIN", "jurandir.app.br");
    const c = await getWalletWebConfig(est());
    expect(c.applePay?.domain).toBe("jurandir.app.br");
    expect(c.googlePay).toBeNull();
    expect(getAppSettings).not.toHaveBeenCalled();
  });
  it("Google configurado mas o bar não aceita → não consulta o banco", async () => {
    vi.stubEnv("GOOGLE_PAY_PAGARME_GATEWAY_MERCHANT_ID", "pm_prod");
    expect((await getWalletWebConfig(est(false))).googlePay).toBeNull();
    expect(getAppSettings).not.toHaveBeenCalled();
  });
  it("Google em PRODUCTION (modo do admin) → usa o id de produção", async () => {
    vi.stubEnv("GOOGLE_PAY_MERCHANT_ID", "BCR2DN123");
    vi.stubEnv("GOOGLE_PAY_PAGARME_GATEWAY_MERCHANT_ID", "pm_prod");
    vi.stubEnv("GOOGLE_PAY_PAGARME_GATEWAY_MERCHANT_ID_TEST", "pm_test");
    getAppSettings.mockResolvedValue({ pagarmeMode: "PRODUCTION", pagbankMode: "TEST" });
    const g = (await getWalletWebConfig(est())).googlePay!;
    expect(getAppSettings).toHaveBeenCalledTimes(1);
    expect(g.environment).toBe("PRODUCTION");
    expect(g.gatewayMerchantId).toBe("pm_prod");
  });
  it("banco indisponível → TEST; slug na allowlist usa o id _TEST", async () => {
    vi.stubEnv("GOOGLE_PAY_MERCHANT_ID", "BCR2DN123");
    vi.stubEnv("GOOGLE_PAY_PAGARME_GATEWAY_MERCHANT_ID", "pm_prod");
    vi.stubEnv("GOOGLE_PAY_PAGARME_GATEWAY_MERCHANT_ID_TEST", "pm_test");
    vi.stubEnv("GOOGLE_PAY_TEST_SLUGS", "bar-do-ze");
    getAppSettings.mockRejectedValue(new Error("db off"));
    const g = (await getWalletWebConfig(est())).googlePay!;
    expect(g.environment).toBe("TEST");
    expect(g.gatewayMerchantId).toBe("pm_test");
  });
});

describe("getWalletWebConfig - Tuna", () => {
  const est = (applePay = "PAGARME") => ({
    slug: "leo-teste",
    applePay: true,
    googlePay: true,
    gateways: { applePay, googlePay: "TUNA" },
  });
  const TUNA_DEFAULT = "78c30483-2a55-422e-98f1-b68f77fcaa70";

  it("TEST: id padrão do tuna.js, Google TEST; modo vem do ensureTunaMode (não do getAppSettings)", async () => {
    ensureTunaMode.mockResolvedValue("TEST");
    const g = (await getWalletWebConfig(est())).googlePay!;
    expect(g).toMatchObject({ environment: "TEST", gateway: "tuna", gatewayMerchantId: TUNA_DEFAULT });
    expect(g.merchantId).toBeUndefined();
    expect(ensureTunaMode).toHaveBeenCalledTimes(1);
    expect(getAppSettings).not.toHaveBeenCalled();
  });
  it("TUNA_GOOGLE_GATEWAY_MERCHANT_ID sobrepõe o padrão; TEST prefere o _TEST", async () => {
    vi.stubEnv("TUNA_GOOGLE_GATEWAY_MERCHANT_ID", "tuna_prod");
    ensureTunaMode.mockResolvedValue("PRODUCTION");
    vi.stubEnv("GOOGLE_PAY_MERCHANT_ID", "BCR2DN123");
    expect((await getWalletWebConfig(est())).googlePay).toMatchObject({
      environment: "PRODUCTION",
      merchantId: "BCR2DN123",
      gatewayMerchantId: "tuna_prod",
    });
    vi.stubEnv("TUNA_GOOGLE_GATEWAY_MERCHANT_ID_TEST", "tuna_test");
    ensureTunaMode.mockResolvedValue("TEST");
    expect((await getWalletWebConfig(est())).googlePay?.gatewayMerchantId).toBe("tuna_test");
  });
  it("PRODUCTION sem GOOGLE_PAY_MERCHANT_ID → sem Google Pay", async () => {
    ensureTunaMode.mockResolvedValue("PRODUCTION");
    expect((await getWalletWebConfig(est())).googlePay).toBeNull();
  });
  it("modo da Tuna ilegível → sem Google Pay (falha fechado)", async () => {
    ensureTunaMode.mockRejectedValue(new Error("db off"));
    expect((await getWalletWebConfig(est())).googlePay).toBeNull();
  });
  it("Apple Pay com gateway TUNA nunca aparece no site", async () => {
    vi.stubEnv("APPLE_PAY_MERCHANT_CERT", "cert");
    vi.stubEnv("APPLE_PAY_MERCHANT_KEY", "key");
    vi.stubEnv("APPLE_PAY_DOMAIN", "jurandir.app.br");
    ensureTunaMode.mockResolvedValue("TEST");
    expect((await getWalletWebConfig(est("TUNA"))).applePay).toBeNull();
    expect((await getWalletWebConfig(est("PAGARME"))).applePay).not.toBeNull();
  });
});
