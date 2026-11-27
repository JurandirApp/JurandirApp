import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ auth: vi.fn(), batch: vi.fn() }));
vi.mock("@/lib/auth/bearer", () => ({ authEstablishment: m.auth }));
vi.mock("@/lib/db/qr", () => ({ createQrSpotsBatch: m.batch }));

import { POST } from "@/app/api/public/establishment/spots/batch/route";

const req = (body: unknown) =>
  new Request("http://x/api/public/establishment/spots/batch", {
    method: "POST",
    headers: { Authorization: "Bearer t" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("POST /api/public/establishment/spots/batch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sem sessão de estabelecimento → 401", async () => {
    m.auth.mockResolvedValue(null);
    const r = await POST(req({ labels: ["Mesa 1"] }));
    expect(r.status).toBe(401);
    expect(m.batch).not.toHaveBeenCalled();
  });

  it.each([
    ["JSON inválido", "{"],
    ["sem labels", {}],
    ["labels não-array", { labels: "Mesa 1" }],
    ["lista vazia", { labels: [" "] }],
    ["item não-string", { labels: ["Mesa 1", 2] }],
    ["acima de 200", { labels: Array.from({ length: 201 }, (_, i) => `M${i}`) }],
  ])("%s → 422", async (_n, body) => {
    m.auth.mockResolvedValue({ role: "ESTABLISHMENT", establishmentId: "e1" });
    const r = await POST(req(body));
    expect(r.status).toBe(422);
    expect(m.batch).not.toHaveBeenCalled();
  });

  it("cria no PRÓPRIO bar e devolve { ok, created, skipped, spots }", async () => {
    m.auth.mockResolvedValue({ role: "ESTABLISHMENT", establishmentId: "e1" });
    m.batch.mockResolvedValue({
      created: 1,
      skipped: 1,
      spots: [
        { id: "a", label: "Mesa 1" },
        { id: "b", label: "Mesa 2" },
      ],
    });
    const r = await POST(req({ labels: [" Mesa 1", "Mesa 2 "] }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, created: 1, skipped: 1, spots: ["Mesa 1", "Mesa 2"] });
    expect(m.batch).toHaveBeenCalledWith("e1", ["Mesa 1", "Mesa 2"]);
  });
});
