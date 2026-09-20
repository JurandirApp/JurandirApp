import { describe, expect, test } from "vitest";

import { aggregatePlatformOverview, type OverviewOrder } from "./overview";

const order = (over: Partial<OverviewOrder>): OverviewOrder => ({
  establishmentId: "e1",
  status: "IN_PRODUCTION",
  total: 10,
  platformFee: 1,
  payment: { method: "PIX" },
  splitShares: [],
  ...over,
});

describe("aggregatePlatformOverview — só pedidos pagos entram", () => {
  test("pedido AWAITING_PAYMENT (não pago) não conta em nada", () => {
    const agg = aggregatePlatformOverview([
      order({ status: "AWAITING_PAYMENT", total: 99, platformFee: 9 }),
    ]);
    expect(agg.gmvTotal).toBe(0);
    expect(agg.feesTotal).toBe(0);
    expect(agg.paidOrders).toBe(0);
    expect(agg.byPayment.pix).toBe(0);
  });

  test("IN_PRODUCTION e DELIVERED (pagos) contam", () => {
    const agg = aggregatePlatformOverview([
      order({ status: "IN_PRODUCTION", total: 10, platformFee: 1 }),
      order({ status: "DELIVERED", total: 20, platformFee: 2 }),
    ]);
    expect(agg.gmvTotal).toBe(30);
    expect(agg.feesTotal).toBe(3);
    expect(agg.paidOrders).toBe(2);
  });

  test("quebra por método; 'split' quando não há payment", () => {
    const agg = aggregatePlatformOverview([
      order({ status: "IN_PRODUCTION", total: 10, payment: { method: "CREDIT" } }),
      order({ status: "DELIVERED", total: 5, payment: null, splitShares: [{ id: "s1" }] }),
    ]);
    expect(agg.byPayment.credito).toBe(10);
    expect(agg.byPayment.split).toBe(5);
    expect(agg.byPayment.pix).toBe(0);
  });

  test("agrega por estabelecimento (só o que é pago)", () => {
    const agg = aggregatePlatformOverview([
      order({ establishmentId: "e1", status: "IN_PRODUCTION", total: 10, platformFee: 1 }),
      order({ establishmentId: "e1", status: "DELIVERED", total: 10, platformFee: 1 }),
      order({ establishmentId: "e1", status: "AWAITING_PAYMENT", total: 999, platformFee: 99 }),
      order({ establishmentId: "e2", status: "IN_PRODUCTION", total: 5, platformFee: 0.5 }),
    ]);
    expect(agg.perEst.get("e1")).toEqual({ orders: 2, gmv: 20, fees: 2 });
    expect(agg.perEst.get("e2")).toEqual({ orders: 1, gmv: 5, fees: 0.5 });
  });
});
