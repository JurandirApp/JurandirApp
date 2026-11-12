import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  findUnique: vi.fn(),
  paymentFindUnique: vi.fn(),
  chargeFailed: vi.fn(),
  getProvider: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { order: { findUnique: m.findUnique }, payment: { findUnique: m.paymentFindUnique } },
}));
vi.mock("@/lib/payments", () => ({ getProviderByName: m.getProvider, resolveWalletGateway: vi.fn() }));
vi.mock("@/lib/payments/tuna", async (orig) => ({
  ...(await orig<typeof import("@/lib/payments/tuna")>()),
  tunaChargeFailed: m.chargeFailed,
}));

import { resolveTunaCardCharge } from "@/lib/db/payments";

const order = (o: Record<string, unknown> = {}, payment: Record<string, unknown> | null = {}) => ({
  id: "o1",
  status: "AWAITING_PAYMENT",
  payment: payment && { method: "CREDIT", provider: "TUNA", gatewayChargeId: null, ...payment },
  splitShares: [],
  ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.chargeFailed.mockResolvedValue(false);
  // Reconciliação: a cobrança (pendente na Tuna) não muda o pedido.
  m.paymentFindUnique.mockResolvedValue(null);
  // reconcileOrder (via resolveChargeableOrder) com cobrança conhecida → consulta o provider.
  m.getProvider.mockReturnValue({ name: "TUNA", getChargeStatus: vi.fn().mockResolvedValue("pending") });
});

describe("resolveTunaCardCharge", () => {
  it("inexistente → notfound; já pago → settled paid", async () => {
    m.findUnique.mockResolvedValue(null);
    expect(await resolveTunaCardCharge("o1")).toEqual({ kind: "notfound" });
    m.findUnique.mockResolvedValue(order({ status: "IN_PRODUCTION" }));
    expect(await resolveTunaCardCharge("o1")).toEqual({ kind: "settled", status: "paid" });
  });

  it("não é cartão Tuna → notChargeable (sem consultar a Tuna)", async () => {
    for (const p of [{ method: "PIX" }, { provider: "PAGARME" }, null]) {
      m.findUnique.mockResolvedValue(order({}, p));
      expect(await resolveTunaCardCharge("o1")).toEqual({ kind: "notChargeable" });
    }
    expect(m.chargeFailed).not.toHaveBeenCalled();
  });

  it("sem cobrança → charge", async () => {
    m.findUnique.mockResolvedValue(order({}, { method: "DEBIT" }));
    expect(await resolveTunaCardCharge("o1")).toEqual({ kind: "charge", id: "o1" });
    expect(m.chargeFailed).not.toHaveBeenCalled();
  });

  it("cobrança anterior RECUSADA na Tuna → charge (retentativa no mesmo pedido)", async () => {
    m.findUnique.mockResolvedValue(order({}, { gatewayChargeId: "PK1" }));
    m.chargeFailed.mockResolvedValue(true);
    expect(await resolveTunaCardCharge("o1")).toEqual({ kind: "charge", id: "o1" });
    expect(m.chargeFailed).toHaveBeenCalledWith("PK1");
  });

  it("cobrança anterior viva (paga/pendente/sem resposta) → settled, nunca charge", async () => {
    m.findUnique.mockResolvedValue(order({}, { gatewayChargeId: "PK1" }));
    m.chargeFailed.mockResolvedValue(false);
    expect(await resolveTunaCardCharge("o1")).toEqual({ kind: "settled", status: "pending" });
  });
});
