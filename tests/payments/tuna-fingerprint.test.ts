import { describe, it, expect } from "vitest";
import {
  buildTunaFrontData,
  clientInfoFromHeaders,
  clientIpFromHeaders,
  clientUserAgentFromHeaders,
  isLikelyIp,
  sanitizeDeviceSessionId,
  tunaFingerprintConfig,
} from "@/lib/payments/tuna-fingerprint";

describe("tunaFingerprintConfig", () => {
  it("sem merchant id do modo → desligado", () => {
    expect(tunaFingerprintConfig("TEST", {})).toEqual({ enabled: false });
    expect(tunaFingerprintConfig("PRODUCTION", { TUNA_CYBS_MERCHANT_ID: "  " })).toEqual({ enabled: false });
  });
  it("por modo SEM fallback: TESTE não usa o de produção e vice-versa", () => {
    expect(tunaFingerprintConfig("TEST", { TUNA_CYBS_MERCHANT_ID: "prod_m" })).toEqual({ enabled: false });
    expect(tunaFingerprintConfig("PRODUCTION", { TUNA_CYBS_MERCHANT_ID_TEST: "test_m" })).toEqual({ enabled: false });
  });
  it("org_id padrão por ambiente", () => {
    expect(tunaFingerprintConfig("TEST", { TUNA_CYBS_MERCHANT_ID_TEST: "test_m" })).toEqual({
      enabled: true,
      orgId: "1snn5n9w",
      merchantId: "test_m",
    });
    expect(tunaFingerprintConfig("PRODUCTION", { TUNA_CYBS_MERCHANT_ID: " prod_m " })).toEqual({
      enabled: true,
      orgId: "k8vif92e",
      merchantId: "prod_m",
    });
  });
  it("org_id sobrescrito por env do modo", () => {
    expect(
      tunaFingerprintConfig("TEST", {
        TUNA_CYBS_MERCHANT_ID_TEST: "m",
        TUNA_CYBS_ORG_ID_TEST: "org_t",
        TUNA_CYBS_ORG_ID: "org_p",
      }),
    ).toMatchObject({ orgId: "org_t" });
    expect(
      tunaFingerprintConfig("PRODUCTION", { TUNA_CYBS_MERCHANT_ID: "m", TUNA_CYBS_ORG_ID_TEST: "org_t" }),
    ).toMatchObject({ orgId: "k8vif92e" });
  });
});

describe("sanitizeDeviceSessionId", () => {
  it("aceita [A-Za-z0-9_-]{16,64} (aparado)", () => {
    expect(sanitizeDeviceSessionId("0123456789abcdef0123456789abcdef")).toBe("0123456789abcdef0123456789abcdef");
    expect(sanitizeDeviceSessionId(" abc_DEF-1234567890 ")).toBe("abc_DEF-1234567890");
    expect(sanitizeDeviceSessionId("a".repeat(16))).toBe("a".repeat(16));
    expect(sanitizeDeviceSessionId("a".repeat(64))).toBe("a".repeat(64));
  });
  it("rejeita o resto", () => {
    for (const v of ["a".repeat(15), "a".repeat(65), "abc def 1234567890", "abc.def.1234567890", "<script>xx</script>", "", 123, null, undefined, {}]) {
      expect(sanitizeDeviceSessionId(v)).toBeUndefined();
    }
  });
});

describe("IP / user agent dos headers", () => {
  it("isLikelyIp", () => {
    for (const ok of ["203.0.113.7", "0.0.0.0", "2001:db8::1", "::1", "::ffff:10.0.0.1"]) expect(isLikelyIp(ok)).toBe(true);
    for (const bad of ["256.1.1.1", "1.2.3", "1.2.3.4:80", "abc", "1:2", "", "[::1]", "fe80::1%eth0"]) {
      expect(isLikelyIp(bad)).toBe(false);
    }
  });
  it("1ª entrada do x-forwarded-for; senão x-real-ip; inválido → undefined", () => {
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1", "x-real-ip": "1.1.1.1" }))).toBe(
      "203.0.113.7",
    );
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": "2001:db8::1" }))).toBe("2001:db8::1");
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "lixo" }))).toBeUndefined();
    expect(clientIpFromHeaders(new Headers())).toBeUndefined();
  });
  it("user agent aparado e limitado a 512", () => {
    expect(clientUserAgentFromHeaders(new Headers({ "user-agent": "  UA  " }))).toBe("UA");
    expect(clientUserAgentFromHeaders(new Headers({ "user-agent": "x".repeat(600) }))?.length).toBe(512);
    expect(clientUserAgentFromHeaders(new Headers())).toBeUndefined();
  });
  it("clientInfoFromHeaders", () => {
    expect(clientInfoFromHeaders(new Headers({ "x-real-ip": "1.2.3.4", "user-agent": "UA" }), "MOBILE")).toEqual({
      origin: "MOBILE",
      ip: "1.2.3.4",
      userAgent: "UA",
    });
    expect(clientInfoFromHeaders(new Headers(), "WEBSITE")).toEqual({ origin: "WEBSITE" });
  });
});

describe("buildTunaFrontData", () => {
  const DSID = "0123456789abcdef0123456789abcdef";
  it("completo, camelCase exato", () => {
    expect(
      buildTunaFrontData({ deviceSessionId: DSID, client: { origin: "MOBILE", ip: "1.2.3.4", userAgent: "UA" } }),
    ).toEqual({ sessionId: DSID, origin: "MOBILE", ipAddress: "1.2.3.4", userAgent: "UA", cookiesAccepted: true });
  });
  it("só a sessão do device", () => {
    expect(buildTunaFrontData({ deviceSessionId: DSID })).toEqual({ sessionId: DSID, cookiesAccepted: true });
  });
  it("descarta id e IP inválidos, origem desconhecida; UA truncado", () => {
    expect(
      buildTunaFrontData({
        deviceSessionId: "curto",
        client: { origin: "X" as never, ip: "999.1.1.1", userAgent: "u".repeat(600) },
      }),
    ).toEqual({ userAgent: "u".repeat(512), cookiesAccepted: true });
  });
  it("nada útil (nem com a origem) → undefined", () => {
    expect(buildTunaFrontData({})).toBeUndefined();
    expect(buildTunaFrontData({ deviceSessionId: "x", client: { origin: "WEBSITE" } })).toBeUndefined();
  });
});
