import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const m = vi.hoisted(() => ({
  payCard: vi.fn(),
  payWallet: vi.fn(),
  resolveChargeable: vi.fn(),
  createOrder: vi.fn(),
  getOrdersByIds: vi.fn(),
  ensureMode: vi.fn(),
}));

vi.mock("@/lib/db/payments", () => ({
  payOrderWithCardToken: m.payCard,
  payOrderWithWallet: m.payWallet,
  resolveChargeableOrder: m.resolveChargeable,
}));
vi.mock("@/lib/db/orders", () => ({ createOrder: m.createOrder, getOrdersByIds: m.getOrdersByIds }));
vi.mock("@/lib/app/adapters", () => ({ toClientOrder: (o: { id: string }) => ({ id: o.id }) }));
vi.mock("@/lib/payments/tuna", async (orig) => {
  const real = await orig<typeof import("@/lib/payments/tuna")>();
  return { ...real, ensureTunaMode: m.ensureMode };
});

import { GET as fpGET, OPTIONS as fpOPTIONS } from "@/app/api/public/tuna/fingerprint/route";
import { POST as cardPOST } from "@/app/api/public/orders/card/route";
import { POST as walletPOST } from "@/app/api/public/orders/wallet/route";

const DSID = "0123456789abcdef0123456789abcdef";
const ENV = ["TUNA_CYBS_MERCHANT_ID", "TUNA_CYBS_MERCHANT_ID_TEST", "TUNA_CYBS_ORG_ID", "TUNA_CYBS_ORG_ID_TEST"];

const req = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://jurandir.app.br${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

let logs: ReturnType<typeof vi.spyOn>[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  ENV.forEach((k) => delete process.env[k]);
  m.ensureMode.mockResolvedValue("TEST");
  m.resolveChargeable.mockResolvedValue({ kind: "charge", id: "o1" });
  m.getOrdersByIds.mockResolvedValue([{ id: "o1" }]);
  m.payCard.mockResolvedValue({ status: "paid" });
  m.payWallet.mockResolvedValue({ status: "paid" });
  logs = [
    vi.spyOn(console, "error").mockImplementation(() => {}),
    vi.spyOn(console, "warn").mockImplementation(() => {}),
    vi.spyOn(console, "log").mockImplementation(() => {}),
  ];
});
afterEach(() => {
  ENV.forEach((k) => delete process.env[k]);
  logs.forEach((s) => s.mockRestore());
});

describe("GET /api/public/tuna/fingerprint", () => {
  it("OPTIONS → 204 com CORS", async () => {
    const r = await fpOPTIONS();
    expect(r.status).toBe(204);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(r.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });

  it("sem merchant id do modo → { enabled:false } (só isso), no-store + CORS", async () => {
    process.env.TUNA_CYBS_MERCHANT_ID = "prod_m"; // produção não vale em TESTE
    const r = await fpGET();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ enabled: false });
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("TESTE com merchant id → org sandbox", async () => {
    process.env.TUNA_CYBS_MERCHANT_ID_TEST = "test_m";
    expect(await (await fpGET()).json()).toEqual({ enabled: true, orgId: "1snn5n9w", merchantId: "test_m" });
  });

  it("PRODUÇÃO com merchant id → org de produção (ou override)", async () => {
    m.ensureMode.mockResolvedValue("PRODUCTION");
    process.env.TUNA_CYBS_MERCHANT_ID = "prod_m";
    expect(await (await fpGET()).json()).toEqual({ enabled: true, orgId: "k8vif92e", merchantId: "prod_m" });
    process.env.TUNA_CYBS_ORG_ID = "org_x";
    expect(await (await fpGET()).json()).toMatchObject({ orgId: "org_x" });
  });

  it("modo indisponível → { enabled:false }", async () => {
    process.env.TUNA_CYBS_MERCHANT_ID_TEST = "test_m";
    m.ensureMode.mockRejectedValue(new Error("db"));
    const r = await fpGET();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ enabled: false });
  });
});

describe("POST /api/public/orders/card — Device Fingerprint", () => {
  const base = { orderId: "o1", cardToken: "ct_1" };
  const appHeaders = { "x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "JurandirApp/1.0 (Android)" };

  it("tuna.deviceSessionId válido vai no `tuna`; IP/UA do request com origem MOBILE", async () => {
    await cardPOST(req("/api/public/orders/card", { ...base, tuna: { sessionId: "sess_1", deviceSessionId: DSID } }, appHeaders));
    const args = m.payCard.mock.calls[0];
    expect(args[7]).toEqual({ sessionId: "sess_1", deviceSessionId: DSID });
    expect(args[8]).toEqual({ origin: "MOBILE", ip: "203.0.113.7", userAgent: "JurandirApp/1.0 (Android)" });
  });

  it("deviceSessionId inválido é ignorado e a cobrança segue", async () => {
    for (const bad of ["curto", "a b c d e f g h i j k", 42, "x".repeat(65)]) {
      m.payCard.mockClear();
      const r = await cardPOST(req("/api/public/orders/card", { ...base, tuna: { sessionId: "sess_1", deviceSessionId: bad } }));
      expect((await r.json()).ok).toBe(true);
      expect(m.payCard.mock.calls[0][7]).toEqual({ sessionId: "sess_1" });
    }
  });

  it("nunca loga o id do device, IP nem UA", async () => {
    m.payCard.mockRejectedValue(new Error("boom"));
    await cardPOST(req("/api/public/orders/card", { ...base, tuna: { sessionId: "sess_1", deviceSessionId: DSID } }, appHeaders));
    const logged = JSON.stringify(logs.map((s) => s.mock.calls));
    expect(logged).not.toContain(DSID);
    expect(logged).not.toContain("203.0.113.7");
    expect(logged).not.toContain("JurandirApp");
  });
});

describe("POST /api/public/orders/wallet — Device Fingerprint", () => {
  const base = { orderId: "o1", walletType: "google_pay", token: "tok" };

  it("deviceSessionId no topo + IP/UA (MOBILE) vão pro payOrderWithWallet", async () => {
    await walletPOST(
      req("/api/public/orders/wallet", { ...base, deviceSessionId: DSID }, { "x-real-ip": "2001:db8::1", "user-agent": "UA" }),
    );
    expect(m.payWallet).toHaveBeenCalledWith("o1", "google_pay", "tok", {
      deviceSessionId: DSID,
      client: { origin: "MOBILE", ip: "2001:db8::1", userAgent: "UA" },
    });
  });

  it("deviceSessionId inválido/ausente → só os dados do cliente", async () => {
    await walletPOST(req("/api/public/orders/wallet", { ...base, deviceSessionId: "<x>" }));
    await walletPOST(req("/api/public/orders/wallet", base));
    expect(m.payWallet.mock.calls[0][3]).toEqual({ client: { origin: "MOBILE" } });
    expect(m.payWallet.mock.calls[1][3]).toEqual({ client: { origin: "MOBILE" } });
  });
});
