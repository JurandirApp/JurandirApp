import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ findUnique: vi.fn(), verify: vi.fn(), createSession: vi.fn() }));

vi.mock("@/i18n/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique: m.findUnique } } }));
vi.mock("@/lib/auth/password", () => ({ verifyPassword: m.verify }));
vi.mock("@/lib/auth/session", () => ({ createSession: m.createSession, destroySession: vi.fn() }));

import { login } from "@/lib/auth/actions";

const user = (role: "ADMIN" | "ESTABLISHMENT" | "WAITER") => ({
  id: "u1", email: "a@b.com", passwordHash: "h", role, establishmentId: role === "ADMIN" ? null : "e1", name: "X",
});

beforeEach(() => {
  vi.clearAllMocks();
  m.verify.mockResolvedValue(true);
});

describe("login (site)", () => {
  it("garçom não entra pelo site: sem sessão e com aviso (evita o laço /login ↔ /painel)", async () => {
    m.findUnique.mockResolvedValue(user("WAITER"));
    const r = await login("a@b.com", "senha123", false);
    expect(r).toEqual({ ok: false, error: "waiterUseApp" });
    expect(m.createSession).not.toHaveBeenCalled();
  });

  it("estabelecimento → /painel; admin → /admin (com sessão)", async () => {
    m.findUnique.mockResolvedValue(user("ESTABLISHMENT"));
    expect(await login("a@b.com", "senha123", false)).toEqual({ ok: true, dest: "/painel" });
    m.findUnique.mockResolvedValue(user("ADMIN"));
    expect(await login("a@b.com", "senha123", false)).toEqual({ ok: true, dest: "/admin" });
    expect(m.createSession).toHaveBeenCalledTimes(2);
  });

  it("senha errada continua 'invalidCredentials' (antes de olhar o papel)", async () => {
    m.findUnique.mockResolvedValue(user("WAITER"));
    m.verify.mockResolvedValue(false);
    expect(await login("a@b.com", "errada", false)).toEqual({ ok: false, error: "invalidCredentials" });
  });
});
