import { describe, it, expect, vi, beforeEach } from "vitest";
import { asaasProvider } from "@/lib/payments/asaas";
import type { Establishment } from "@prisma/client";

function seq(bodies: unknown[]) {
  const fn = vi.fn();
  bodies.forEach((b) =>
    fn.mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(b) }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

const est = {
  asaasWalletId: "wal_1",
  ownerCpfCnpj: "24971563792",
  name: "Bar",
  email: "b@b.com",
} as unknown as Establishment;

beforeEach(() => {
  process.env.ASAAS_API_KEY = "test-key";
  process.env.ASAAS_BASE_URL = "https://api-sandbox.asaas.com/v3";
  vi.restoreAllMocks();
});

describe("asaasProvider.createPixCharge", () => {
  it("cria cliente, cobrança Pix com split e devolve o QR", async () => {
    const fn = seq([
      { id: "cus_1" },
      { id: "pay_1", status: "PENDING" },
      { payload: "000201-copiaecola", encodedImage: "iVBORw0KGgo=" },
    ]);
    const r = await asaasProvider.createPixCharge({
      est,
      reference: "PED-ABC",
      total: 100,
      platformFee: 8,
      description: "Pedido PED-ABC",
    });
    expect(r).toEqual({
      chargeId: "pay_1",
      pixPayload: "000201-copiaecola",
      pixQrImage: "iVBORw0KGgo=",
      status: "pending",
    });
    const paymentBody = JSON.parse(fn.mock.calls[1][1].body as string);
    expect(paymentBody.billingType).toBe("PIX");
    expect(paymentBody.value).toBe(100);
    expect(paymentBody.externalReference).toBe("PED-ABC");
    expect(paymentBody.split).toEqual([{ walletId: "wal_1", fixedValue: 92 }]);
  });
});

describe("asaasProvider.getChargeStatus", () => {
  it("mapeia RECEIVED → paid", async () => {
    seq([{ status: "RECEIVED" }]);
    expect(await asaasProvider.getChargeStatus(est, "pay_1")).toBe("paid");
  });
  it("mapeia PENDING → pending", async () => {
    seq([{ status: "PENDING" }]);
    expect(await asaasProvider.getChargeStatus(est, "pay_1")).toBe("pending");
  });
});
