import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const m = vi.hoisted(() => ({ ensureMode: vi.fn() }));

vi.mock("@/lib/payments/tuna", async (orig) => {
  const real = await orig<typeof import("@/lib/payments/tuna")>();
  return { ...real, ensureTunaMode: m.ensureMode };
});

import { GET, OPTIONS } from "@/app/api/public/tuna/wallet-config/route";

const ENV = ["TUNA_GOOGLE_GATEWAY_MERCHANT_ID", "TUNA_GOOGLE_GATEWAY_MERCHANT_ID_TEST"];
const DEFAULT_ID = "78c30483-2a55-422e-98f1-b68f77fcaa70";

beforeEach(() => {
  for (const k of ENV) delete process.env[k];
  m.ensureMode.mockReset();
});
afterEach(() => {
  for (const k of ENV) delete process.env[k];
});

describe("GET /api/public/tuna/wallet-config", () => {
  it("produção sem env → id padrão do tuna.js, gateway tuna, sem cache", async () => {
    m.ensureMode.mockResolvedValue("PRODUCTION");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(await res.json()).toEqual({ googlePay: { gateway: "tuna", gatewayMerchantId: DEFAULT_ID } });
  });

  it("produção lê TUNA_GOOGLE_GATEWAY_MERCHANT_ID (ignora o _TEST)", async () => {
    m.ensureMode.mockResolvedValue("PRODUCTION");
    process.env.TUNA_GOOGLE_GATEWAY_MERCHANT_ID = " prod-id ";
    process.env.TUNA_GOOGLE_GATEWAY_MERCHANT_ID_TEST = "test-id";
    expect(await (await GET()).json()).toEqual({ googlePay: { gateway: "tuna", gatewayMerchantId: "prod-id" } });
  });

  it("teste prefere o _TEST e cai no de produção", async () => {
    m.ensureMode.mockResolvedValue("TEST");
    process.env.TUNA_GOOGLE_GATEWAY_MERCHANT_ID = "prod-id";
    process.env.TUNA_GOOGLE_GATEWAY_MERCHANT_ID_TEST = "test-id";
    expect((await (await GET()).json()).googlePay.gatewayMerchantId).toBe("test-id");
    delete process.env.TUNA_GOOGLE_GATEWAY_MERCHANT_ID_TEST;
    expect((await (await GET()).json()).googlePay.gatewayMerchantId).toBe("prod-id");
  });

  it("modo indisponível → googlePay null", async () => {
    m.ensureMode.mockRejectedValue(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ googlePay: null });
  });

  it("OPTIONS → 204 com CORS", async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toContain("GET");
  });
});
