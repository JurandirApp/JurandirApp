import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  estFind: vi.fn(),
  orderFind: vi.fn(),
  orderCreate: vi.fn(),
  createPixCharge: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    establishment: { findUnique: m.estFind },
    order: { findUnique: m.orderFind, create: m.orderCreate },
  },
}));
vi.mock("@/lib/db/print", () => ({ enqueuePrintJob: vi.fn() }));
vi.mock("@/lib/db/kitchen", () => ({ assertKitchenAllows: vi.fn() }));
vi.mock("@/lib/payments", () => ({
  getProvider: () => ({ createPixCharge: m.createPixCharge }),
  resolveGateway: () => "PAGARME",
}));

import { createOrder } from "@/lib/db/orders";

const splitBody = (n: number, unitPrice: number) => ({
  establishmentId: "e1",
  locationLabel: "Mesa 1",
  items: [{ name: "Chope", qty: 1, unitPrice }],
  payment: { kind: "split", shares: Array.from({ length: n }, () => ({ method: "PIX" })) },
});

describe("createOrder — conta dividida cobra a comissão da plataforma", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.estFind.mockResolvedValue({ id: "e1", weeklyHours: null, platformFeePct: 8, serviceFeePct: 0 });
    m.orderFind.mockResolvedValue(null);
    m.orderCreate.mockImplementation(async (a: { data: unknown }) => ({ ...(a.data as object), status: "AWAITING_PAYMENT" }));
    m.createPixCharge.mockImplementation(async (i: { reference: string }) => ({
      chargeId: `ch-${i.reference}`,
      pixPayload: "pix",
      pixQrImage: "qr",
      status: "pending",
    }));
  });

  it("2 partes: cada Pix leva metade da comissão (soma = platformFee)", async () => {
    // subtotal 100, 8% → fee 8, total 108 → partes 54 + 54, fatias 4 + 4
    await createOrder(splitBody(2, 100) as never);
    const calls = m.createPixCharge.mock.calls.map((c) => c[0]);
    expect(calls.map((c) => c.total)).toEqual([54, 54]);
    expect(calls.map((c) => c.platformFee)).toEqual([4, 4]);
    const data = m.orderCreate.mock.calls[0][0].data;
    expect(Number(data.platformFee)).toBe(8);
  });

  it("3 partes: resto do arredondamento na última", async () => {
    // subtotal 10, 8% → fee 0.8, total 10.8 → partes 3.6 ×3, fatias 0.27, 0.27, 0.26
    await createOrder(splitBody(3, 10) as never);
    const fees = m.createPixCharge.mock.calls.map((c) => c[0].platformFee);
    expect(fees).toEqual([0.27, 0.27, 0.26]);
    expect(Math.round(fees.reduce((a: number, b: number) => a + b, 0) * 100)).toBe(80);
  });
});
