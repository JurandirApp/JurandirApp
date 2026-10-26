import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  tunaPost,
  TunaError,
  mapTunaStatus,
  pickCi,
  __setTunaModeForTests,
} from "@/lib/payments/tuna";

function respond(body: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const ENV = [
  "TUNA_ACCOUNT", "TUNA_APPTOKEN", "TUNA_ACCOUNT_TEST", "TUNA_APPTOKEN_TEST",
  "TUNA_ENGINE_URL", "TUNA_TOKEN_URL", "TUNA_ENGINE_URL_TEST", "TUNA_TOKEN_URL_TEST",
];
beforeEach(() => {
  ENV.forEach((k) => delete process.env[k]);
  process.env.TUNA_ACCOUNT_TEST = "acc_t";
  process.env.TUNA_APPTOKEN_TEST = "tok_t";
  process.env.TUNA_ACCOUNT = "acc_p";
  process.env.TUNA_APPTOKEN = "tok_p";
  __setTunaModeForTests("TEST");
});
afterEach(() => {
  __setTunaModeForTests(null);
  vi.unstubAllGlobals();
});

describe("tunaPost", () => {
  it("TEST: engine host, headers de auth e idempotência", async () => {
    const fn = respond({ ok: 1 });
    const out = await tunaPost("engine", "/api/Payment/Status", { a: 1 }, { idempotencyKey: "k1" });
    expect(out).toEqual({ ok: 1 });
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("https://engine.tunagateway.com/api/Payment/Status");
    expect(init.method).toBe("POST");
    expect(init.headers["x-tuna-account"]).toBe("acc_t");
    expect(init.headers["x-tuna-apptoken"]).toBe("tok_t");
    expect(init.headers["Idempotency-Key"]).toBe("k1");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ a: 1 });
  });
  it("PRODUCTION usa envs sem sufixo", async () => {
    __setTunaModeForTests("PRODUCTION");
    const fn = respond({});
    await tunaPost("engine", "/x", {});
    const init = fn.mock.calls[0][1];
    expect(init.headers["x-tuna-account"]).toBe("acc_p");
    expect(init.headers["x-tuna-apptoken"]).toBe("tok_p");
    expect(init.headers["Idempotency-Key"]).toBeUndefined();
  });
  it("api token → host do token; auth none → sem headers de auth", async () => {
    const fn = respond({});
    await tunaPost("token", "/api/Token/NewSession", {}, { auth: "none" });
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("https://token.tunagateway.com/api/Token/NewSession");
    expect(init.headers["x-tuna-account"]).toBeUndefined();
    expect(init.headers["x-tuna-apptoken"]).toBeUndefined();
  });
  it("code negativo em HTTP 200 → TunaError 422", async () => {
    respond({ code: -108, message: { a: 1 } });
    const e = await tunaPost("engine", "/x", {}).catch((x: unknown) => x as TunaError);
    expect(e).toBeInstanceOf(TunaError);
    expect(e.status).toBe(422);
    expect(e.code).toBe(-108);
  });
  it("HTTP 500 → TunaError status 500", async () => {
    respond("boom", 500);
    const e = await tunaPost("engine", "/x", {}).catch((x: unknown) => x as TunaError);
    expect(e).toBeInstanceOf(TunaError);
    expect(e.status).toBe(500);
    expect(e.code).toBeNull();
  });
  it("erro de rede/timeout propaga sem virar TunaError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const e = await tunaPost("engine", "/x", {}).catch((x: unknown) => x as TunaError);
    expect(e).not.toBeInstanceOf(TunaError);
  });
});

describe("mapTunaStatus", () => {
  it("mapeia", () => {
    expect(mapTunaStatus("2")).toBe("paid");
    expect(mapTunaStatus("8")).toBe("paid");
    for (const s of ["4", "5", "6", "3", "9", "7"]) expect(mapTunaStatus(s)).toBe("failed");
    for (const s of ["P", "0", undefined, null]) expect(mapTunaStatus(s)).toBe("pending");
  });
});

describe("pickCi", () => {
  it("ignora maiúsculas", () => {
    expect(pickCi({ QrCopyPaste: "x" }, "qrCopyPaste")).toBe("x");
    expect(pickCi({ a: 1 }, "b", "A")).toBe(1);
    expect(pickCi(null, "a")).toBeUndefined();
  });
});
