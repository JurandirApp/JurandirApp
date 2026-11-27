import { describe, it, expect, vi, beforeEach } from "vitest";

// Captura a chamada mTLS à Apple sem rede.
const calls = vi.hoisted(() => [] as { url: string; cert: string; key: string; body: string }[]);
vi.mock("node:https", () => ({
  request: (url: string, opts: { cert: string; key: string }, cb: (res: unknown) => void) => {
    const handlers: Record<string, (v?: unknown) => void> = {};
    const res = {
      statusCode: 200,
      on: (ev: string, fn: (v?: unknown) => void) => {
        handlers[ev] = fn;
        return res;
      },
    };
    return {
      on: () => undefined,
      destroy: () => undefined,
      end: (body: string) => {
        calls.push({ url, cert: opts.cert, key: opts.key, body });
        cb(res);
        handlers.data?.(Buffer.from('{"merchantSessionIdentifier":"x"}'));
        handlers.end?.();
      },
    };
  },
}));

import { POST } from "@/app/api/public/applepay/session/route";

const URL_OK = "https://apple-pay-gateway.apple.com/paymentservices/startSession";
const post = (body: unknown) =>
  POST(new Request("https://jurandir.app.br/api/public/applepay/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));

beforeEach(() => {
  calls.length = 0;
  vi.stubEnv("APPLE_PAY_DOMAIN", "jurandir.app.br");
  vi.stubEnv("APPLE_PAY_MERCHANT_ID", "");
  vi.stubEnv("APPLE_PAY_TUNA_MERCHANT_ID", "");
  vi.stubEnv("APPLE_PAY_MERCHANT_CERT", "CERT-DEFAULT");
  vi.stubEnv("APPLE_PAY_MERCHANT_KEY", "KEY-DEFAULT");
  vi.stubEnv("APPLE_PAY_TUNA_MERCHANT_CERT", "");
  vi.stubEnv("APPLE_PAY_TUNA_MERCHANT_KEY", "");
});

describe("POST /api/public/applepay/session", () => {
  it("sem merchant → nosso merchant + cert padrão (compat)", async () => {
    const res = await post({ validationURL: URL_OK });
    expect(res.status).toBe(200);
    expect(calls[0].cert).toBe("CERT-DEFAULT");
    expect(JSON.parse(calls[0].body).merchantIdentifier).toBe("merchant.br.app.jurandir");
  });

  it("merchant tuna sem cert próprio → 503 (nunca usa o cert padrão)", async () => {
    const res = await post({ validationURL: URL_OK, merchant: "tuna" });
    expect(res.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it("merchant tuna com cert próprio → merchant da Tuna", async () => {
    vi.stubEnv("APPLE_PAY_TUNA_MERCHANT_CERT", "CERT-TUNA");
    vi.stubEnv("APPLE_PAY_TUNA_MERCHANT_KEY", "KEY-TUNA");
    const res = await post({ validationURL: URL_OK, merchant: "tuna" });
    expect(res.status).toBe(200);
    expect(calls[0]).toMatchObject({ cert: "CERT-TUNA", key: "KEY-TUNA" });
    const body = JSON.parse(calls[0].body);
    expect(body).toMatchObject({
      merchantIdentifier: "merchant.br.app.jurandir.tuna",
      initiative: "web",
      initiativeContext: "jurandir.app.br",
    });
  });

  it("merchant desconhecido → 400", async () => {
    expect((await post({ validationURL: URL_OK, merchant: "x" })).status).toBe(400);
  });
});
