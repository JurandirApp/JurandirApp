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

import { chargeWalletAction } from "@/lib/actions/app";

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
