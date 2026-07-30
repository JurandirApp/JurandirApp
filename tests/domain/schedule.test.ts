import { describe, it, expect } from "vitest";
import {
  normalizeWeekly,
  isOpenAt,
  formatWeekly,
  deriveDayStartHour,
  isOvernight,
  type WeekSchedule,
} from "@/lib/domain/schedule";

const emptyWeek = (): WeekSchedule => [[], [], [], [], [], [], []];
const PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const fmt = (w: WeekSchedule) => formatWeekly(w, { labels: PT, and: "e", allClosed: "Fechado" });

describe("normalizeWeekly", () => {
  it("converte o shape antigo ({o,c} | null) pro novo", () => {
    const r = normalizeWeekly([null, { o: "18:00", c: "23:00" }, null, null, null, null, null]);
    expect(r).toHaveLength(7);
    expect(r[0]).toEqual([]); // null → fechado
    expect(r[1]).toEqual([{ o: "18:00", c: "23:00" }]); // {o,c} → [{o,c}]
  });

  it("aceita o novo shape, descarta janelas inválidas e limita a 2/dia", () => {
    const r = normalizeWeekly([
      [{ o: "12:00", c: "15:00" }, { o: "18:00", c: "23:00" }, { o: "01:00", c: "02:00" }],
      [{ o: "xx", c: "23:00" }, { o: "18:00", c: "yy" }],
      "lixo",
    ]);
    expect(r[0]).toHaveLength(2); // corta a 3ª janela
    expect(r[1]).toEqual([]); // ambas inválidas
    expect(r[2]).toEqual([]); // não-array → fechado
  });

  it("normaliza a hora pra HH:MM (zero à esquerda) e sempre devolve 7 dias", () => {
    const r = normalizeWeekly([[{ o: "9:05", c: "20:00" }]]);
    expect(r).toHaveLength(7);
    expect(r[0]).toEqual([{ o: "09:05", c: "20:00" }]);
    expect(r[6]).toEqual([]);
  });
});

describe("isOvernight", () => {
  it("fecha antes/na hora de abrir = madrugada; 00:00 = meia-noite (não é)", () => {
    expect(isOvernight({ o: "18:00", c: "06:00" })).toBe(true);
    expect(isOvernight({ o: "18:00", c: "23:00" })).toBe(false);
    expect(isOvernight({ o: "18:00", c: "00:00" })).toBe(false);
  });
});

describe("isOpenAt", () => {
  it("dois turnos no mesmo dia: aberto no almoço, fechado no meio, aberto no jantar", () => {
    const base = new Date(2026, 0, 15, 0, 0);
    const idx = base.getDay();
    const week = emptyWeek();
    week[idx] = [{ o: "12:00", c: "15:00" }, { o: "18:00", c: "23:00" }];
    expect(isOpenAt(week, new Date(2026, 0, 15, 14, 0))).toBe(true); // almoço
    expect(isOpenAt(week, new Date(2026, 0, 15, 16, 0))).toBe(false); // intervalo
    expect(isOpenAt(week, new Date(2026, 0, 15, 20, 0))).toBe(true); // jantar
    expect(isOpenAt(week, new Date(2026, 0, 15, 23, 30))).toBe(false); // já fechou
  });

  it("madrugada: aberto de manhã cedo herdado da janela de ontem", () => {
    const sat = new Date(2026, 0, 17, 2, 0); // 2h da manhã
    const satIdx = sat.getDay();
    const friIdx = (satIdx + 6) % 7;
    const week = emptyWeek();
    week[friIdx] = [{ o: "18:00", c: "06:00" }];
    expect(isOpenAt(week, sat)).toBe(true); // 2h < 6h → ainda aberto
    expect(isOpenAt(week, new Date(2026, 0, 17, 7, 0))).toBe(false); // já fechou às 6h
  });

  it("fecha às 00:00 = aberto até a meia-noite, não avança pro dia seguinte", () => {
    const base = new Date(2026, 0, 15, 0, 0);
    const idx = base.getDay();
    const week = emptyWeek();
    week[idx] = [{ o: "18:00", c: "00:00" }];
    expect(isOpenAt(week, new Date(2026, 0, 15, 23, 59))).toBe(true);
    const nextIdx = (idx + 1) % 7;
    // 00:30 do dia seguinte (que herdaria de `idx`) → fechado.
    expect(week[nextIdx]).toEqual([]);
    expect(isOpenAt(week, new Date(2026, 0, 16, 0, 30))).toBe(false);
  });

  it("dia fechado (sem janelas) → nunca aberto", () => {
    expect(isOpenAt(emptyWeek(), new Date(2026, 0, 15, 20, 0))).toBe(false);
  });
});

describe("formatWeekly", () => {
  it("agrupa dias iguais, omite fechados (exemplo do bar)", () => {
    const week = emptyWeek();
    // Seg(1) fechado; Ter–Qui(2-4) 18–23; Sex(5) 18–6; Sáb(6) 14–4; Dom(0) fechado.
    week[2] = week[3] = week[4] = [{ o: "18:00", c: "23:00" }];
    week[5] = [{ o: "18:00", c: "06:00" }];
    week[6] = [{ o: "14:00", c: "04:00" }];
    expect(fmt(week)).toBe("Ter–Qui 18h–23h · Sex 18h–6h · Sáb 14h–4h");
  });

  it("dois turnos no mesmo dia usam a conjunção", () => {
    const week = emptyWeek();
    week[6] = [{ o: "12:00", c: "15:00" }, { o: "18:00", c: "23:30" }];
    expect(fmt(week)).toBe("Sáb 12h–15h e 18h–23h30");
  });

  it("semana toda fechada → texto de fechado", () => {
    expect(fmt(emptyWeek())).toBe("Fechado");
  });
});

describe("deriveDayStartHour", () => {
  it("pega o fechamento de madrugada mais tarde (Sex 6h, Sáb 4h → 6)", () => {
    const week = emptyWeek();
    week[5] = [{ o: "18:00", c: "06:00" }];
    week[6] = [{ o: "14:00", c: "04:00" }];
    expect(deriveDayStartHour(week)).toBe(6);
  });

  it("sem madrugada → 0 (dia normal do calendário)", () => {
    const week = emptyWeek();
    week[1] = [{ o: "09:00", c: "20:00" }];
    week[2] = [{ o: "18:00", c: "00:00" }]; // fecha à meia-noite, não conta
    expect(deriveDayStartHour(week)).toBe(0);
  });

  it("arredonda os minutos pra cima (fecha 04:30 → 5)", () => {
    const week = emptyWeek();
    week[6] = [{ o: "20:00", c: "04:30" }];
    expect(deriveDayStartHour(week)).toBe(5);
  });
});
