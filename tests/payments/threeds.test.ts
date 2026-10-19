import { describe, it, expect } from "vitest";
import { OrderStatus } from "@prisma/client";
import { decideThreeDsSession, threeDsAmountCents } from "@/lib/payments/threeds";

const valid = {
  status: OrderStatus.AWAITING_PAYMENT,
  method: "DEBIT",
  provider: "PAGBANK",
  hasGatewayCharge: false,
};

describe("decideThreeDsSession", () => {
  it("chave desligada -> disabled (mesmo com pedido válido)", () => {
    expect(decideThreeDsSession(valid, false)).toBe("disabled");
  });
  it("pedido inexistente -> notfound", () => {
    expect(decideThreeDsSession(null, true)).toBe("notfound");
  });
  it("método CREDIT -> notChargeable", () => {
    expect(decideThreeDsSession({ ...valid, method: "CREDIT" }, true)).toBe("notChargeable");
  });
  it("provider PAGARME -> notChargeable", () => {
    expect(decideThreeDsSession({ ...valid, provider: "PAGARME" }, true)).toBe("notChargeable");
  });
  it("já tem cobrança no gateway -> notChargeable", () => {
    expect(decideThreeDsSession({ ...valid, hasGatewayCharge: true }, true)).toBe("notChargeable");
  });
  it("status IN_PRODUCTION -> notChargeable", () => {
    expect(decideThreeDsSession({ ...valid, status: OrderStatus.IN_PRODUCTION }, true)).toBe(
      "notChargeable",
    );
  });
  it("válido -> ok", () => {
    expect(decideThreeDsSession(valid, true)).toBe("ok");
  });
});

describe("threeDsAmountCents", () => {
  it("arredonda como o cents do pagbank", () => {
    expect(threeDsAmountCents(10.05)).toBe(1005);
    expect(threeDsAmountCents(19.9)).toBe(1990);
  });
});
