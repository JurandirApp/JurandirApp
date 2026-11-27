import { describe, it, expect, vi, beforeEach } from "vitest";
import { allSharesCharged, needsReconcile, splitPayment } from "@/lib/app/split";
import { orderCreateSchema } from "@/lib/validation";

const m = vi.hoisted(() => ({
  paymentFind: vi.fn(),
  shareFind: vi.fn(),
  shareFindFirst: vi.fn(),
  shareUpdate: vi.fn(),
  shareCount: vi.fn(),
  orderFind: vi.fn(),
  orderUpdate: vi.fn(),
  getChargeStatus: vi.fn(),
  print: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    payment: { findUnique: m.paymentFind },
    splitShare: { findFirst: m.shareFindFirst, update: m.shareUpdate, count: m.shareCount },
    order: { findUnique: m.orderFind, update: m.orderUpdate },
  },
}));
vi.mock("@/lib/payments", () => ({
  getProviderByName: () => ({ getChargeStatus: m.getChargeStatus }),
  resolveWalletGateway: () => "PAGARME",
}));
vi.mock("@/lib/db/print", () => ({ enqueuePrintJob: m.print }));

import { reconcileByChargeId } from "@/lib/db/payments";

describe("needsReconcile", () => {
  it("conta dividida (sem payment, com partes) aguardando → reconcilia", () => {
    expect(needsReconcile({ status: "AWAITING_PAYMENT", payment: null, splitShares: [{}] })).toBe(true);
  });
  it("pagamento cheio aguardando → reconcilia", () => {
    expect(needsReconcile({ status: "AWAITING_PAYMENT", payment: { id: "p" }, splitShares: [] })).toBe(true);
  });
  it("já em produção ou sem cobrança → não", () => {
    expect(needsReconcile({ status: "IN_PRODUCTION", payment: null, splitShares: [{}] })).toBe(false);
    expect(needsReconcile({ status: "AWAITING_PAYMENT", payment: null, splitShares: [] })).toBe(false);
  });
});

describe("splitPayment", () => {
  it("gera N partes Pix válidas pro schema (2..8)", () => {
    const p = splitPayment(3);
    expect(p).toEqual({ kind: "split", shares: [{ method: "PIX" }, { method: "PIX" }, { method: "PIX" }] });
    const ok = orderCreateSchema.safeParse({
      establishmentId: "e1",
      locationLabel: "Mesa 1",
      items: [{ name: "X", qty: 1, unitPrice: 10 }],
      payment: p,
    });
    expect(ok.success).toBe(true);
    expect(splitPayment(1).shares).toHaveLength(2);
    expect(splitPayment(20).shares).toHaveLength(8);
  });
});

describe("allSharesCharged", () => {
  it("falso se alguma parte ficou sem cobrança", () => {
    expect(allSharesCharged([{ chargeId: "a" }, null])).toBe(false);
    expect(allSharesCharged([{ chargeId: "a" }, { chargeId: "" }])).toBe(false);
    expect(allSharesCharged([])).toBe(false);
    expect(allSharesCharged([{ chargeId: "a" }, { chargeId: "b" }])).toBe(true);
  });
});

describe("reconcileByChargeId — cobrança de parte da conta dividida", () => {
  beforeEach(() => vi.clearAllMocks());

  it("webhook com id de uma parte → marca paga e, se era a última, manda pra produção", async () => {
    m.paymentFind.mockResolvedValue(null);
    m.shareFindFirst.mockResolvedValue({ orderId: "o1" });
    m.orderFind.mockResolvedValue({
      id: "o1",
      status: "AWAITING_PAYMENT",
      establishment: { id: "e1" },
      payment: null,
      splitShares: [{ id: "s1", paid: false, gatewayChargeId: "ch_1", provider: "PAGARME", method: "PIX" }],
    });
    m.getChargeStatus.mockResolvedValue("paid");
    m.shareCount.mockResolvedValue(0);

    await reconcileByChargeId("ch_1");

    expect(m.shareFindFirst).toHaveBeenCalledWith({ where: { gatewayChargeId: "ch_1" }, select: { orderId: true } });
    expect(m.shareUpdate).toHaveBeenCalled();
    expect(m.orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "IN_PRODUCTION" } });
    expect(m.print).toHaveBeenCalledWith("o1");
  });

  it("id desconhecido → não faz nada", async () => {
    m.paymentFind.mockResolvedValue(null);
    m.shareFindFirst.mockResolvedValue(null);
    await reconcileByChargeId("nada");
    expect(m.orderFind).not.toHaveBeenCalled();
  });
});
