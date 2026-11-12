import { describe, it, expect, vi } from "vitest";
import { generateTunaCardToken, requestTunaSession } from "@/lib/payments/tuna-browser";

const res = (body: unknown, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

const CARD = {
  cardNumber: "4111111111111111",
  cardHolderName: "ANA SOUZA",
  expirationMonth: "12",
  expirationYear: "2028",
  cvv: "123",
};

describe("requestTunaSession", () => {
  it("ok → sessionId + tokenUrl (sem barra final); manda só o orderId pra nossa rota", async () => {
    const f = vi.fn().mockResolvedValue(res({ sessionId: "s1", tokenUrl: "https://token.tunagateway.com/", env: "TEST" }));
    expect(await requestTunaSession("o1", f)).toEqual({ ok: true, sessionId: "s1", tokenUrl: "https://token.tunagateway.com" });
    expect(f.mock.calls[0][0]).toBe("/api/public/tuna/session");
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ orderId: "o1" });
  });
  it("404/409/403 → notChargeable; 502/rede → unavailable; tokenUrl sem HTTPS → unavailable", async () => {
    for (const s of [404, 409, 403]) {
      expect(await requestTunaSession("o1", vi.fn().mockResolvedValue(res({}, s)))).toEqual({ ok: false, reason: "notChargeable" });
    }
    expect(await requestTunaSession("o1", vi.fn().mockResolvedValue(res({}, 502)))).toEqual({ ok: false, reason: "unavailable" });
    expect(await requestTunaSession("o1", vi.fn().mockRejectedValue(new Error("x")))).toEqual({ ok: false, reason: "unavailable" });
    expect(
      await requestTunaSession("o1", vi.fn().mockResolvedValue(res({ sessionId: "s1", tokenUrl: "http://evil.test" }))),
    ).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("generateTunaCardToken", () => {
  it("POST <tokenUrl>/api/Token/Generate SEM auth, cartão de uso único → token + bandeira", async () => {
    const f = vi.fn().mockResolvedValue(res({ code: 1, token: "ct_1", brand: "Visa" }));
    expect(await generateTunaCardToken("https://token.tunagateway.com", "s1", CARD, f)).toEqual({
      ok: true,
      token: "ct_1",
      brand: "Visa",
    });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://token.tunagateway.com/api/Token/Generate");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ sessionId: "s1", card: { ...CARD, singleUse: true } });
  });
  it("code negativo / 4xx / sem token → invalid (nada cobrado)", async () => {
    for (const r of [res({ code: -1, message: "Invalid card" }), res({ message: "bad" }, 400), res({ code: 1 })]) {
      expect(await generateTunaCardToken("https://t", "s1", CARD, vi.fn().mockResolvedValue(r))).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
  });
  it("rede / 5xx / corpo ilegível → unavailable", async () => {
    for (const f of [vi.fn().mockRejectedValue(new Error("x")), vi.fn().mockResolvedValue(res({}, 503)), vi.fn().mockResolvedValue(res("<html>"))]) {
      expect(await generateTunaCardToken("https://t", "s1", CARD, f)).toEqual({ ok: false, reason: "unavailable" });
    }
  });
});
