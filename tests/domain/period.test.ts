import { describe, it, expect } from "vitest";
import { periodRange, clampHour } from "@/lib/domain/period";

const U = Date.UTC;

describe("periodRange (fuso Brasília UTC-3 + início do dia)", () => {
  it("hoje = dia do calendário quando dayStart=0", () => {
    const now = U(2026, 6, 15, 15, 0, 0); // BR 2026-07-15 12:00
    const { from, to } = periodRange({ kind: "hoje" }, 0, now);
    expect(from.getTime()).toBe(U(2026, 6, 15, 3, 0, 0)); // BR 07-15 00:00
    expect(to.getTime()).toBe(U(2026, 6, 16, 3, 0, 0)); // BR 07-16 00:00
  });

  it("hoje respeita o início do dia no turno da madrugada (dayStart=12)", () => {
    const now = U(2026, 6, 16, 5, 0, 0); // BR 2026-07-16 02:00 (madrugada)
    const { from, to } = periodRange({ kind: "hoje" }, 12, now);
    // O pedido das 2h pertence ao dia operacional que começou ONTEM ao meio-dia.
    expect(from.getTime()).toBe(U(2026, 6, 15, 15, 0, 0)); // BR 07-15 12:00
    expect(to.getTime()).toBe(U(2026, 6, 16, 15, 0, 0)); // BR 07-16 12:00
  });

  it("ontem", () => {
    const now = U(2026, 6, 15, 15, 0, 0);
    const { from, to } = periodRange({ kind: "ontem" }, 0, now);
    expect(from.getTime()).toBe(U(2026, 6, 14, 3, 0, 0));
    expect(to.getTime()).toBe(U(2026, 6, 15, 3, 0, 0));
  });

  it("últimos 7 dias inclui o dia de hoje", () => {
    const now = U(2026, 6, 15, 15, 0, 0);
    const { from, to } = periodRange({ kind: "d7" }, 0, now);
    expect(from.getTime()).toBe(U(2026, 6, 9, 3, 0, 0)); // 15 − 6
    expect(to.getTime()).toBe(U(2026, 6, 16, 3, 0, 0));
  });

  it("período custom é inclusivo nas duas datas", () => {
    const now = U(2026, 6, 15, 15, 0, 0);
    const { from, to } = periodRange(
      { kind: "custom", from: "2026-07-10", to: "2026-07-12" },
      0,
      now,
    );
    expect(from.getTime()).toBe(U(2026, 6, 10, 3, 0, 0));
    expect(to.getTime()).toBe(U(2026, 6, 13, 3, 0, 0)); // 12 + 1 dia
  });

  it("clampHour limita 0..23", () => {
    expect(clampHour(-5)).toBe(0);
    expect(clampHour(30)).toBe(23);
    expect(clampHour(12)).toBe(12);
  });
});
