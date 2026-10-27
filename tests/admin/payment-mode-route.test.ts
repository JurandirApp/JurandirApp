import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  authAdmin: vi.fn(),
  getAppSettings: vi.fn(),
  setPagbankMode: vi.fn(),
  setPagarmeMode: vi.fn(),
  setTunaMode: vi.fn(),
  getTunaCardsEnabled: vi.fn(),
  reroute: vi.fn(),
  bustPagbank: vi.fn(),
  bustPagarme: vi.fn(),
  bustTuna: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/bearer", () => ({ authAdmin: m.authAdmin }));
vi.mock("@/lib/db/settings", () => ({
  getAppSettings: m.getAppSettings,
  setPagbankMode: m.setPagbankMode,
  setPagarmeMode: m.setPagarmeMode,
  setTunaMode: m.setTunaMode,
  getTunaCardsEnabled: m.getTunaCardsEnabled,
}));
vi.mock("@/lib/db/tuna", () => ({ rerouteUnreadyTunaBars: m.reroute }));
vi.mock("@/lib/payments/pagbank", () => ({ bustPagbankModeCache: m.bustPagbank }));
vi.mock("@/lib/payments/pagarme", () => ({ bustPagarmeModeCache: m.bustPagarme }));
vi.mock("@/lib/payments/tuna", () => ({ bustTunaModeCache: m.bustTuna }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

import { GET, POST } from "@/app/api/public/admin/payment-mode/route";

const ROUTE = "https://jurandir.app.br/api/public/admin/payment-mode";
const post = (body: unknown) =>
  new Request(ROUTE, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer x" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  m.authAdmin.mockResolvedValue({ role: "ADMIN" });
  m.getAppSettings.mockResolvedValue({
    pagbankMode: "TEST",
    pagarmeMode: "PRODUCTION",
    tunaMode: "TEST",
  });
  m.getTunaCardsEnabled.mockResolvedValue(true);
  m.reroute.mockResolvedValue(0);
});

describe("GET /api/public/admin/payment-mode", () => {
  // O app publicado lê pagbankMode/pagarmeMode: o tunaMode só se soma a eles.
  it("devolve o modo da Tuna junto dos outros (pagbank/pagarme continuam)", async () => {
    const res = await GET(new Request(ROUTE));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      pagbankMode: "TEST",
      pagarmeMode: "PRODUCTION",
      tunaMode: "TEST",
    });
  });

  it("sem admin → 401", async () => {
    m.authAdmin.mockResolvedValue(null);
    const res = await GET(new Request(ROUTE));
    expect(res.status).toBe(401);
    expect(m.getAppSettings).not.toHaveBeenCalled();
  });
});

describe("POST /api/public/admin/payment-mode", () => {
  it("gateway tuna → grava o modo e invalida só o cache da Tuna", async () => {
    m.reroute.mockResolvedValue(2);
    const res = await POST(post({ gateway: "tuna", mode: "PRODUCTION" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, mode: "PRODUCTION", rerouted: 2 });
    // Bares não prontos no novo modo voltam pro padrão (com a chave dos cartões atual).
    expect(m.reroute).toHaveBeenCalledWith("PRODUCTION", true);
    expect(m.setTunaMode.mock.invocationCallOrder[0]).toBeLessThan(m.reroute.mock.invocationCallOrder[0]);
    expect(m.setTunaMode).toHaveBeenCalledWith("PRODUCTION");
    expect(m.bustTuna).toHaveBeenCalledTimes(1);
    expect(m.setPagbankMode).not.toHaveBeenCalled();
    expect(m.setPagarmeMode).not.toHaveBeenCalled();
    expect(m.bustPagbank).not.toHaveBeenCalled();
    expect(m.bustPagarme).not.toHaveBeenCalled();
    expect(m.revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it.each([
    ["pagbank", "setPagbankMode", "bustPagbank"],
    ["pagarme", "setPagarmeMode", "bustPagarme"],
  ] as const)("gateway %s continua invalidando só o próprio cache", async (gateway, setter, bust) => {
    const res = await POST(post({ gateway, mode: "PRODUCTION" }));
    expect(await res.json()).toEqual({ ok: true, mode: "PRODUCTION" });
    expect(m[setter]).toHaveBeenCalledWith("PRODUCTION");
    expect(m[bust]).toHaveBeenCalledTimes(1);
    const others = (["bustPagbank", "bustPagarme", "bustTuna"] as const).filter((b) => b !== bust);
    for (const b of others) expect(m[b]).not.toHaveBeenCalled();
    expect(m.setTunaMode).not.toHaveBeenCalled();
    expect(m.reroute).not.toHaveBeenCalled(); // resposta igual à de antes
  });

  it("gateway tuna: falha no reroute não derruba a troca (200 sem `rerouted`)", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    m.reroute.mockRejectedValue(new Error("db down"));
    const res = await POST(post({ gateway: "tuna", mode: "TEST" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, mode: "TEST" });
    err.mockRestore();
  });

  it("modo desconhecido vira TEST", async () => {
    const res = await POST(post({ gateway: "tuna", mode: "prod" }));
    expect(await res.json()).toEqual({ ok: true, mode: "TEST", rerouted: 0 });
    expect(m.setTunaMode).toHaveBeenCalledWith("TEST");
  });

  it("sem admin → 401 e não grava nada", async () => {
    m.authAdmin.mockResolvedValue(null);
    const res = await POST(post({ gateway: "tuna", mode: "PRODUCTION" }));
    expect(res.status).toBe(401);
    expect(m.setTunaMode).not.toHaveBeenCalled();
    expect(m.bustTuna).not.toHaveBeenCalled();
    expect(m.reroute).not.toHaveBeenCalled();
  });

  it("gateway desconhecido → 400", async () => {
    const res = await POST(post({ gateway: "appmax", mode: "PRODUCTION" }));
    expect(res.status).toBe(400);
    expect(m.setTunaMode).not.toHaveBeenCalled();
  });
});
