import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  setTunaMode: vi.fn(),
  setTunaCardsEnabled: vi.fn(),
  bustTuna: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: m.getSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/db/settings", () => ({
  getPagbankMode: vi.fn(),
  setPagbankMode: vi.fn(),
  getPagarmeMode: vi.fn(),
  setPagarmeMode: vi.fn(),
  setPagbankDebitEnabled: vi.fn(),
  setTunaMode: m.setTunaMode,
  setTunaCardsEnabled: m.setTunaCardsEnabled,
}));
vi.mock("@/lib/payments/tuna", () => ({ bustTunaModeCache: m.bustTuna }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

import { setTunaModeAction, setTunaCardsEnabledAction } from "@/lib/actions/admin";
import type { PaymentEnv } from "@prisma/client";

beforeEach(() => {
  vi.clearAllMocks();
  m.getSession.mockResolvedValue({ role: "ADMIN" });
});

describe("setTunaModeAction", () => {
  it("admin: grava o modo e invalida o cache da Tuna", async () => {
    await expect(setTunaModeAction("PRODUCTION")).resolves.toEqual({ ok: true, mode: "PRODUCTION" });
    expect(m.setTunaMode).toHaveBeenCalledWith("PRODUCTION");
    expect(m.bustTuna).toHaveBeenCalledTimes(1);
    expect(m.revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("modo desconhecido vira TEST", async () => {
    await expect(setTunaModeAction("x" as PaymentEnv)).resolves.toEqual({ ok: true, mode: "TEST" });
    expect(m.setTunaMode).toHaveBeenCalledWith("TEST");
  });

  it.each([null, { role: "ESTABLISHMENT" }])("não-admin (%o) → lança antes de gravar", async (s) => {
    m.getSession.mockResolvedValue(s);
    await expect(setTunaModeAction("PRODUCTION")).rejects.toThrow("unauthorized");
    expect(m.setTunaMode).not.toHaveBeenCalled();
    expect(m.bustTuna).not.toHaveBeenCalled();
  });
});

describe("setTunaCardsEnabledAction", () => {
  it("admin: liga e desliga (só true liga)", async () => {
    await expect(setTunaCardsEnabledAction(true)).resolves.toEqual({ ok: true, enabled: true });
    expect(m.setTunaCardsEnabled).toHaveBeenLastCalledWith(true);
    await expect(setTunaCardsEnabledAction("true" as unknown as boolean)).resolves.toEqual({
      ok: true,
      enabled: false,
    });
    expect(m.setTunaCardsEnabled).toHaveBeenLastCalledWith(false);
  });

  it.each([null, { role: "ESTABLISHMENT" }])("não-admin (%o) → lança antes de gravar", async (s) => {
    m.getSession.mockResolvedValue(s);
    await expect(setTunaCardsEnabledAction(true)).rejects.toThrow("unauthorized");
    expect(m.setTunaCardsEnabled).not.toHaveBeenCalled();
  });
});
