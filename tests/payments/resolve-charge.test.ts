import { describe, it, expect } from "vitest";
import { OrderStatus } from "@prisma/client";
import { decideOrderCharge } from "@/lib/db/payments";

// Trava o bug que quebraria a cobrança do cartão no fluxo resiliente: o
// createOrder cria uma Payment PLACEHOLDER (gatewayChargeId null) que SEMPRE
// existe. A decisão precisa olhar `hasGatewayCharge`, NÃO "tem payment".
describe("decideOrderCharge", () => {
  it("COBRA quando AWAITING e ainda sem gatewayChargeId (payment placeholder)", () => {
    expect(
      decideOrderCharge({ status: OrderStatus.AWAITING_PAYMENT, hasGatewayCharge: false }),
    ).toBe("charge");
  });

  it("reconcilia (NÃO cobra de novo) quando já tem gatewayChargeId", () => {
    expect(
      decideOrderCharge({ status: OrderStatus.AWAITING_PAYMENT, hasGatewayCharge: true }),
    ).toBe("reconcile");
  });

  it("settled-paid quando o pedido já saiu de AWAITING (em produção/entregue)", () => {
    expect(
      decideOrderCharge({ status: OrderStatus.IN_PRODUCTION, hasGatewayCharge: true }),
    ).toBe("settled-paid");
    expect(
      decideOrderCharge({ status: OrderStatus.DELIVERED, hasGatewayCharge: false }),
    ).toBe("settled-paid");
  });

  it("notfound quando o pedido não existe", () => {
    expect(decideOrderCharge(null)).toBe("notfound");
  });
});
