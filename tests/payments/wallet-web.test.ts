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
  appleDomain: "jurandir.app.br",
  googleMerchantId: "BCR2DN123",
  googleGatewayMerchantIds: { PAGARME: "acc_pagarme", PAGBANK: "pb_merchant" },
  googleTestSlugs: [],
};
const test: GatewayModes = { PAGARME: "TEST", PAGBANK: "TEST" };
const prod: GatewayModes = { PAGARME: "PRODUCTION", PAGBANK: "PRODUCTION" };
const est = (
  applePay: boolean,
  googlePay: boolean,
  a = "PAGARME",
  g = "PAGARME",
  slug = "bar-do-ze",
) => ({ slug, applePay, googlePay, gateways: { applePay: a, googlePay: g } });
const allow: WalletWebEnv = { ...env, googleTestSlugs: ["bar-do-ze"] };

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
      domain: "jurandir.app.br",
    });
  });
  it("ausente sem domínio resolvido", () => {
    expect(
      walletWebConfig(est(true, false), { ...env, appleDomain: "" }, test).applePay,
    ).toBeNull();
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
    const g = walletWebConfig(est(false, true), env, prod).googlePay!;
    expect(g.gateway).toBe("pagarme");
    expect(g.allowedCardNetworks).toEqual(["VISA", "MASTERCARD"]);
    expect(g.gatewayMerchantId).toBe("acc_pagarme");
    expect(g.allowedAuthMethods).toEqual(["PAN_ONLY", "CRYPTOGRAM_3DS"]);
    expect(g.merchantName).toBe("Jurandir");
  });
  it("PagBank", () => {
    const g = walletWebConfig(est(false, true, "PAGARME", "PAGBANK"), env, prod)
      .googlePay!;
    expect(g.gateway).toBe("pagbank");
    expect(g.allowedCardNetworks).toEqual(["VISA", "MASTERCARD", "ELO"]);
    expect(g.gatewayMerchantId).toBe("pb_merchant");
  });
  it("sem gatewayMerchantId -> null", () => {
    expect(
      walletWebConfig(
        est(false, true),
        { ...allow, googleGatewayMerchantIds: {} },
        prod,
      ).googlePay,
    ).toBeNull();
  });
  it("gateway MERCADO_PAGO -> null", () => {
    expect(
      walletWebConfig(est(false, true, "PAGARME", "MERCADO_PAGO"), allow, prod)
        .googlePay,
    ).toBeNull();
  });
  it("est.googlePay=false -> null", () => {
    expect(walletWebConfig(est(false, false), allow, prod).googlePay).toBeNull();
  });
  it("TEST sem allowlist -> null (cliente real nunca vê o Google Pay de teste)", () => {
    expect(walletWebConfig(est(false, true), env, test).googlePay).toBeNull();
  });
  it("TEST com o slug na allowlist -> TEST sem merchantId", () => {
    const g = walletWebConfig(est(false, true), allow, test).googlePay!;
    expect(g.environment).toBe("TEST");
    expect(g.merchantId).toBeUndefined();
    expect(g.gatewayMerchantId).toBe("acc_pagarme");
  });
  it("allowlist compara sem caixa e com trim", () => {
    const g = walletWebConfig(
      est(false, true, "PAGARME", "PAGARME", " Bar-Do-Ze "),
      { ...env, googleTestSlugs: ["BAR-do-ze"] },
      test,
    ).googlePay!;
    expect(g.environment).toBe("TEST");
  });
  it("TEST com outro slug na allowlist -> null", () => {
    expect(
      walletWebConfig(est(false, true, "PAGARME", "PAGARME", "outro-bar"), allow, test)
        .googlePay,
    ).toBeNull();
  });
  it("PRODUCTION com merchantId", () => {
    const g = walletWebConfig(est(false, true), env, prod).googlePay!;
    expect(g.environment).toBe("PRODUCTION");
    expect(g.merchantId).toBe("BCR2DN123");
  });
  it("PRODUCTION com merchantId e slug na allowlist -> PRODUCTION (gateway real)", () => {
    const g = walletWebConfig(est(false, true), allow, prod).googlePay!;
    expect(g.environment).toBe("PRODUCTION");
    expect(g.merchantId).toBe("BCR2DN123");
  });
  it("PRODUCTION sem merchantId -> null (sem allowlist)", () => {
    expect(
      walletWebConfig(est(false, true), { ...env, googleMerchantId: "" }, prod)
        .googlePay,
    ).toBeNull();
  });
  it("PRODUCTION sem merchantId + allowlist -> TEST", () => {
    const g = walletWebConfig(
      est(false, true),
      { ...allow, googleMerchantId: "" },
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
  it("Pagar.me em TEST sem allowlist -> null", () => {
    expect(walletWebConfig(est(false, true), env, modes).googlePay).toBeNull();
  });
  it("Pagar.me em TEST com allowlist -> TEST", () => {
    const g = walletWebConfig(est(false, true), allow, modes).googlePay!;
    expect(g.environment).toBe("TEST");
  });
});

describe("walletWebConfig - Tuna", () => {
  const tunaEnv: WalletWebEnv = { ...env, googleGatewayMerchantIds: { TUNA: "tuna_gw" } };
  const tTest: GatewayModes = { ...test, TUNA: "TEST" };
  const tProd: GatewayModes = { ...prod, TUNA: "PRODUCTION" };
  const tunaEst = (slug = "bar-do-ze") => est(false, true, "PAGARME", "TUNA", slug);

  it("TEST → Google TEST, gateway tuna, sem merchantId e sem a allowlist do Google", () => {
    // est.googlePay já veio da prontidão da Tuna (TUNA_TEST_SLUGS): não reaplica GOOGLE_PAY_TEST_SLUGS.
    const g = walletWebConfig(tunaEst("outro-bar"), tunaEnv, tTest).googlePay!;
    expect(g).toEqual({
      environment: "TEST",
      merchantName: "Jurandir",
      gateway: "tuna",
      gatewayMerchantId: "tuna_gw",
      allowedCardNetworks: ["VISA", "MASTERCARD"],
      allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"],
    });
  });
  it("PRODUCTION com merchantId → Google PRODUCTION", () => {
    const g = walletWebConfig(tunaEst(), tunaEnv, tProd).googlePay!;
    expect(g.environment).toBe("PRODUCTION");
    expect(g.merchantId).toBe("BCR2DN123");
    expect(g.gateway).toBe("tuna");
  });
  it("PRODUCTION sem merchantId → null (nunca cai pra TEST, mesmo na allowlist)", () => {
    expect(
      walletWebConfig(tunaEst(), { ...tunaEnv, googleMerchantId: "", googleTestSlugs: ["bar-do-ze"] }, tProd)
        .googlePay,
    ).toBeNull();
  });
  it("modo da Tuna desconhecido → null", () => {
    expect(walletWebConfig(tunaEst(), tunaEnv, prod).googlePay).toBeNull();
  });
  it("bar sem Google Pay pronto (est.googlePay=false) → null", () => {
    expect(walletWebConfig(est(false, false, "PAGARME", "TUNA"), tunaEnv, tTest).googlePay).toBeNull();
  });
  it("sem gatewayMerchantId da Tuna → null", () => {
    expect(walletWebConfig(tunaEst(), env, tTest).googlePay).toBeNull();
  });
  it("Apple Pay com gateway TUNA → null no site (fora do escopo)", () => {
    expect(walletWebConfig(est(true, false, "TUNA", "PAGARME"), env, tProd).applePay).toBeNull();
    expect(walletWebConfig(est(true, false, "PAGBANK", "PAGARME"), env, tProd).applePay).not.toBeNull();
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
  it("normaliza APPLE_PAY_DOMAIN: tira esquema, caminho e porta; minúsculo", () => {
    expect(resolveInitiativeContext("https://jurandir.app.br/x", undefined)).toBe(
      "jurandir.app.br",
    );
    expect(resolveInitiativeContext("JURANDIR.App.BR:443", undefined)).toBe(
      "jurandir.app.br",
    );
    expect(resolveInitiativeContext(" jurandir.app.br/ ", undefined)).toBe(
      "jurandir.app.br",
    );
    expect(resolveInitiativeContext("http://Jurandir.app.br:8080/a?b=1", undefined)).toBe(
      "jurandir.app.br",
    );
  });
  it("host de APP_BASE_URL também sai minúsculo", () => {
    expect(resolveInitiativeContext(undefined, "https://Jurandir.APP.br/x")).toBe(
      "jurandir.app.br",
    );
  });
});
