import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  paymentFindUnique: vi.fn(),
  paymentUpdateMany: vi.fn(),
  shareFindFirst: vi.fn(),
  orderFindUnique: vi.fn(),
  estFindFirst: vi.fn(),
  estUpdate: vi.fn(),
  estUpdateMany: vi.fn(),
  reconcileByChargeId: vi.fn(),
  reconcileOrder: vi.fn(),
  tunaPost: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    payment: { findUnique: m.paymentFindUnique, updateMany: m.paymentUpdateMany },
    splitShare: { findFirst: m.shareFindFirst },
    order: { findUnique: m.orderFindUnique },
    establishment: { findFirst: m.estFindFirst, update: m.estUpdate, updateMany: m.estUpdateMany },
  },
}));
vi.mock("@/lib/db/payments", () => ({
  reconcileByChargeId: m.reconcileByChargeId,
  reconcileOrder: m.reconcileOrder,
}));
vi.mock("@/lib/payments/tuna", async (orig) => {
  const real = await orig<typeof import("@/lib/payments/tuna")>();
  return { ...real, tunaPost: m.tunaPost, ensureTunaMode: async () => "TEST" as const };
});

import { applyTunaMerchantWebhook, handleTunaPaymentWebhook } from "@/lib/db/tuna-webhook";

const candidate = (o: Record<string, unknown> = {}) => ({
  code: "ABC123",
  status: "AWAITING_PAYMENT",
  payment: { id: "p1", provider: "TUNA", gatewayChargeId: null },
  ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.paymentFindUnique.mockResolvedValue(null);
  m.shareFindFirst.mockResolvedValue(null);
  m.orderFindUnique.mockResolvedValue(null);
  m.paymentUpdateMany.mockResolvedValue({ count: 1 });
  m.reconcileByChargeId.mockResolvedValue(undefined);
  m.reconcileOrder.mockResolvedValue(undefined);
  m.estUpdate.mockResolvedValue({});
  m.estUpdateMany.mockResolvedValue({ count: 1 });
});

describe("handleTunaPaymentWebhook", () => {
  it("pagamento conhecido da Tuna → reconcilia pelo paymentKey (re-consulta, não confia no corpo)", async () => {
    m.paymentFindUnique.mockResolvedValue({ provider: "TUNA" });
    expect(await handleTunaPaymentWebhook("PK1", "ABC123")).toBe("reconciled");
    expect(m.reconcileByChargeId).toHaveBeenCalledWith("PK1");
    expect(m.tunaPost).not.toHaveBeenCalled();
    expect(m.paymentUpdateMany).not.toHaveBeenCalled();
  });

  it("paymentKey de cobrança de OUTRO gateway → ignora", async () => {
    m.paymentFindUnique.mockResolvedValue({ provider: "PAGARME" });
    expect(await handleTunaPaymentWebhook("PK1", "ABC123")).toBe("otherProvider");
    expect(m.reconcileByChargeId).not.toHaveBeenCalled();
  });

  it("parte de conta dividida (SplitShare) → reconcilia o pedido pelo fluxo de partes", async () => {
    m.shareFindFirst.mockResolvedValue({ orderId: "o9" });
    expect(await handleTunaPaymentWebhook("PK1", "ABC123-P2")).toBe("share");
    expect(m.shareFindFirst.mock.calls[0][0].where).toEqual({ gatewayChargeId: "PK1", provider: "TUNA" });
    expect(m.reconcileOrder).toHaveBeenCalledWith("o9");
    expect(m.reconcileByChargeId).not.toHaveBeenCalled();
  });

  it("cobrança incerta: Status da Tuna confirma o pedido → anexa o paymentKey e reconcilia", async () => {
    m.orderFindUnique.mockResolvedValue(candidate());
    m.tunaPost.mockResolvedValue({ status: "2", partnerUniqueId: "ABC123", code: 1 });
    expect(await handleTunaPaymentWebhook("PK1", "ABC123")).toBe("attached");
    expect(m.orderFindUnique.mock.calls[0][0].where).toEqual({ code: "ABC123" });
    expect(m.tunaPost).toHaveBeenCalledWith("engine", "/api/Payment/Status", { paymentKey: "PK1" });
    expect(m.paymentUpdateMany).toHaveBeenCalledWith({
      where: { id: "p1", gatewayChargeId: null },
      data: { gatewayChargeId: "PK1" },
    });
    expect(m.reconcileByChargeId).toHaveBeenCalledWith("PK1");
  });

  it("cobrança incerta: Status aponta OUTRO pedido → não anexa", async () => {
    m.orderFindUnique.mockResolvedValue(candidate());
    m.tunaPost.mockResolvedValue({ status: "2", partnerUniqueId: "OUTRO1" });
    expect(await handleTunaPaymentWebhook("PK1", "ABC123")).toBe("unknown");
    expect(m.paymentUpdateMany).not.toHaveBeenCalled();
    expect(m.reconcileByChargeId).not.toHaveBeenCalled();
  });

  it("pedido que não é candidato (já tem cobrança / outro gateway / pago) → nem consulta a Tuna", async () => {
    for (const o of [
      candidate({ payment: { id: "p1", provider: "TUNA", gatewayChargeId: "PK0" } }),
      candidate({ payment: { id: "p1", provider: "PAGBANK", gatewayChargeId: null } }),
      candidate({ status: "IN_PRODUCTION" }),
      null,
    ]) {
      m.orderFindUnique.mockResolvedValueOnce(o);
      expect(await handleTunaPaymentWebhook("PK1", "ABC123")).toBe("unknown");
    }
    expect(m.tunaPost).not.toHaveBeenCalled();
    expect(m.paymentUpdateMany).not.toHaveBeenCalled();
  });

  it("sem partnerUniqueId no corpo → não procura pedido", async () => {
    expect(await handleTunaPaymentWebhook("PK1", "")).toBe("unknown");
    expect(m.orderFindUnique).not.toHaveBeenCalled();
    expect(m.tunaPost).not.toHaveBeenCalled();
  });

  it("anexo concorrente (outro fluxo gravou antes) → não reconcilia por aqui", async () => {
    m.orderFindUnique.mockResolvedValue(candidate());
    m.tunaPost.mockResolvedValue({ partnerUniqueId: "ABC123" });
    m.paymentUpdateMany.mockResolvedValue({ count: 0 });
    expect(await handleTunaPaymentWebhook("PK1", "ABC123")).toBe("unknown");
    expect(m.reconcileByChargeId).not.toHaveBeenCalled();
  });

  it("erro ao reconciliar propaga (a rota decide 500 × 200)", async () => {
    m.paymentFindUnique.mockResolvedValue({ provider: "TUNA" });
    m.reconcileByChargeId.mockRejectedValue(new Error("db down"));
    await expect(handleTunaPaymentWebhook("PK1", "ABC123")).rejects.toThrow("db down");
  });
});

describe("applyTunaMerchantWebhook", () => {
  const est = (o: Record<string, unknown> = {}) => ({
    id: "e1",
    tunaMerchantEnv: "TEST",
    tunaPixStatus: "analysis",
    tunaCardStatus: "analysis",
    tunaKycLevel: null,
    ...o,
  });
  const n = (o: Record<string, unknown> = {}) => ({
    env: "TEST" as "TEST" | "PRODUCTION" | "any",
    externalId: "jur_e1",
    serviceId: 69 as unknown,
    serviceName: "" as unknown,
    messageCode: "SRVMerchantRegisterOk",
    kycLevel: null as string | null,
    ...o,
  });

  it("bar não encontrado → notfound", async () => {
    m.estFindFirst.mockResolvedValue(null);
    expect(await applyTunaMerchantWebhook(n())).toBe("notfound");
    expect(m.estFindFirst.mock.calls[0][0].where).toEqual({ tunaMerchantExternalId: "jur_e1" });
  });

  it("ambiente do segredo ≠ ambiente do cadastro → ignora", async () => {
    m.estFindFirst.mockResolvedValue(est({ tunaMerchantEnv: "TEST" }));
    expect(await applyTunaMerchantWebhook(n({ env: "PRODUCTION" }))).toBe("otherEnv");
    expect(m.estUpdate).not.toHaveBeenCalled();
    expect(m.estUpdateMany).not.toHaveBeenCalled();
  });

  it("Pix aprovado → tunaPixStatus active (ambiente any também vale)", async () => {
    m.estFindFirst.mockResolvedValue(est());
    expect(await applyTunaMerchantWebhook(n({ env: "any" }))).toBe("updated");
    expect(m.estUpdate).toHaveBeenCalledWith({ where: { id: "e1" }, data: { tunaPixStatus: "active" } });
  });

  it("cartão recusado → grava rejected só se ainda não estiver active (à prova de corrida)", async () => {
    m.estFindFirst.mockResolvedValue(est());
    expect(
      await applyTunaMerchantWebhook(n({ serviceId: 41, messageCode: "SRVMerchantRegisterRejected" })),
    ).toBe("updated");
    expect(m.estUpdateMany).toHaveBeenCalledWith({
      where: { id: "e1", OR: [{ tunaCardStatus: null }, { tunaCardStatus: { not: "active" } }] },
      data: { tunaCardStatus: "rejected" },
    });
    expect(m.estUpdate).not.toHaveBeenCalled();
  });

  it("grupo já active + recusa de outro provedor → nada muda", async () => {
    m.estFindFirst.mockResolvedValue(est({ tunaPixStatus: "active" }));
    expect(
      await applyTunaMerchantWebhook(n({ messageCode: "SRVMerchantRegisterRejected" })),
    ).toBe("unchanged");
    expect(m.estUpdate).not.toHaveBeenCalled();
    expect(m.estUpdateMany).not.toHaveBeenCalled();
  });

  it("kycLevel quando vier → grava", async () => {
    m.estFindFirst.mockResolvedValue(est({ tunaPixStatus: "active" }));
    expect(await applyTunaMerchantWebhook(n({ kycLevel: "1" }))).toBe("updated");
    expect(m.estUpdate).toHaveBeenCalledWith({ where: { id: "e1" }, data: { tunaKycLevel: "1" } });
  });

  it("serviço desconhecido e sem kyc → unchanged", async () => {
    m.estFindFirst.mockResolvedValue(est());
    expect(await applyTunaMerchantWebhook(n({ serviceId: 999, serviceName: "x" }))).toBe("unchanged");
    expect(m.estUpdate).not.toHaveBeenCalled();
    expect(m.estUpdateMany).not.toHaveBeenCalled();
  });
});
