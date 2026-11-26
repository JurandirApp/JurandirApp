import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const m = vi.hoisted(() => ({ getCards: vi.fn(), ensureMode: vi.fn(), createSession: vi.fn() }));

vi.mock("@/lib/db/settings", () => ({ getTunaCardsEnabled: m.getCards }));
vi.mock("@/lib/payments/tuna", async (orig) => {
  const real = await orig<typeof import("@/lib/payments/tuna")>();
  return { ...real, ensureTunaMode: m.ensureMode, createTunaSession: m.createSession };
});

import { POST, OPTIONS } from "@/app/api/public/tuna/cards/session/route";
import { TunaError, __setTunaModeForTests } from "@/lib/payments/tuna";
import { deriveTunaDeviceCustomer } from "@/lib/payments/tuna-cards";

const KEY = "k".repeat(43);
const SESSION = "sess_DEVICE_SEGREDO";

const req = (body: unknown) =>
  new Request("https://jurandir.app.br/api/public/tuna/cards/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

let logs: ReturnType<typeof vi.spyOn>[] = [];
const allLogged = () => JSON.stringify(logs.map((s) => s.mock.calls));
let saved: Record<string, string | undefined> = {};
const ENV = ["TUNA_CARD_KEY_SECRET", "AUTH_SECRET", "TUNA_TOKEN_URL", "TUNA_TOKEN_URL_TEST"];

beforeEach(() => {
  vi.clearAllMocks();
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  ENV.forEach((k) => delete process.env[k]);
  process.env.TUNA_CARD_KEY_SECRET = "segredo";
  __setTunaModeForTests("TEST");
  m.getCards.mockResolvedValue(true);
  m.ensureMode.mockResolvedValue("TEST");
  m.createSession.mockResolvedValue(SESSION);
  logs = (["log", "warn", "error", "info"] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  __setTunaModeForTests(null);
  vi.restoreAllMocks();
});

describe("POST /api/public/tuna/cards/session", () => {
  it("OPTIONS → 204 com CORS", async () => {
    const r = await OPTIONS();
    expect(r.status).toBe(204);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("chave válida → NewSession no customer do aparelho; devolve sessionId + tokenUrl, sem cache", async () => {
    const r = await POST(req({ deviceKey: KEY }));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(await r.json()).toEqual({ sessionId: SESSION, tokenUrl: "https://token.tunagateway.com" });
    const dev = deriveTunaDeviceCustomer(KEY)!;
    expect(m.createSession).toHaveBeenCalledWith({ id: dev.id, email: dev.email }, "TEST");
    expect(allLogged()).not.toContain(KEY);
  });

  it("chave ausente / inválida / JSON inválido → 422 sem chamar a Tuna", async () => {
    for (const body of [{}, { deviceKey: "curta" }, { deviceKey: 5 }, "{nao json"]) {
      const r = await POST(req(body));
      expect(r.status).toBe(422);
      expect(await r.json()).toEqual({ error: "invalidDeviceKey" });
    }
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("modo da Tuna indisponível → 503", async () => {
    m.ensureMode.mockRejectedValue(new TunaError(424, null, JSON.stringify({ message: "modo" })));
    const r = await POST(req({ deviceKey: KEY }));
    expect(r.status).toBe(503);
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("sem segredo do HMAC → 503 sem chamar a Tuna", async () => {
    delete process.env.TUNA_CARD_KEY_SECRET;
    const r = await POST(req({ deviceKey: KEY }));
    expect(r.status).toBe(503);
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("cartões da Tuna desligados → 403", async () => {
    m.getCards.mockResolvedValue(false);
    const r = await POST(req({ deviceKey: KEY }));
    expect(r.status).toBe(403);
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("falha da Tuna no NewSession → 502 sem logar chave nem corpo", async () => {
    m.createSession.mockRejectedValue(new TunaError(500, null, JSON.stringify({ customer: { id: "jdev_x" } })));
    const r = await POST(req({ deviceKey: KEY }));
    expect(r.status).toBe(502);
    expect(allLogged()).not.toContain(KEY);
    expect(allLogged()).not.toContain("jdev_");
  });
});
