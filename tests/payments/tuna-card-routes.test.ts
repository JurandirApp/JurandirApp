import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const m = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  getCards: vi.fn(),
  createSession: vi.fn(),
  chargeFailed: vi.fn(),
  payCard: vi.fn(),
  resolveChargeable: vi.fn(),
  createOrder: vi.fn(),
  getOrdersByIds: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: { order: { findUnique: m.orderFindUnique } } }));
vi.mock("@/lib/db/settings", () => ({ getTunaCardsEnabled: m.getCards }));
vi.mock("@/lib/payments/tuna", async (orig) => {
  const real = await orig<typeof import("@/lib/payments/tuna")>();
  return { ...real, createTunaSession: m.createSession, tunaChargeFailed: m.chargeFailed };
});
vi.mock("@/lib/db/payments", () => ({
  payOrderWithCardToken: m.payCard,
  resolveChargeableOrder: m.resolveChargeable,
}));
vi.mock("@/lib/db/orders", () => ({ createOrder: m.createOrder, getOrdersByIds: m.getOrdersByIds }));
vi.mock("@/lib/app/adapters", () => ({ toClientOrder: (o: { id: string }) => ({ id: o.id }) }));

import { POST as sessionPOST, OPTIONS as sessionOPTIONS } from "@/app/api/public/tuna/session/route";
import { POST as cardPOST } from "@/app/api/public/orders/card/route";
import { TunaError, __setTunaModeForTests } from "@/lib/payments/tuna";

const SESSION = "sess_SEGREDO_123";
const CPF = "12345678909";

const req = (url: string, body: unknown) =>
  new Request(`https://jurandir.app.br${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const tunaOrder = (o: Record<string, unknown> = {}, payment: Record<string, unknown> = {}) => ({
  id: "o1",
  code: "ABC123",
  status: "AWAITING_PAYMENT",
  customerName: "Ana Souza",
  customerPhone: null,
  payment: { method: "CREDIT", provider: "TUNA", gatewayChargeId: null, ...payment },
  ...o,
});

let logs: ReturnType<typeof vi.spyOn>[] = [];
const allLogged = () => JSON.stringify(logs.map((s) => s.mock.calls));

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.TUNA_TOKEN_URL;
  delete process.env.TUNA_TOKEN_URL_TEST;
  __setTunaModeForTests("TEST");
  m.getCards.mockResolvedValue(true);
  m.orderFindUnique.mockResolvedValue(tunaOrder());
  m.createSession.mockResolvedValue(SESSION);
  m.chargeFailed.mockResolvedValue(false);
  m.resolveChargeable.mockResolvedValue({ kind: "charge", id: "o1" });
  m.getOrdersByIds.mockResolvedValue([{ id: "o1" }]);
  logs = (["log", "warn", "error", "info"] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
});
afterEach(() => {
  __setTunaModeForTests(null);
  vi.restoreAllMocks();
});

describe("POST /api/public/tuna/session", () => {
  it("OPTIONS → 204 com CORS", async () => {
    const r = await sessionOPTIONS();
    expect(r.status).toBe(204);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("sem orderId / JSON inválido / pedido inexistente → 404 orderNotFound", async () => {
    m.orderFindUnique.mockResolvedValue(null);
    for (const body of [{}, "{nope", { orderId: "x" }]) {
      const r = await sessionPOST(req("/api/public/tuna/session", body));
      expect(r.status).toBe(404);
      expect(await r.json()).toEqual({ error: "orderNotFound" });
    }
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("pedido Pix / já cobrado / outro gateway → 409 notChargeable", async () => {
    for (const p of [{ method: "PIX" }, { gatewayChargeId: "PK1" }, { provider: "PAGBANK" }]) {
      m.orderFindUnique.mockResolvedValue(tunaOrder({}, p));
      const r = await sessionPOST(req("/api/public/tuna/session", { orderId: "o1" }));
      expect(r.status).toBe(409);
      expect(await r.json()).toEqual({ error: "notChargeable" });
    }
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("retentativa: cobrança anterior RECUSADA na Tuna → abre sessão de novo", async () => {
    m.orderFindUnique.mockResolvedValue(tunaOrder({}, { gatewayChargeId: "PK1" }));
    m.chargeFailed.mockResolvedValue(true);
    const r = await sessionPOST(req("/api/public/tuna/session", { orderId: "o1" }));
    expect(r.status).toBe(200);
    expect(m.chargeFailed).toHaveBeenCalledWith("PK1");
    expect(m.createSession).toHaveBeenCalledTimes(1);
  });

  it("cobrança anterior paga/pendente/sem resposta → 409; pedido não-Tuna nem consulta a Tuna", async () => {
    m.orderFindUnique.mockResolvedValue(tunaOrder({}, { gatewayChargeId: "PK1" }));
    m.chargeFailed.mockResolvedValue(false);
    expect((await sessionPOST(req("/api/public/tuna/session", { orderId: "o1" }))).status).toBe(409);
    m.chargeFailed.mockClear();
    for (const p of [{ method: "PIX", gatewayChargeId: "PK1" }, { provider: "PAGBANK", gatewayChargeId: "PK1" }]) {
      m.orderFindUnique.mockResolvedValue(tunaOrder({}, p));
      expect((await sessionPOST(req("/api/public/tuna/session", { orderId: "o1" }))).status).toBe(409);
    }
    m.orderFindUnique.mockResolvedValue(tunaOrder({ status: "IN_PRODUCTION" }, { gatewayChargeId: "PK1" }));
    expect((await sessionPOST(req("/api/public/tuna/session", { orderId: "o1" }))).status).toBe(409);
    expect(m.chargeFailed).not.toHaveBeenCalled();
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("cartões Tuna desligados → 403 cardsDisabled", async () => {
    m.getCards.mockResolvedValue(false);
    const r = await sessionPOST(req("/api/public/tuna/session", { orderId: "o1" }));
    expect(r.status).toBe(403);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await r.json()).toEqual({ error: "cardsDisabled" });
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("ok → 200 { sessionId, tokenUrl, env } com o cliente do pedido; nunca loga a sessão", async () => {
    const r = await sessionPOST(req("/api/public/tuna/session", { orderId: "o1" }));
    expect(r.status).toBe(200);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await r.json()).toEqual({ sessionId: SESSION, tokenUrl: "https://token.tunagateway.com", env: "TEST" });
    expect(m.orderFindUnique).toHaveBeenCalledWith({ where: { id: "o1" }, include: { payment: true } });
    expect(m.createSession).toHaveBeenCalledWith({ id: "ABC123", email: "pedido-abc123@jurandir.app.br" });
    expect(allLogged()).not.toContain(SESSION);
  });

  it("débito também abre sessão; PRODUCTION devolve host/env de produção", async () => {
    __setTunaModeForTests("PRODUCTION");
    process.env.TUNA_TOKEN_URL = "https://token.prod.example/";
    m.orderFindUnique.mockResolvedValue(tunaOrder({}, { method: "DEBIT" }));
    const r = await sessionPOST(req("/api/public/tuna/session", { orderId: "o1" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ sessionId: SESSION, tokenUrl: "https://token.prod.example", env: "PRODUCTION" });
  });

  it("falha da Tuna → 502 unavailable, sem ecoar o corpo no log", async () => {
    m.createSession.mockRejectedValue(
      new TunaError(422, -1, JSON.stringify({ code: -1, sessionId: SESSION, document: CPF })),
    );
    const r = await sessionPOST(req("/api/public/tuna/session", { orderId: "o1" }));
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ error: "unavailable" });
    expect(allLogged()).not.toContain(SESSION);
    expect(allLogged()).not.toContain(CPF);
  });
});

describe("POST /api/public/orders/card — campos da Tuna", () => {
  const base = { orderId: "o1", cardToken: "ct_1" };

  it("repassa o `tuna` válido e devolve o desafio", async () => {
    const challenge = { url: "https://acs.example", token: "jwt", paRequest: "pa" };
    m.payCard.mockResolvedValue({ status: "pending", challenge });
    const r = await cardPOST(
      req("/api/public/orders/card", {
        ...base,
        tuna: { sessionId: ` ${SESSION} `, brand: "Visa", threeDs: { referenceId: "r1", transactionId: "t1" } },
      }),
    );
    expect(m.payCard.mock.calls[0][7]).toEqual({
      sessionId: SESSION,
      brand: "Visa",
      threeDs: { referenceId: "r1", transactionId: "t1" },
    });
    const j = await r.json();
    expect(j).toMatchObject({ ok: true, status: "pending", challenge });
  });

  it("threeDs incompleto é ignorado; brand não-string é ignorado", async () => {
    m.payCard.mockResolvedValue({ status: "failed", statusDetail: "tuna:422" });
    await cardPOST(
      req("/api/public/orders/card", {
        ...base,
        tuna: { sessionId: SESSION, brand: 7, threeDs: { referenceId: "r1", transactionId: "" } },
      }),
    );
    expect(m.payCard.mock.calls[0][7]).toEqual({ sessionId: SESSION });
  });

  it("sessionId vazio ou `tuna` não-objeto → não repassa nada", async () => {
    m.payCard.mockResolvedValue({ status: "failed" });
    await cardPOST(req("/api/public/orders/card", { ...base, tuna: { sessionId: "  " } }));
    await cardPOST(req("/api/public/orders/card", { ...base, tuna: "sess" }));
    expect(m.payCard.mock.calls[0][7]).toBeUndefined();
    expect(m.payCard.mock.calls[1][7]).toBeUndefined();
  });

  it("sem `tuna` (app publicado) → resposta no formato antigo, sem `challenge`", async () => {
    m.payCard.mockResolvedValue({ status: "paid", statusDetail: undefined });
    const r = await cardPOST(req("/api/public/orders/card", base));
    expect(m.payCard.mock.calls[0][7]).toBeUndefined();
    const j = await r.json();
    expect(Object.keys(j)).toEqual(["ok", "status", "order"]); // detail undefined some no JSON
    expect(j).toEqual({ ok: true, status: "paid", order: { id: "o1" } });
  });

  it("erro inesperado da Tuna (ex.: reconciliação) → 500 sem ecoar o corpo no log", async () => {
    m.resolveChargeable.mockRejectedValue(
      new TunaError(500, null, JSON.stringify({ customer: { document: CPF } })),
    );
    const r = await cardPOST(req("/api/public/orders/card", base));
    expect(r.status).toBe(500);
    expect(allLogged()).not.toContain(CPF);
  });
});
