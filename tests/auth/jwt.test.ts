import { describe, it, expect, beforeAll } from "vitest";
import { signSession, verifySession, destForRole } from "@/lib/auth/jwt";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-1234";
});

describe("session sign/verify", () => {
  it("faz round-trip do payload", async () => {
    const token = await signSession({
      sub: "u1",
      role: "ADMIN",
      establishmentId: null,
      name: "Admin",
    });
    const p = await verifySession(token);
    expect(p?.sub).toBe("u1");
    expect(p?.role).toBe("ADMIN");
    expect(p?.establishmentId).toBeNull();
    expect(p?.name).toBe("Admin");
  });

  it("retorna null para token adulterado", async () => {
    const token = await signSession({
      sub: "u1",
      role: "ESTABLISHMENT",
      establishmentId: "e1",
      name: "Quiosque",
    });
    expect(await verifySession(token + "x")).toBeNull();
  });

  it("retorna null para lixo", async () => {
    expect(await verifySession("not-a-jwt")).toBeNull();
  });
});

describe("destForRole", () => {
  it("mapeia role -> destino", () => {
    expect(destForRole("ADMIN")).toBe("/admin");
    expect(destForRole("ESTABLISHMENT")).toBe("/painel");
  });
});
