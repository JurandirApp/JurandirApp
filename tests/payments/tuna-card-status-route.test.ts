import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("@/lib/db/payments", () => ({ resolveTunaCardCharge: m.resolve }));

import { GET } from "@/app/api/public/tuna/card-status/route";

const get = (q: string) => GET(new Request(`https://jurandir.app.br/api/public/tuna/card-status${q}`));

beforeEach(() => vi.clearAllMocks());

describe("GET /api/public/tuna/card-status", () => {
  it("recusada na Tuna (pedido aceita outro cartão) → failed", async () => {
    m.resolve.mockResolvedValue({ kind: "charge", id: "o1" });
    const r = await get("?orderId=o1");
    expect(await r.json()).toEqual({ status: "failed" });
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("pago → paid; pendente/sem cobrança Tuna → pending", async () => {
    m.resolve.mockResolvedValueOnce({ kind: "settled", status: "paid" });
    expect(await (await get("?orderId=o1")).json()).toEqual({ status: "paid" });
    m.resolve.mockResolvedValueOnce({ kind: "settled", status: "pending" });
    expect(await (await get("?orderId=o1")).json()).toEqual({ status: "pending" });
    m.resolve.mockResolvedValueOnce({ kind: "notChargeable" });
    expect(await (await get("?orderId=o1")).json()).toEqual({ status: "pending" });
  });

  it("sem orderId → 422; erro interno → pending (nunca quebra o polling)", async () => {
    expect((await get("")).status).toBe(422);
    m.resolve.mockRejectedValue(new Error("db"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await (await get("?orderId=o1")).json()).toEqual({ status: "pending" });
  });
});
