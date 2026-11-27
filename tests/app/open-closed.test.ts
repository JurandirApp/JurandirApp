import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ estFind: vi.fn(), orderFind: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    establishment: { findUnique: m.estFind },
    order: { findUnique: m.orderFind },
  },
}));
vi.mock("@/lib/db/print", () => ({ enqueuePrintJob: vi.fn() }));

import { toOpenFields } from "@/lib/app/adapters";
import { createOrder, isClosedError } from "@/lib/db/orders";

// 2026-11-27 (sexta) 20:00Z = 17:00 em SP.
const NOW = new Date("2026-11-27T20:00:00Z");
const FRI_18 = [[], [], [], [], [], [{ o: "18:00", c: "23:00" }], []];

const body = {
  establishmentId: "e1",
  locationLabel: "Mesa 1",
  items: [{ name: "Chope", qty: 1, unitPrice: 10 }],
  payment: { kind: "full", method: "PIX", installments: 1 },
};

describe("toOpenFields (contrato openNow/nextOpenLabel)", () => {
  it("fechado com horário → openNow false + nextOpenLabel", () => {
    expect(toOpenFields(FRI_18, NOW)).toEqual({ openNow: false, nextOpenLabel: "Abre hoje às 18:00" });
  });
  it("aberto → só openNow true (sem nextOpenLabel)", () => {
    expect(toOpenFields(FRI_18, new Date("2026-11-27T22:00:00Z"))).toEqual({ openNow: true });
  });
  it("sem horário → openNow true", () => {
    expect(toOpenFields(null, NOW)).toEqual({ openNow: true });
  });
});

describe("criação de pedido com bar fechado", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
  });

  it("bar fechado NÃO bloqueia mais: createOrder segue pra criação", async () => {
    m.estFind.mockResolvedValue({ id: "e1", weeklyHours: FRI_18, platformFeePct: 8, serviceFeePct: 0 });
    m.orderFind.mockRejectedValue(new Error("passou do guard"));
    const err = await createOrder(body as never).catch((e) => e);
    expect(isClosedError(err)).toBe(false);
    expect((err as Error).message).toBe("passou do guard");
    vi.useRealTimers();
  });

  it("sem horário configurado não bloqueia (segue pra criação)", async () => {
    m.estFind.mockResolvedValue({ id: "e1", weeklyHours: null, platformFeePct: 8, serviceFeePct: 0 });
    m.orderFind.mockRejectedValue(new Error("passou do guard"));
    const err = await createOrder(body as never).catch((e) => e);
    expect(isClosedError(err)).toBe(false);
    expect((err as Error).message).toBe("passou do guard");
    vi.useRealTimers();
  });
});
