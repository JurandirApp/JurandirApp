import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  createOrder: vi.fn(),
  getOrdersByIds: vi.fn(),
  payShare: vi.fn(),
  payOrderWithWallet: vi.fn(),
  resolveChargeableOrder: vi.fn(),
  createCardCheckout: vi.fn(),
  reconcileOrder: vi.fn(),
  payOrderWithCard: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/orders", () => ({
  createOrder: m.createOrder,
  getOrdersByIds: m.getOrdersByIds,
  payShare: m.payShare,
}));
vi.mock("@/lib/db/payments", () => ({
  payOrderWithWallet: m.payOrderWithWallet,
  resolveChargeableOrder: m.resolveChargeableOrder,
  createCardCheckout: m.createCardCheckout,
  reconcileOrder: m.reconcileOrder,
  payOrderWithCard: m.payOrderWithCard,
}));
vi.mock("@/lib/app/adapters", () => ({
  toClientOrder: (o: { id: string }) => ({ dbId: o.id }),
}));

import { chargeWalletAction, createWalletOrderAction } from "@/lib/actions/app";
import type { OrderCreateInput } from "@/lib/validation";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.getOrdersByIds.mockResolvedValue([{ id: "o1" }]);
  m.resolveChargeableOrder.mockResolvedValue({ kind: "charge", id: "o1" });
});

describe("chargeWalletAction", () => {
  it("resultado incerto do gateway → failed SEM pedido (cliente vai pra Meus pedidos)", async () => {
    m.payOrderWithWallet.mockResolvedValue({ status: "failed", uncertain: true });
    const r = await chargeWalletAction("o1", "google_pay", "tok");
    expect(r).toEqual({ ok: false, status: "failed" });
    expect(r.order).toBeUndefined();
  });
  it("recusa definitiva → failed COM pedido", async () => {
    m.payOrderWithWallet.mockResolvedValue({ status: "failed", statusDetail: "recusado" });
    const r = await chargeWalletAction("o1", "google_pay", "tok");
    expect(r).toEqual({ ok: false, status: "failed", order: { dbId: "o1" }, detail: "recusado" });
  });
  it("aprovado → paid com pedido", async () => {
    m.payOrderWithWallet.mockResolvedValue({ status: "paid" });
    const r = await chargeWalletAction("o1", "apple_pay", "tok");
    expect(r).toMatchObject({ ok: true, status: "paid", order: { dbId: "o1" } });
  });
});

describe("chargeWalletAction - guardas (nunca cobra fora do caminho feliz)", () => {
  it("pedido já quitado → devolve o status e NÃO cobra", async () => {
    m.resolveChargeableOrder.mockResolvedValue({ kind: "settled", status: "paid" });
    const r = await chargeWalletAction("o1", "google_pay", "tok");
    expect(r).toEqual({ ok: true, status: "paid", order: { dbId: "o1" } });
    expect(m.payOrderWithWallet).not.toHaveBeenCalled();
  });
  it("pedido pendente (já tem cobrança) → NÃO cobra de novo", async () => {
    m.resolveChargeableOrder.mockResolvedValue({ kind: "settled", status: "pending" });
    const r = await chargeWalletAction("o1", "apple_pay", "tok");
    expect(r).toMatchObject({ ok: true, status: "pending" });
    expect(m.payOrderWithWallet).not.toHaveBeenCalled();
  });
  it("pedido não encontrado → failed sem cobrar", async () => {
    m.resolveChargeableOrder.mockResolvedValue({ kind: "notfound" });
    const r = await chargeWalletAction("o1", "google_pay", "tok");
    expect(r).toEqual({ ok: false, status: "failed" });
    expect(m.payOrderWithWallet).not.toHaveBeenCalled();
  });
  it("decisão desconhecida → fail-closed (não cobra)", async () => {
    m.resolveChargeableOrder.mockResolvedValue({ kind: "???" });
    const r = await chargeWalletAction("o1", "google_pay", "tok");
    expect(r).toEqual({ ok: false, status: "failed" });
    expect(m.payOrderWithWallet).not.toHaveBeenCalled();
  });
  it.each([
    ["token vazio", "o1", "google_pay", ""],
    ["walletType inválido", "o1", "samsung_pay", "tok"],
    ["orderId vazio", "", "apple_pay", "tok"],
  ])("%s → failed e nada é chamado", async (_n, orderId, walletType, token) => {
    const r = await chargeWalletAction(
      orderId,
      walletType as "apple_pay" | "google_pay",
      token,
    );
    expect(r).toEqual({ ok: false, status: "failed" });
    expect(m.resolveChargeableOrder).not.toHaveBeenCalled();
    expect(m.payOrderWithWallet).not.toHaveBeenCalled();
  });
});

describe("createWalletOrderAction", () => {
  const base: OrderCreateInput = {
    establishmentId: "e1",
    locationLabel: "Mesa 1",
    items: [{ name: "Chopp", qty: 1, unitPrice: 10 }],
    payment: { kind: "full", method: "CREDIT", installments: 1 },
  };
  beforeEach(() => {
    m.createOrder.mockResolvedValue({ id: "o9" });
  });

  it("crédito à vista → cria o pedido", async () => {
    const r = await createWalletOrderAction(base);
    expect(r).toEqual({ ok: true, order: { dbId: "o9" } });
    expect(m.createOrder).toHaveBeenCalledTimes(1);
  });
  it("força 1 parcela (carteira é sempre à vista)", async () => {
    await createWalletOrderAction({
      ...base,
      payment: { kind: "full", method: "CREDIT", installments: 3 },
    });
    expect(m.createOrder.mock.calls[0][0].payment).toMatchObject({
      kind: "full",
      method: "CREDIT",
      installments: 1,
    });
  });
  it("PIX → recusa sem criar pedido", async () => {
    const r = await createWalletOrderAction({
      ...base,
      payment: { kind: "full", method: "PIX", installments: 1 },
    });
    expect(r).toEqual({ ok: false, error: "invalid" });
    expect(m.createOrder).not.toHaveBeenCalled();
  });
  it("pagamento dividido → recusa sem criar pedido", async () => {
    const r = await createWalletOrderAction({
      ...base,
      payment: { kind: "split", shares: [{ method: "CREDIT" }, { method: "CREDIT" }] },
    });
    expect(r).toEqual({ ok: false, error: "invalid" });
    expect(m.createOrder).not.toHaveBeenCalled();
  });
});
