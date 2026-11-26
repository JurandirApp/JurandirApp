import { describe, it, expect } from "vitest";
import {
  challengeSizeFromPaRequest,
  generateTuna3dsCode,
  isCardinalOrigin,
  isDdcProfileCompleted,
  parseTunaAuthInfo,
  parseTunaThreeDs,
  sanitizeTuna3dsCode,
  sanitizeTunaBrowserInfo,
  tunaAuthenticationInformation,
} from "@/lib/payments/tuna-3ds";
import { buildTunaFrontData, clientInfoFromHeaders } from "@/lib/payments/tuna-fingerprint";

const CODE = "j3ds_0123456789abcdef01234567";
const b64 = (o: unknown) => btoa(JSON.stringify(o));

describe("código 3DS", () => {
  it("valida [A-Za-z0-9_-]{8,50}", () => {
    expect(sanitizeTuna3dsCode(` ${CODE} `)).toBe(CODE);
    expect(sanitizeTuna3dsCode("a".repeat(50))).toBe("a".repeat(50));
    for (const bad of ["a".repeat(51), "curto", "com espaço x", "ç".repeat(10), 123, null, undefined]) {
      expect(sanitizeTuna3dsCode(bad)).toBeUndefined();
    }
  });

  it("generateTuna3dsCode: j3ds_ + 24 hex, sempre válido", () => {
    const c = generateTuna3dsCode();
    expect(c).toMatch(/^j3ds_[0-9a-f]{24}$/);
    expect(sanitizeTuna3dsCode(c)).toBe(c);
    expect(generateTuna3dsCode((b) => b.fill(255))).toBe(`j3ds_${"ff".repeat(12)}`);
  });

  it("parseTunaThreeDs exige referenceId e transactionId; code inválido some", () => {
    expect(parseTunaThreeDs({ code: CODE, referenceId: " r ", transactionId: "t" })).toEqual({
      code: CODE,
      referenceId: "r",
      transactionId: "t",
    });
    expect(parseTunaThreeDs({ code: "x", referenceId: "r", transactionId: "t" })).toEqual({
      referenceId: "r",
      transactionId: "t",
    });
    expect(parseTunaThreeDs({ referenceId: "r" })).toBeUndefined();
    expect(parseTunaThreeDs({ referenceId: "r".repeat(129), transactionId: "t" })).toBeUndefined();
    expect(parseTunaThreeDs("x")).toBeUndefined();
  });

  it("tunaAuthenticationInformation: usa o code; sem code cai pra sessão só se ≤ 50", () => {
    const t = { referenceId: "r", transactionId: "t" };
    expect(tunaAuthenticationInformation({ ...t, code: CODE }, "s".repeat(112))).toEqual({ code: CODE, ...t });
    expect(tunaAuthenticationInformation(t, "sess_1")).toEqual({ code: "sess_1", ...t });
    expect(tunaAuthenticationInformation(t, "s".repeat(50))).toEqual({ code: "s".repeat(50), ...t });
    expect(tunaAuthenticationInformation(t, "s".repeat(51))).toBeUndefined();
    expect(tunaAuthenticationInformation({ code: CODE, referenceId: "r" }, "sess_1")).toBeUndefined();
    expect(tunaAuthenticationInformation(undefined, "sess_1")).toBeUndefined();
  });
});

describe("dados do navegador", () => {
  it("sanitizeTunaBrowserInfo: tipos e faixas; lixo some", () => {
    expect(
      sanitizeTunaBrowserInfo({
        acceptLanguage: " pt-BR,pt;q=0.9 ",
        colorDepth: 24,
        screenHeight: 864,
        screenWidth: 1536,
        timeDifference: -180,
        javaEnabled: false,
        javaScriptEnabled: true,
        lixo: "x",
      }),
    ).toEqual({
      acceptLanguage: "pt-BR,pt;q=0.9",
      colorDepth: 24,
      screenHeight: 864,
      screenWidth: 1536,
      timeDifference: -180,
      javaEnabled: false,
      javaScriptEnabled: true,
    });
    expect(
      sanitizeTunaBrowserInfo({
        acceptLanguage: "<script>",
        colorDepth: 24.5,
        screenHeight: 0,
        screenWidth: 99999,
        timeDifference: 5000,
        javaEnabled: "Y",
      }),
    ).toBeUndefined();
    expect(sanitizeTunaBrowserInfo({ acceptLanguage: "a".repeat(101) })).toBeUndefined();
    expect(sanitizeTunaBrowserInfo(null)).toBeUndefined();
  });

  it("clientInfoFromHeaders pega o Accept (ASCII, ≤ 256)", () => {
    expect(clientInfoFromHeaders(new Headers({ accept: " text/html,*/* " }), "MOBILE")).toEqual({
      origin: "MOBILE",
      acceptHeader: "text/html,*/*",
    });
    expect(clientInfoFromHeaders(new Headers({ accept: "a".repeat(300) }), "MOBILE").acceptHeader).toHaveLength(256);
  });

  it("buildTunaFrontData só com browser/Accept já monta o frontData", () => {
    expect(buildTunaFrontData({ client: { acceptHeader: "*/*" }, browser: { colorDepth: 24, javaEnabled: true } })).toEqual(
      { acceptHeader: "*/*", colorDepth: "24", javaEnabled: "Y", cookiesAccepted: true },
    );
    expect(buildTunaFrontData({ browser: { colorDepth: "24" } })).toBeUndefined();
  });
});

describe("navegador: device data collection e desafio", () => {
  it("parseTunaAuthInfo exige os 4 campos e URL HTTPS", () => {
    const a = { accessToken: "jwt", deviceDataCollectionUrl: "https://centinelapi.cardinalcommerce.com/x", referenceId: "r", transactionId: "t", token: "z" };
    expect(parseTunaAuthInfo(a)).toEqual({
      accessToken: "jwt",
      deviceDataCollectionUrl: a.deviceDataCollectionUrl,
      referenceId: "r",
      transactionId: "t",
    });
    expect(parseTunaAuthInfo({ ...a, deviceDataCollectionUrl: "http://x" })).toBeUndefined();
    expect(parseTunaAuthInfo({ ...a, referenceId: "" })).toBeUndefined();
    expect(parseTunaAuthInfo(null)).toBeUndefined();
  });

  it("isCardinalOrigin", () => {
    expect(isCardinalOrigin("https://centinelapi.cardinalcommerce.com")).toBe(true);
    expect(isCardinalOrigin("https://cardinalcommerce.com")).toBe(true);
    expect(isCardinalOrigin("https://evilcardinalcommerce.com")).toBe(false);
    expect(isCardinalOrigin("http://centinelapi.cardinalcommerce.com")).toBe(false);
    expect(isCardinalOrigin("https://cardinalcommerce.com.evil.io")).toBe(false);
    expect(isCardinalOrigin(undefined)).toBe(false);
  });

  it("isDdcProfileCompleted aceita string JSON ou objeto", () => {
    expect(isDdcProfileCompleted('{"MessageType":"profile.completed","Status":true}')).toBe(true);
    expect(isDdcProfileCompleted({ MessageType: "profile.completed" })).toBe(true);
    expect(isDdcProfileCompleted({ messageType: "profile.completed" })).toBe(true);
    expect(isDdcProfileCompleted('{"MessageType":"other"}')).toBe(false);
    expect(isDdcProfileCompleted("not json")).toBe(false);
    expect(isDdcProfileCompleted(null)).toBe(false);
  });

  it("challengeSizeFromPaRequest pelo challengeWindowSize", () => {
    expect(challengeSizeFromPaRequest(b64({ challengeWindowSize: "01" }))).toEqual({ width: 250, height: 400 });
    expect(challengeSizeFromPaRequest(b64({ challengeWindowSize: "02" }))).toEqual({ width: 390, height: 400 });
    expect(challengeSizeFromPaRequest(b64({ challengeWindowSize: "03" }))).toEqual({ width: 500, height: 600 });
    expect(challengeSizeFromPaRequest(b64({ challengeWindowSize: "04" }))).toEqual({ width: 600, height: 400 });
    expect(challengeSizeFromPaRequest(b64({ ChallengeWindowSize: "05" }))).toEqual({ width: "100%", height: "100%" });
    // base64 sem padding / url-safe
    expect(challengeSizeFromPaRequest(b64({ challengeWindowSize: "03" }).replace(/=+$/, ""))).toEqual({
      width: 500,
      height: 600,
    });
    for (const bad of [undefined, "", "!!!", b64("x"), b64({ challengeWindowSize: "09" })]) {
      expect(challengeSizeFromPaRequest(bad)).toEqual({ width: 390, height: 400 });
    }
  });
});
