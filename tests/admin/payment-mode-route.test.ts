import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  authAdmin: vi.fn(),
  getAppSettings: vi.fn(),
  setPagbankMode: vi.fn(),
  setPagarmeMode: vi.fn(),
  setTunaMode: vi.fn(),
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
}));
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
});

describe("GET /api/public/admin/payment-mode", () => {
  it("devolve o modo da Tuna junto dos outros", async () => {
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
    const res = await POST(post({ gateway: "tuna", mode: "PRODUCTION" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, mode: "PRODUCTION" });
    expect(m.setTunaMode).toHaveBeenCalledWith("PRODUCTION");
    expect(m.bustTuna).toHaveBeenCalledTimes(1);
    expect(m.setPagbankMode).not.toHaveBeenCalled();
    expect(m.setPagarmeMode).not.toHaveBeenCalled();
    expect(m.bustPagbank).not.toHaveBeenCalled();
    expect(m.bustPagarme).not.toHaveBeenCalled();
    expect(m.revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("modo desconhecido vira TEST", async () => {
    const res = await POST(post({ gateway: "tuna", mode: "prod" }));
    expect(await res.json()).toEqual({ ok: true, mode: "TEST" });
    expect(m.setTunaMode).toHaveBeenCalledWith("TEST");
  });

  it("sem admin → 401 e não grava nada", async () => {
    m.authAdmin.mockResolvedValue(null);
    const res = await POST(post({ gateway: "tuna", mode: "PRODUCTION" }));
    expect(res.status).toBe(401);
    expect(m.setTunaMode).not.toHaveBeenCalled();
    expect(m.bustTuna).not.toHaveBeenCalled();
  });

  it("gateway desconhecido → 400", async () => {
    const res = await POST(post({ gateway: "appmax", mode: "PRODUCTION" }));
    expect(res.status).toBe(400);
    expect(m.setTunaMode).not.toHaveBeenCalled();
  });
});
