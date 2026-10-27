import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  findUnique: vi.fn(),
  paymentUpdate: vi.fn(),
  createWalletPayment: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    order: { findUnique: m.findUnique },
    payment: { update: m.paymentUpdate },
  },
}));
vi.mock("@/lib/payments", () => ({
  resolveWalletGateway: () => "PAGBANK",
  getProviderByName: () => ({ name: "PAGBANK", createWalletPayment: m.createWalletPayment }),
}));

import { payOrderWithWallet } from "@/lib/db/payments";
import { PagbankError } from "@/lib/payments/pagbank";
import { PagarmeError } from "@/lib/payments/pagarme";
import { TunaError } from "@/lib/payments/tuna";

beforeEach(() => {
  vi.clearAllMocks();
  m.findUnique.mockResolvedValue({
    id: "o1",
    code: "ABC123",
    status: "AWAITING_PAYMENT",
    total: 50,
    platformFee: 4,
    establishment: { id: "e1" },
    payment: { id: "p1" },
  });
});

describe("payOrderWithWallet - erro do gateway", () => {
  it("4xx do PagBank → recusa definitiva (sem uncertain)", async () => {
    m.createWalletPayment.mockRejectedValue(new PagbankError(400, "cartão recusado"));
    const r = await payOrderWithWallet("o1", "google_pay", "tok");
    expect(r.status).toBe("failed");
    expect(r.uncertain).toBeUndefined();
    expect(m.paymentUpdate).not.toHaveBeenCalled();
  });
  it("4xx do Pagar.me → recusa definitiva (sem uncertain)", async () => {
    m.createWalletPayment.mockRejectedValue(new PagarmeError(422, "token inválido"));
    const r = await payOrderWithWallet("o1", "apple_pay", "tok");
    expect(r.status).toBe("failed");
    expect(r.uncertain).toBeUndefined();
  });
  it("5xx do gateway → uncertain", async () => {
    m.createWalletPayment.mockRejectedValue(new PagbankError(502, "bad gateway"));
    const r = await payOrderWithWallet("o1", "google_pay", "tok");
    expect(r).toMatchObject({ status: "failed", uncertain: true });
    expect(m.paymentUpdate).not.toHaveBeenCalled();
  });
  it("rede/timeout → uncertain", async () => {
    m.createWalletPayment.mockRejectedValue(new TypeError("fetch failed"));
    const r = await payOrderWithWallet("o1", "google_pay", "tok");
    expect(r).toMatchObject({ status: "failed", uncertain: true });
  });
  it("erro da Tuna → só a mensagem curta, nunca o corpo cru", async () => {
    const body = JSON.stringify({ code: -1, customer: { document: "12345678909" }, message: { message: "Recusado" } });
    m.createWalletPayment.mockRejectedValue(new TunaError(422, -1, body));
    expect(await payOrderWithWallet("o1", "google_pay", "tok")).toEqual({ status: "failed", statusDetail: "Recusado" });
    m.createWalletPayment.mockRejectedValue(new TunaError(502, null, "<html>12345678909</html>"));
    expect(await payOrderWithWallet("o1", "google_pay", "tok")).toEqual({
      status: "failed",
      statusDetail: "tuna:502",
      uncertain: true,
    });
  });
  it("aprovado → grava a cobrança (sem uncertain)", async () => {
    m.createWalletPayment.mockResolvedValue({ chargeId: "ch_1", status: "pending" });
    const r = await payOrderWithWallet("o1", "google_pay", "tok");
    expect(r).toEqual({ status: "pending", statusDetail: undefined });
    expect(m.paymentUpdate).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { gatewayChargeId: "ch_1", provider: "PAGBANK" },
    });
  });
});
