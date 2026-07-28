import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password", () => {
  it("faz hash e verifica a senha correta", async () => {
    const hash = await hashPassword("demo1234");
    expect(hash).not.toBe("demo1234");
    expect(await verifyPassword("demo1234", hash)).toBe(true);
  });

  it("rejeita senha errada", async () => {
    const hash = await hashPassword("demo1234");
    expect(await verifyPassword("errada", hash)).toBe(false);
  });
});
