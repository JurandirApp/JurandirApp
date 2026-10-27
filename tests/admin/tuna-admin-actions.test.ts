import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  setTunaMode: vi.fn(),
  setTunaCardsEnabled: vi.fn(),
  getTunaMode: vi.fn(),
  getTunaCardsEnabled: vi.fn(),
  bustTuna: vi.fn(),
  reroute: vi.fn(),
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
  getTunaMode: m.getTunaMode,
  getTunaCardsEnabled: m.getTunaCardsEnabled,
}));
vi.mock("@/lib/payments/tuna", () => ({ bustTunaModeCache: m.bustTuna }));
vi.mock("@/lib/db/tuna", () => ({ rerouteUnreadyTunaBars: m.reroute }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

import { setTunaModeAction, setTunaCardsEnabledAction } from "@/lib/actions/admin";
import type { PaymentEnv } from "@prisma/client";

beforeEach(() => {
  vi.clearAllMocks();
  m.getSession.mockResolvedValue({ role: "ADMIN" });
  m.getTunaMode.mockResolvedValue("TEST");
  m.getTunaCardsEnabled.mockResolvedValue(false);
  m.reroute.mockResolvedValue(0);
});

describe("setTunaModeAction", () => {
  it("admin: grava o modo e invalida o cache da Tuna", async () => {
    await expect(setTunaModeAction("PRODUCTION")).resolves.toEqual({ ok: true, mode: "PRODUCTION", rerouted: 0 });
    expect(m.setTunaMode).toHaveBeenCalledWith("PRODUCTION");
    expect(m.bustTuna).toHaveBeenCalledTimes(1);
    expect(m.revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("modo desconhecido vira TEST", async () => {
    await expect(setTunaModeAction("x" as PaymentEnv)).resolves.toEqual({ ok: true, mode: "TEST", rerouted: 0 });
    expect(m.setTunaMode).toHaveBeenCalledWith("TEST");
  });

  it.each([null, { role: "ESTABLISHMENT" }])("não-admin (%o) → lança antes de gravar", async (s) => {
    m.getSession.mockResolvedValue(s);
    await expect(setTunaModeAction("PRODUCTION")).rejects.toThrow("unauthorized");
    expect(m.setTunaMode).not.toHaveBeenCalled();
    expect(m.bustTuna).not.toHaveBeenCalled();
    expect(m.reroute).not.toHaveBeenCalled();
  });

  it("depois de gravar, devolve pro padrão os bares não prontos no NOVO modo (com a chave atual)", async () => {
    m.getTunaCardsEnabled.mockResolvedValue(true);
    m.reroute.mockResolvedValue(3);
    await expect(setTunaModeAction("PRODUCTION")).resolves.toEqual({ ok: true, mode: "PRODUCTION", rerouted: 3 });
    expect(m.reroute).toHaveBeenCalledWith("PRODUCTION", true);
    expect(m.setTunaMode.mock.invocationCallOrder[0]).toBeLessThan(m.reroute.mock.invocationCallOrder[0]);
    expect(m.getTunaMode).not.toHaveBeenCalled(); // o modo é o que acabou de ser gravado
  });

  it("falha no reroute não desfaz a troca: ok com o modo novo, sem `rerouted`, erro logado", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    m.reroute.mockRejectedValue(new Error("db down"));
    await expect(setTunaModeAction("PRODUCTION")).resolves.toEqual({ ok: true, mode: "PRODUCTION" });
    expect(m.setTunaMode).toHaveBeenCalledWith("PRODUCTION");
    expect(JSON.stringify(err.mock.calls)).toContain("[tuna/reroute]");
    err.mockRestore();
  });
});

describe("setTunaCardsEnabledAction", () => {
  it("admin: liga e desliga (só true liga)", async () => {
    await expect(setTunaCardsEnabledAction(true)).resolves.toEqual({ ok: true, enabled: true, rerouted: 0 });
    expect(m.setTunaCardsEnabled).toHaveBeenLastCalledWith(true);
    await expect(setTunaCardsEnabledAction("true" as unknown as boolean)).resolves.toEqual({
      ok: true,
      enabled: false,
      rerouted: 0,
    });
    expect(m.setTunaCardsEnabled).toHaveBeenLastCalledWith(false);
  });

  it.each([null, { role: "ESTABLISHMENT" }])("não-admin (%o) → lança antes de gravar", async (s) => {
    m.getSession.mockResolvedValue(s);
    await expect(setTunaCardsEnabledAction(true)).rejects.toThrow("unauthorized");
    expect(m.setTunaCardsEnabled).not.toHaveBeenCalled();
    expect(m.reroute).not.toHaveBeenCalled();
  });

  it("desligar: devolve pro padrão os métodos de cartão na Tuna, no modo do BANCO (não o cache)", async () => {
    m.getTunaMode.mockResolvedValue("PRODUCTION");
    m.reroute.mockResolvedValue(2);
    await expect(setTunaCardsEnabledAction(false)).resolves.toEqual({ ok: true, enabled: false, rerouted: 2 });
    expect(m.reroute).toHaveBeenCalledWith("PRODUCTION", false);
    expect(m.setTunaCardsEnabled.mock.invocationCallOrder[0]).toBeLessThan(m.reroute.mock.invocationCallOrder[0]);
  });
});
