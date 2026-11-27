import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  authEstablishment: vi.fn(),
  estFindUnique: vi.fn(),
  estUpdate: vi.fn(),
  menuFindMany: vi.fn(),
}));

vi.mock("@/lib/auth/bearer", () => ({ authEstablishment: m.authEstablishment }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    establishment: { findUnique: m.estFindUnique, update: m.estUpdate },
    menuItem: { findMany: m.menuFindMany },
  },
}));

import { GET, POST } from "@/app/api/public/establishment/kitchen/route";
import { assertKitchenAllows } from "@/lib/db/kitchen";
import { KitchenClosedError } from "@/lib/domain/kitchen";

const ROUTE = "https://jurandir.app.br/api/public/establishment/kitchen";
const req = (method: string, body?: unknown) =>
  new Request(ROUTE, {
    method,
    headers: { "content-type": "application/json", authorization: "Bearer x" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// Só domingo 03:00–03:01 → praticamente sempre fechada (testes usam segunda).
const ALMOST_NEVER = [[{ o: "03:00", c: "03:01" }], [], [], [], [], [], []];

beforeEach(() => {
  vi.clearAllMocks();
  m.authEstablishment.mockResolvedValue({ establishmentId: "est1", role: "ESTABLISHMENT" });
  m.menuFindMany.mockResolvedValue([{ category: "Alimentos" }, { category: "Bebidas" }]);
});

describe("GET /api/public/establishment/kitchen", () => {
  it("401 sem token", async () => {
    m.authEstablishment.mockResolvedValue(null);
    expect((await GET(req("GET"))).status).toBe(401);
  });

  it("config vazia → shape do contrato, cozinha aberta", async () => {
    m.estFindUnique.mockResolvedValue({ kitchenHours: null, kitchenCategories: [] });
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      kitchenHours: [[], [], [], [], [], [], []],
      kitchenCategories: [],
      categories: ["Alimentos", "Bebidas"],
      kitchenOpenNow: true,
    });
  });
});

describe("POST /api/public/establishment/kitchen", () => {
  it("normaliza e salva", async () => {
    m.estFindUnique.mockResolvedValue({ kitchenHours: null, kitchenCategories: [] });
    const res = await POST(
      req("POST", {
        kitchenHours: [[], [{ o: "18:00", c: "23:00" }, { o: "x", c: "y" }]],
        kitchenCategories: ["Alimentos", "Alimentos", 3],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.kitchenCategories).toEqual(["Alimentos"]);
    expect(body.kitchenHours).toHaveLength(7);
    expect(body.kitchenHours[1]).toEqual([{ o: "18:00", c: "23:00" }]);
    expect(typeof body.kitchenOpenNow).toBe("boolean");
    expect(m.estUpdate).toHaveBeenCalledWith({
      where: { id: "est1" },
      data: { kitchenHours: body.kitchenHours, kitchenCategories: ["Alimentos"] },
    });
  });

  it("422 com tipos errados", async () => {
    const res = await POST(req("POST", { kitchenHours: "x", kitchenCategories: [] }));
    expect(res.status).toBe(422);
    expect(m.estUpdate).not.toHaveBeenCalled();
  });
});

describe("assertKitchenAllows", () => {
  const items = [{ name: "Isca de Peixe", menuItemId: null }];

  it("sem config nunca bloqueia nem consulta o cardápio", async () => {
    await expect(assertKitchenAllows({ id: "est1" }, items)).resolves.toBeUndefined();
    expect(m.menuFindMany).not.toHaveBeenCalled();
  });

  it("cozinha fechada + item da cozinha → KitchenClosedError", async () => {
    m.menuFindMany.mockResolvedValue([{ id: "m1", name: "Isca de Peixe" }]);
    const est = { id: "est1", kitchenHours: ALMOST_NEVER, kitchenCategories: ["Alimentos"] };
    const monday = new Date("2026-11-30T15:00:00Z");
    await expect(assertKitchenAllows(est, items, monday)).rejects.toBeInstanceOf(KitchenClosedError);
    // Só bebida → passa.
    await expect(
      assertKitchenAllows(est, [{ name: "Caipirinha" }], monday),
    ).resolves.toBeUndefined();
  });

  it("cozinha aberta → passa", async () => {
    const est = {
      id: "est1",
      kitchenHours: [[], [{ o: "10:00", c: "20:00" }], [], [], [], [], []],
      kitchenCategories: ["Alimentos"],
    };
    await expect(
      assertKitchenAllows(est, items, new Date("2026-11-30T15:00:00Z")), // seg 12:00 SP
    ).resolves.toBeUndefined();
  });
});
