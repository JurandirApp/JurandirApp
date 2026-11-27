import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ auth: vi.fn(), set: vi.fn() }));
vi.mock("@/lib/auth/bearer", () => ({ authEstablishment: m.auth }));
vi.mock("@/lib/db/establishments", () => ({ setWaiterModuleEnabled: m.set }));

import { POST } from "@/app/api/public/establishment/waiter-module/route";

const req = (body: unknown) =>
  new Request("http://x/api/public/establishment/waiter-module", {
    method: "POST",
    headers: { Authorization: "Bearer t" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("POST /api/public/establishment/waiter-module", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sem sessão de estabelecimento → 401", async () => {
    m.auth.mockResolvedValue(null);
    const r = await POST(req({ enabled: true }));
    expect(r.status).toBe(401);
    expect(m.set).not.toHaveBeenCalled();
  });

  it("enabled não-booleano → 422", async () => {
    m.auth.mockResolvedValue({ role: "ESTABLISHMENT", establishmentId: "e1" });
    const r = await POST(req({ enabled: "sim" }));
    expect(r.status).toBe(422);
  });

  it("liga só o PRÓPRIO bar e devolve { ok, enabled }", async () => {
    m.auth.mockResolvedValue({ role: "ESTABLISHMENT", establishmentId: "e1" });
    m.set.mockResolvedValue(false);
    const r = await POST(req({ enabled: false }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, enabled: false });
    expect(m.set).toHaveBeenCalledWith("e1", false);
  });
});
