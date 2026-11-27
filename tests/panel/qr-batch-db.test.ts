import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ findMany: vi.fn(), createMany: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { qrSpot: { findMany: m.findMany, createMany: m.createMany } },
}));

import { createQrSpotsBatch } from "@/lib/db/qr";

describe("createQrSpotsBatch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cria só os novos, com skipDuplicates e escopo do bar; conta os pulados", async () => {
    m.findMany
      .mockResolvedValueOnce([{ label: "Mesa 1" }]) // já cadastrados
      .mockResolvedValueOnce([
        { id: "a", label: "Mesa 1" },
        { id: "b", label: "Mesa 2" },
        { id: "c", label: "Mesa 3" },
      ]);
    m.createMany.mockResolvedValue({ count: 2 });
    const r = await createQrSpotsBatch("e1", ["mesa 1", "Mesa 2", "Mesa 3", "Mesa 3"]);
    expect(r.created).toBe(2);
    expect(r.skipped).toBe(2);
    expect(r.spots.map((s) => s.label)).toEqual(["Mesa 1", "Mesa 2", "Mesa 3"]);
    const arg = m.createMany.mock.calls[0][0];
    expect(arg.skipDuplicates).toBe(true);
    expect(arg.data.map((d: { label: string }) => d.label)).toEqual(["Mesa 2", "Mesa 3"]);
    expect(arg.data.every((d: { establishmentId: string }) => d.establishmentId === "e1")).toBe(true);
    // createdAt crescente → a lista mantém a ordem digitada
    expect(arg.data[1].createdAt.getTime()).toBeGreaterThan(arg.data[0].createdAt.getTime());
  });

  it("nada novo → não chama createMany", async () => {
    m.findMany.mockResolvedValueOnce([{ label: "Mesa 1" }]).mockResolvedValueOnce([{ id: "a", label: "Mesa 1" }]);
    const r = await createQrSpotsBatch("e1", ["MESA 1"]);
    expect(m.createMany).not.toHaveBeenCalled();
    expect(r).toMatchObject({ created: 0, skipped: 1 });
  });
});
