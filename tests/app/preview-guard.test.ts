import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  createOrder: vi.fn(),
  getSession: vi.fn(),
  payOrderWithCard: vi.fn(),
  previewCookie: undefined as string | undefined,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
  cookies: vi.fn(async () => ({ get: (k: string) => (k === "jur_preview" && m.previewCookie ? { value: m.previewCookie } : undefined) })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSession: m.getSession }));
vi.mock("@/lib/db/orders", () => ({
  createOrder: m.createOrder,
  getOrdersByIds: vi.fn().mockResolvedValue([{ id: "o1" }]),
  payShare: vi.fn(),
}));
vi.mock("@/lib/db/payments", () => ({
  payOrderWithWallet: vi.fn(),
  resolveChargeableOrder: vi.fn(),
  resolveTunaCardCharge: vi.fn(),
  createCardCheckout: vi.fn(),
  reconcileOrder: vi.fn(),
  payOrderWithCard: m.payOrderWithCard,
  payOrderWithCardToken: vi.fn(),
}));
vi.mock("@/lib/app/adapters", () => ({ toClientOrder: (o: { id: string }) => ({ dbId: o.id }) }));

import { createOrderAction, createWalletOrderAction, payCardAction } from "@/lib/actions/app";
import type { OrderCreateInput } from "@/lib/validation";

const input: OrderCreateInput = {
  establishmentId: "e1",
  locationLabel: "Mesa 1",
  items: [{ name: "Chopp", qty: 1, unitPrice: 10 }],
  payment: { kind: "full", method: "CREDIT", installments: 1 },
} as OrderCreateInput;

const staff = (role: string, establishmentId: string | null) => ({
  sub: "u1",
  role,
  establishmentId,
  name: "Bar",
});

beforeEach(() => {
  vi.clearAllMocks();
  m.previewCookie = "e1"; // página aberta com ?preview=1 deste bar
  m.createOrder.mockResolvedValue({ id: "o1", status: "PENDING", payment: { method: "PIX" } });
});

describe("modo visualização — actions de pedido do site", () => {
  it.each([
    ["ESTABLISHMENT", "e1"],
    ["WAITER", "e1"],
  ])("sessão %s deste bar → previewMode, nenhum pedido criado", async (role, est) => {
    m.getSession.mockResolvedValue(staff(role, est));
    expect(await createOrderAction(input)).toEqual({ ok: false, error: "previewMode" });
    expect(await createWalletOrderAction(input)).toEqual({ ok: false, error: "previewMode" });
    expect(await payCardAction(input, {} as never)).toEqual({
      ok: false,
      status: "failed",
      detail: "previewMode",
    });
    expect(m.createOrder).not.toHaveBeenCalled();
    expect(m.payOrderWithCard).not.toHaveBeenCalled();
  });

  it("cliente sem sessão segue normal", async () => {
    m.getSession.mockResolvedValue(null);
    const r = await createOrderAction(input);
    expect(r.ok).toBe(true);
    expect(m.createOrder).toHaveBeenCalledTimes(1);
  });

  it("sem a marca do modo visualização, o dono logado paga normal no próprio bar", async () => {
    m.previewCookie = undefined;
    m.getSession.mockResolvedValue(staff("ESTABLISHMENT", "e1"));
    const r = await createOrderAction(input);
    expect(r.ok).toBe(true);
    expect(m.createOrder).toHaveBeenCalledTimes(1);
  });

  it("sessão de OUTRO bar não barra", async () => {
    m.getSession.mockResolvedValue(staff("ESTABLISHMENT", "e2"));
    const r = await createWalletOrderAction(input);
    expect(r.ok).toBe(true);
    expect(m.createOrder).toHaveBeenCalledTimes(1);
  });
});
