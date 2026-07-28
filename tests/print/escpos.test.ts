import { describe, it, expect } from "vitest";
import { renderTicket, type TicketData } from "@/lib/print/escpos";

const t: TicketData = {
  establishment: "Quiosque do Mar",
  code: "PED-ABC123",
  number: 42,
  location: "Guarda-sol 14",
  customer: "João",
  timeLabel: "14:32",
  items: [{ qty: 2, name: "Água de coco", total: 16 }],
  subtotal: 16,
  platformFee: 1.28,
  serviceFee: 1.6,
  total: 18.88,
  note: "sem gelo",
};

describe("renderTicket", () => {
  it("começa com init ESC @ e termina com corte GS V 0", () => {
    const b = renderTicket(t);
    expect([b[0], b[1]]).toEqual([0x1b, 0x40]);
    expect(Array.from(b.slice(-3))).toEqual([0x1d, 0x56, 0x00]);
  });
  it("contém o código do pedido e normaliza acentos (Agua, não Água)", () => {
    const s = Buffer.from(renderTicket(t)).toString("latin1");
    expect(s).toContain("PED-ABC123");
    expect(s).toContain("Agua de coco");
    expect(s).not.toContain("Água");
  });
});
