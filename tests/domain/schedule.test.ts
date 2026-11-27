import { describe, it, expect } from "vitest";
import {
  normalizeWeekly,
  isOpenAt,
  formatWeekly,
  deriveDayStartHour,
  isOvernight,
  openStatus,
  localDayMinutes,
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

describe("openStatus (fuso America/Sao_Paulo)", () => {
  // 2026-11-27 é sexta. SP = UTC-3 → 20:00Z = 17:00 em SP.
  const at = (iso: string) => new Date(iso);
  const week = (): WeekSchedule => {
    const w = emptyWeek();
    w[5] = [{ o: "18:00", c: "02:00" }]; // sex 18h → sáb 2h
    w[6] = [{ o: "12:00", c: "15:00" }, { o: "18:00", c: "23:00" }]; // sáb
    return w;
  };

  it("sem horário configurado → aberto (nunca bloqueia)", () => {
    expect(openStatus(null, at("2026-11-27T20:00:00Z"))).toEqual({ configured: false, openNow: true });
    expect(openStatus(emptyWeek(), at("2026-11-27T20:00:00Z")).openNow).toBe(true);
  });

  it("fechado antes de abrir hoje → 'Abre hoje às 18:00'", () => {
    const r = openStatus(week(), at("2026-11-27T20:00:00Z")); // sex 17:00 SP
    expect(r).toEqual({ configured: true, openNow: false, nextOpenLabel: "Abre hoje às 18:00" });
  });

  it("usa o fuso de SP, não o do servidor", () => {
    // 21:30Z = 18:30 SP (aberto); em UTC seria 21:30 de sexta, também aberto,
    // mas 23:00Z de quinta = 20:00 SP de quinta (fechado).
    expect(openStatus(week(), at("2026-11-27T21:30:00Z")).openNow).toBe(true);
    expect(openStatus(week(), at("2026-11-26T23:00:00Z")).openNow).toBe(false);
  });

  it("madrugada de sábado ainda aberto pela janela de sexta", () => {
    expect(openStatus(week(), at("2026-11-28T04:30:00Z")).openNow).toBe(true); // sáb 01:30 SP
  });

  it("entre turnos → próxima janela do mesmo dia; depois do último → amanhã/dia da semana", () => {
    expect(openStatus(week(), at("2026-11-28T19:00:00Z")).nextOpenLabel).toBe("Abre hoje às 18:00"); // sáb 16h
    expect(openStatus(week(), at("2026-11-27T13:00:00Z")).nextOpenLabel).toBe("Abre hoje às 18:00"); // sex 10h
    // quinta 20h SP → abre amanhã (sexta) às 18:00
    expect(openStatus(week(), at("2026-11-26T23:00:00Z")).nextOpenLabel).toBe("Abre amanhã às 18:00");
    // sáb 23:30 SP → próxima é sexta que vem
    expect(openStatus(week(), at("2026-11-29T02:30:00Z")).nextOpenLabel).toBe("Abre sexta às 18:00");
  });

  it("rótulo em en/es (?lang=), padrão pt", () => {
    const fri17 = at("2026-11-27T20:00:00Z");
    const thu20 = at("2026-11-26T23:00:00Z");
    const sat2330 = at("2026-11-29T02:30:00Z");
    expect(openStatus(week(), fri17, undefined, "en").nextOpenLabel).toBe("Opens today at 18:00");
    expect(openStatus(week(), thu20, undefined, "en").nextOpenLabel).toBe("Opens tomorrow at 18:00");
    expect(openStatus(week(), sat2330, undefined, "en").nextOpenLabel).toBe("Opens on Friday at 18:00");
    expect(openStatus(week(), fri17, undefined, "es").nextOpenLabel).toBe("Abre hoy a las 18:00");
    expect(openStatus(week(), thu20, undefined, "es").nextOpenLabel).toBe("Abre mañana a las 18:00");
    expect(openStatus(week(), sat2330, undefined, "es").nextOpenLabel).toBe("Abre el viernes a las 18:00");
    expect(openStatus(week(), fri17, undefined, "fr").nextOpenLabel).toBe("Abre hoje às 18:00");
  });

  it("localDayMinutes converte pro fuso", () => {
    expect(localDayMinutes(at("2026-11-28T02:15:00Z"))).toEqual({ day: 5, mins: 23 * 60 + 15 });
  });
});
