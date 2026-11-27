import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  getOrdersByIds: vi.fn(),
  payOrderWithCardToken: vi.fn(),
  resolveTunaCardCharge: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: m.headers }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Sem sessão do painel (cliente anônimo) — o guarda do modo visualização não barra.
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/db/orders", () => ({ createOrder: vi.fn(), getOrdersByIds: m.getOrdersByIds, payShare: vi.fn() }));
vi.mock("@/lib/db/payments", () => ({
  payOrderWithCardToken: m.payOrderWithCardToken,
  resolveTunaCardCharge: m.resolveTunaCardCharge,
  resolveChargeableOrder: vi.fn(),
  createCardCheckout: vi.fn(),
  reconcileOrder: vi.fn(),
  payOrderWithCard: vi.fn(),
  payOrderWithWallet: vi.fn(),
}));
vi.mock("@/lib/app/adapters", () => ({ toClientOrder: (o: { id: string }) => ({ dbId: o.id }) }));

import { payTunaCardAction, tunaCardStatusAction } from "@/lib/actions/app";

const CPF = "529.982.247-25";
const TOKEN = "ct_TOKEN_SEGREDO";
const SESSION = "sess_SEGREDO";
let errLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  errLog = vi.spyOn(console, "error").mockImplementation(() => {});
  m.getOrdersByIds.mockResolvedValue([{ id: "o1" }]);
  m.resolveTunaCardCharge.mockResolvedValue({ kind: "charge", id: "o1" });
  m.headers.mockResolvedValue(new Headers());
});

describe("payTunaCardAction", () => {
  it("cobra o pedido com o token, 1 parcela, CPF só dígitos e a sessão/bandeira", async () => {
    m.payOrderWithCardToken.mockResolvedValue({ status: "paid" });
    const r = await payTunaCardAction("o1", TOKEN, "debit", CPF, { sessionId: SESSION, brand: "Visa" });
    expect(r).toEqual({ ok: true, status: "paid", order: { dbId: "o1" }, detail: undefined });
    expect(m.payOrderWithCardToken).toHaveBeenCalledWith(
      "o1",
      TOKEN,
      1,
      "debit",
      "52998224725",
      undefined,
      undefined,
      { sessionId: SESSION, brand: "Visa" },
      { origin: "WEBSITE" },
    );
  });

  it("fingerprint: deviceSessionId válido vai no `tuna`; IP/UA do request, origem WEBSITE", async () => {
    m.payOrderWithCardToken.mockResolvedValue({ status: "paid" });
    m.headers.mockResolvedValue(
      new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "Mozilla/5.0 Teste" }),
    );
    const DSID = "0123456789abcdef0123456789abcdef";
    await payTunaCardAction("o1", TOKEN, "credit", CPF, { sessionId: SESSION }, DSID);
    const args = m.payOrderWithCardToken.mock.calls[0];
    expect(args[7]).toEqual({ sessionId: SESSION, deviceSessionId: DSID });
    expect(args[8]).toEqual({ origin: "WEBSITE", ip: "203.0.113.7", userAgent: "Mozilla/5.0 Teste" });
  });

  it("fingerprint: deviceSessionId inválido é descartado (cobra igual)", async () => {
    m.payOrderWithCardToken.mockResolvedValue({ status: "paid" });
    for (const bad of ["curto", "tem espaço 1234567890", "x".repeat(65), 123 as never]) {
      m.payOrderWithCardToken.mockClear();
      const r = await payTunaCardAction("o1", TOKEN, "credit", CPF, { sessionId: SESSION }, bad);
      expect(r.status).toBe("paid");
      expect(m.payOrderWithCardToken.mock.calls[0][7]).toEqual({ sessionId: SESSION });
    }
  });

  it("fora de um request (headers() lança) → cobra sem dados do cliente", async () => {
    m.payOrderWithCardToken.mockResolvedValue({ status: "paid" });
    m.headers.mockRejectedValue(new Error("outside request scope"));
    const r = await payTunaCardAction("o1", TOKEN, "credit", CPF, { sessionId: SESSION });
    expect(r.status).toBe("paid");
    expect(m.payOrderWithCardToken.mock.calls[0][8]).toBeUndefined();
  });

  it("recusa → failed com o pedido (cliente tenta outro cartão no mesmo pedido)", async () => {
    m.payOrderWithCardToken.mockResolvedValue({ status: "failed", statusDetail: "recusado" });
    const r = await payTunaCardAction("o1", TOKEN, "credit", CPF, { sessionId: SESSION });
    expect(r).toMatchObject({ ok: false, status: "failed", order: { dbId: "o1" } });
    expect(r.uncertain).toBeUndefined();
  });

  it("pendente (incerto no gateway) → pending", async () => {
    m.payOrderWithCardToken.mockResolvedValue({ status: "pending" });
    expect((await payTunaCardAction("o1", TOKEN, "credit", CPF, { sessionId: SESSION })).status).toBe("pending");
  });

  it("pedido já pago/pendente → não cobra, devolve o estado", async () => {
    m.resolveTunaCardCharge.mockResolvedValue({ kind: "settled", status: "pending" });
    const r = await payTunaCardAction("o1", TOKEN, "credit", CPF, { sessionId: SESSION });
    expect(r).toEqual({ ok: true, status: "pending", order: { dbId: "o1" } });
    expect(m.payOrderWithCardToken).not.toHaveBeenCalled();
  });

  it("pedido que não é cartão Tuna / inexistente → failed sem cobrar", async () => {
    for (const kind of ["notChargeable", "notfound"]) {
      m.resolveTunaCardCharge.mockResolvedValue({ kind });
      expect(await payTunaCardAction("o1", TOKEN, "credit", CPF, { sessionId: SESSION })).toEqual({
        ok: false,
        status: "failed",
      });
    }
    expect(m.payOrderWithCardToken).not.toHaveBeenCalled();
  });

  it("entrada inválida (CPF, token, sessão, método) → failed sem tocar no banco", async () => {
    const bad: Parameters<typeof payTunaCardAction>[] = [
      ["o1", TOKEN, "credit", "111.111.111-11", { sessionId: SESSION }],
      ["o1", "", "credit", CPF, { sessionId: SESSION }],
      ["o1", TOKEN, "credit", CPF, { sessionId: "" }],
      ["o1", TOKEN, "pix" as never, CPF, { sessionId: SESSION }],
      ["", TOKEN, "credit", CPF, { sessionId: SESSION }],
    ];
    for (const args of bad) expect(await payTunaCardAction(...args)).toEqual({ ok: false, status: "failed" });
    expect(m.resolveTunaCardCharge).not.toHaveBeenCalled();
  });

  it("erro inesperado → pending + uncertain (nunca 'recusado'); não loga token/sessão/CPF", async () => {
    m.payOrderWithCardToken.mockRejectedValue(new Error(`boom ${TOKEN} ${SESSION} 52998224725`));
    const r = await payTunaCardAction("o1", TOKEN, "credit", CPF, { sessionId: SESSION });
    expect(r).toEqual({ ok: false, status: "pending", uncertain: true });
    const logged = JSON.stringify(errLog.mock.calls);
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain(SESSION);
    expect(logged).not.toContain("52998224725");
  });

  it("3DS: repassa threeDs/browser saneados + Accept do request e devolve o desafio", async () => {
    const challenge = { url: "https://acs.example", token: "jwt", paRequest: "pa" };
    m.payOrderWithCardToken.mockResolvedValue({ status: "pending", challenge });
    m.headers.mockResolvedValue(new Headers({ accept: "text/html" }));
    const code = "j3ds_0123456789abcdef01234567";
    const r = await payTunaCardAction("o1", TOKEN, "debit", CPF, {
      sessionId: SESSION,
      threeDs: { code, referenceId: "r1", transactionId: "t1" },
      browser: { colorDepth: 24, screenWidth: -5, javaScriptEnabled: true },
    });
    expect(r).toMatchObject({ ok: true, status: "pending", challenge });
    const args = m.payOrderWithCardToken.mock.calls[0];
    expect(args[7]).toEqual({
      sessionId: SESSION,
      threeDs: { code, referenceId: "r1", transactionId: "t1" },
      browser: { colorDepth: 24, javaScriptEnabled: true },
    });
    expect(args[8]).toEqual({ origin: "WEBSITE", acceptHeader: "text/html" });
  });

  it("3DS incompleto é descartado", async () => {
    m.payOrderWithCardToken.mockResolvedValue({ status: "paid" });
    await payTunaCardAction("o1", TOKEN, "debit", CPF, {
      sessionId: SESSION,
      threeDs: { code: "j3ds_0123456789abcdef01234567", referenceId: "r1", transactionId: "" },
    });
    expect(m.payOrderWithCardToken.mock.calls[0][7]).toEqual({ sessionId: SESSION });
  });
});

describe("tunaCardStatusAction", () => {
  it("pago → paid com o pedido; recusado → failed; pendente → pending", async () => {
    m.resolveTunaCardCharge.mockResolvedValueOnce({ kind: "settled", status: "paid" });
    expect(await tunaCardStatusAction("o1")).toEqual({ status: "paid", order: { dbId: "o1" } });
    m.resolveTunaCardCharge.mockResolvedValueOnce({ kind: "charge", id: "o1" });
    expect(await tunaCardStatusAction("o1")).toEqual({ status: "failed" });
    m.resolveTunaCardCharge.mockResolvedValueOnce({ kind: "settled", status: "pending" });
    expect(await tunaCardStatusAction("o1")).toEqual({ status: "pending" });
    expect(m.payOrderWithCardToken).not.toHaveBeenCalled();
  });

  it("erro/entrada inválida → pending (nunca 'recusado')", async () => {
    m.resolveTunaCardCharge.mockRejectedValueOnce(new Error("db"));
    expect(await tunaCardStatusAction("o1")).toEqual({ status: "pending" });
    expect(await tunaCardStatusAction("")).toEqual({ status: "pending" });
  });
});
