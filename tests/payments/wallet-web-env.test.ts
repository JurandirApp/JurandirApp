import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { getAppSettings } = vi.hoisted(() => ({ getAppSettings: vi.fn() }));
vi.mock("@/lib/db/settings", () => ({ getAppSettings }));

import { readWalletWebEnv } from "@/lib/payments/wallet-web-env";

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
];

beforeEach(() => {
  for (const v of VARS) vi.stubEnv(v, "");
  getAppSettings.mockReset();
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
