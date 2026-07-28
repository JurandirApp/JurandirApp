import { describe, it, expect } from "vitest";
import { orderToTicket } from "@/lib/print/ticket";

describe("orderToTicket", () => {
  it("mapeia pedido → TicketData com total por item", () => {
    const t = orderToTicket({
      code: "PED-1",
      number: 7,
      locationLabel: "Mesa 3",
      customerName: null,
      note: null,
      createdAt: new Date("2026-07-27T14:32:00"),
      subtotal: 16,
      platformFee: 1.28,
      serviceFee: 1.6,
      total: 18.88,
      items: [{ qty: 2, name: "Coco", unitPrice: 8 }],
      establishment: { name: "Quiosque" },
    });
    expect(t.establishment).toBe("Quiosque");
    expect(t.items[0]).toEqual({ qty: 2, name: "Coco", total: 16 });
    expect(t.total).toBe(18.88);
  });
});
