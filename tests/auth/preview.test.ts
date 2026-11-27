import { describe, it, expect } from "vitest";
import { canPreview, isStaffOf, wantsPreview } from "@/lib/auth/preview";
import type { SessionPayload } from "@/lib/auth/jwt";

const s = (role: SessionPayload["role"], establishmentId: string | null): SessionPayload => ({
  sub: "u1",
  role,
  establishmentId,
  name: "x",
});

describe("canPreview (?preview=1)", () => {
  it("só o próprio estabelecimento ou ADMIN", () => {
    expect(canPreview(s("ESTABLISHMENT", "e1"), "e1")).toBe(true);
    expect(canPreview(s("ADMIN", null), "e1")).toBe(true);
  });
  it("cliente anônimo, outro bar ou garçom → página normal", () => {
    expect(canPreview(null, "e1")).toBe(false);
    expect(canPreview(s("ESTABLISHMENT", "e2"), "e1")).toBe(false);
    expect(canPreview(s("ESTABLISHMENT", null), "e1")).toBe(false);
    expect(canPreview(s("WAITER", "e1"), "e1")).toBe(false);
  });
});

describe("isStaffOf (guarda das actions de pedido do site)", () => {
  it("estabelecimento/garçom DESTE bar", () => {
    expect(isStaffOf(s("ESTABLISHMENT", "e1"), "e1")).toBe(true);
    expect(isStaffOf(s("WAITER", "e1"), "e1")).toBe(true);
  });
  it("sem sessão, outro bar ou ADMIN → não barra", () => {
    expect(isStaffOf(null, "e1")).toBe(false);
    expect(isStaffOf(s("ESTABLISHMENT", "e2"), "e1")).toBe(false);
    expect(isStaffOf(s("WAITER", null), "e1")).toBe(false);
    expect(isStaffOf(s("ADMIN", null), "e1")).toBe(false);
  });
});

describe("wantsPreview", () => {
  it("só o valor exato 1", () => {
    expect(wantsPreview("1")).toBe(true);
    expect(wantsPreview("true")).toBe(false);
    expect(wantsPreview(undefined)).toBe(false);
    expect(wantsPreview(["1"])).toBe(false);
  });
});
