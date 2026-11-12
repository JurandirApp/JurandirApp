import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  getOrdersByIds: vi.fn(),
  payOrderWithCardToken: vi.fn(),
  resolveTunaCardCharge: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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

import { payTunaCardAction } from "@/lib/actions/app";

const CPF = "529.982.247-25";
const TOKEN = "ct_TOKEN_SEGREDO";
const SESSION = "sess_SEGREDO";
let errLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  errLog = vi.spyOn(console, "error").mockImplementation(() => {});
  m.getOrdersByIds.mockResolvedValue([{ id: "o1" }]);
  m.resolveTunaCardCharge.mockResolvedValue({ kind: "charge", id: "o1" });
});

describe("payTunaCardAction", () => {
  it("cobra o pedido com o token, 1 parcela, CPF só dígitos e a sessão/bandeira", async () => {
    m.payOrderWithCardToken.mockResolvedValue({ status: "paid" });
    const r = await payTunaCardAction("o1", TOKEN, "debit", CPF, { sessionId: SESSION, brand: "Visa" });
    expect(r).toEqual({ ok: true, status: "paid", order: { dbId: "o1" }, detail: undefined });
    expect(m.payOrderWithCardToken).toHaveBeenCalledWith("o1", TOKEN, 1, "debit", "52998224725", undefined, undefined, {
      sessionId: SESSION,
      brand: "Visa",
    });
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
});
