import { describe, it, expect } from "vitest";
import {
  walletWebConfig,
  isAppleValidationUrl,
  decodePem,
  resolveInitiativeContext,
  type WalletWebEnv,
  type GatewayModes,
} from "@/lib/payments/wallet-web";

const env: WalletWebEnv = {
  appleMerchantId: "merchant.br.app.jurandir",
  appleDisplayName: "Jurandir",
  appleCertReady: true,
  googleMerchantId: "BCR2DN123",
  googleGatewayMerchantIds: { PAGARME: "acc_pagarme", PAGBANK: "pb_merchant" },
};
const test: GatewayModes = { PAGARME: "TEST", PAGBANK: "TEST" };
const prod: GatewayModes = { PAGARME: "PRODUCTION", PAGBANK: "PRODUCTION" };
const est = (
  applePay: boolean,
  googlePay: boolean,
  a = "PAGARME",
  g = "PAGARME",
) => ({ applePay, googlePay, gateways: { applePay: a, googlePay: g } });

describe("walletWebConfig - Apple Pay", () => {
  it("presente com cert pronto", () => {
    const c = walletWebConfig(est(true, false), env, test);
    expect(c.applePay).toEqual({
      merchantIdentifier: "merchant.br.app.jurandir",
      displayName: "Jurandir",
      supportedNetworks: ["visa", "masterCard"],
      merchantCapabilities: ["supports3DS", "supportsCredit"],
      countryCode: "BR",
      currencyCode: "BRL",
    });
  });
  it("ausente sem cert", () => {
    expect(
      walletWebConfig(est(true, false), { ...env, appleCertReady: false }, test)
        .applePay,
    ).toBeNull();
  });
  it("ausente com est.applePay=false", () => {
    expect(walletWebConfig(est(false, false), env, test).applePay).toBeNull();
  });
});

describe("walletWebConfig - Google Pay", () => {
  it("Pagar.me", () => {
    const g = walletWebConfig(est(false, true), env, test).googlePay!;
    expect(g.gateway).toBe("pagarme");
    expect(g.allowedCardNetworks).toEqual(["VISA", "MASTERCARD"]);
    expect(g.gatewayMerchantId).toBe("acc_pagarme");
    expect(g.allowedAuthMethods).toEqual(["PAN_ONLY", "CRYPTOGRAM_3DS"]);
    expect(g.merchantName).toBe("Jurandir");
  });
  it("PagBank", () => {
    const g = walletWebConfig(est(false, true, "PAGARME", "PAGBANK"), env, test)
      .googlePay!;
    expect(g.gateway).toBe("pagbank");
    expect(g.allowedCardNetworks).toEqual(["VISA", "MASTERCARD", "ELO"]);
    expect(g.gatewayMerchantId).toBe("pb_merchant");
  });
  it("sem gatewayMerchantId -> null", () => {
    expect(
      walletWebConfig(
        est(false, true),
        { ...env, googleGatewayMerchantIds: {} },
        test,
      ).googlePay,
    ).toBeNull();
  });
  it("gateway MERCADO_PAGO -> null", () => {
    expect(
      walletWebConfig(est(false, true, "PAGARME", "MERCADO_PAGO"), env, test)
        .googlePay,
    ).toBeNull();
  });
  it("est.googlePay=false -> null", () => {
    expect(walletWebConfig(est(false, false), env, test).googlePay).toBeNull();
  });
  it("TEST sem merchantId", () => {
    const g = walletWebConfig(est(false, true), env, test).googlePay!;
    expect(g.environment).toBe("TEST");
    expect(g.merchantId).toBeUndefined();
  });
  it("PRODUCTION com merchantId", () => {
    const g = walletWebConfig(est(false, true), env, prod).googlePay!;
    expect(g.environment).toBe("PRODUCTION");
    expect(g.merchantId).toBe("BCR2DN123");
  });
  it("PRODUCTION sem merchantId -> TEST", () => {
    const g = walletWebConfig(
      est(false, true),
      { ...env, googleMerchantId: "" },
      prod,
    ).googlePay!;
    expect(g.environment).toBe("TEST");
    expect(g.merchantId).toBeUndefined();
  });
});

describe("isAppleValidationUrl", () => {
  it.each([
    "https://apple-pay-gateway.apple.com/paymentservices/startSession",
    "https://apple-pay-gateway-nc-pod5.apple.com/paymentservices/paymentSession",
    "https://cn-apple-pay-gateway.apple.com/x",
  ])("aceita %s", (u) => expect(isAppleValidationUrl(u)).toBe(true));
  it.each([
    "http://apple-pay-gateway.apple.com/x",
    "https://evil.com/x",
    "https://apple-pay-gateway.apple.com.evil.com/x",
    "https://evilapple-pay-gateway.apple.com/x",
    "lixo",
    "https://apple-pay-gateway.apple.com:8443/x",
    "https://user:pw@apple-pay-gateway.apple.com/x",
  ])("recusa %s", (u) => expect(isAppleValidationUrl(u)).toBe(false));
});

describe("Google Pay - modo por gateway", () => {
  const modes: GatewayModes = { PAGARME: "TEST", PAGBANK: "PRODUCTION" };
  it("PagBank em PRODUCTION", () => {
    const g = walletWebConfig(est(false, true, "PAGARME", "PAGBANK"), env, modes)
      .googlePay!;
    expect(g.environment).toBe("PRODUCTION");
  });
  it("Pagar.me em TEST", () => {
    const g = walletWebConfig(est(false, true), env, modes).googlePay!;
    expect(g.environment).toBe("TEST");
  });
});

describe("decodePem", () => {
  const pem = "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----\n";
  it("base64 do PEM", () => {
    expect(decodePem(Buffer.from(pem).toString("base64"))).toBe(pem);
  });
  it("PEM cru multilinha", () => {
    expect(decodePem(pem)).toBe(pem.trim());
  });
  it("PEM de uma linha com barra-n literal", () => {
    const BS = String.fromCharCode(92);
    const one = pem.trim().split("\n").join(BS + "n");
    expect(one).toContain(BS + "n");
    expect(one).not.toContain("\n");
    expect(decodePem(one)).toBe(pem.trim());
  });
});

describe("resolveInitiativeContext", () => {
  it("APPLE_PAY_DOMAIN vence", () => {
    expect(resolveInitiativeContext("a.com", "https://b.com")).toBe("a.com");
  });
  it("host de APP_BASE_URL", () => {
    expect(resolveInitiativeContext(undefined, "https://jurandir.app.br/x")).toBe(
      "jurandir.app.br",
    );
  });
  it("inválido/ausente -> null", () => {
    expect(resolveInitiativeContext(undefined, "lixo")).toBeNull();
    expect(resolveInitiativeContext("", undefined)).toBeNull();
  });
});
