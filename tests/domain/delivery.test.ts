import { describe, it, expect } from "vitest";
import { deliveryCode, isOrderFullyDelivered } from "@/lib/domain/delivery";

describe("deliveryCode", () => {
  it("usa os 4 últimos dígitos do telefone, ignorando máscara", () => {
    expect(deliveryCode("(91) 99999-4587", null)).toBe("4587");
  });
  it("cai no fallback quando não há telefone", () => {
    expect(deliveryCode(null, "1234")).toBe("1234");
  });
  it("telefone com menos de 4 dígitos → usa o que tem, zero-pad à esquerda", () => {
    expect(deliveryCode("12", null)).toBe("0012");
  });
});

describe("isOrderFullyDelivered", () => {
  it("true quando toda linha tem qtyDelivered == qty", () => {
    expect(isOrderFullyDelivered([{ qty: 5, qtyDelivered: 5 }, { qty: 1, qtyDelivered: 1 }])).toBe(true);
  });
  it("false quando falta entregar", () => {
    expect(isOrderFullyDelivered([{ qty: 5, qtyDelivered: 3 }])).toBe(false);
  });
  it("false para pedido sem itens (defensivo)", () => {
    expect(isOrderFullyDelivered([])).toBe(false);
  });
});
