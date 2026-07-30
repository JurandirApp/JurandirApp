/**
 * Filtro de período dos pedidos, com fronteira de "dia operacional" configurável.
 *
 * Brasil = UTC-3 fixo (sem horário de verão desde 2019), então derivamos a
 * hora-parede de Brasília deslocando o instante UTC em 3h. O `dayStartHour`
 * (0-23, hora de Brasília) define quando o "dia" vira — ex.: 12 faz o turno
 * noturno (18h→6h) cair todo no mesmo dia operacional.
 */

export type OrdersPeriod =
  | { kind: "hoje" }
  | { kind: "ontem" }
  | { kind: "d7" }
  | { kind: "custom"; from: string; to: string }; // "YYYY-MM-DD" (data de Brasília)

const BR_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC-3
const DAY_MS = 24 * 60 * 60 * 1000;

export function clampHour(h: number): number {
  const n = Math.floor(Number(h) || 0);
  return n < 0 ? 0 : n > 23 ? 23 : n;
}

/** Instante UTC do "início do dia" (dayStartHour em hora BR) de uma data BR. */
function brDayStartUtc(y: number, mo: number, d: number, hour: number): number {
  // Date.UTC monta os componentes como se fossem UTC; somar o offset transforma
  // naquela hora-parede de Brasília, no instante UTC correspondente.
  return Date.UTC(y, mo, d, hour, 0, 0) + BR_OFFSET_MS;
}

/** Componentes de data/hora de Brasília para um instante UTC (ms). */
function brParts(utcMs: number) {
  const d = new Date(utcMs - BR_OFFSET_MS);
  return {
    y: d.getUTCFullYear(),
    mo: d.getUTCMonth(),
    d: d.getUTCDate(),
    h: d.getUTCHours(),
  };
}

/** Início do dia operacional ATUAL (instante UTC), dado agora + dayStartHour. */
function currentDayStart(nowMs: number, dayStartHour: number): number {
  const p = brParts(nowMs);
  let start = brDayStartUtc(p.y, p.mo, p.d, dayStartHour);
  // Antes da virada de hoje → ainda é o dia operacional de ontem.
  if (nowMs < start) start -= DAY_MS;
  return start;
}

function parseYmd(s: string): { y: number; mo: number; d: number } {
  const [y, mo, d] = String(s)
    .split("-")
    .map((x) => parseInt(x, 10));
  return { y: y || 1970, mo: (mo || 1) - 1, d: d || 1 };
}

/** Converte um período + `dayStartHour` num intervalo [from, to) de datas UTC. */
export function periodRange(
  period: OrdersPeriod,
  dayStartHour: number,
  nowMs: number,
): { from: Date; to: Date } {
  const h = clampHour(dayStartHour);
  if (period.kind === "custom") {
    const f = parseYmd(period.from);
    const t = parseYmd(period.to);
    const from = brDayStartUtc(f.y, f.mo, f.d, h);
    const to = brDayStartUtc(t.y, t.mo, t.d, h) + DAY_MS;
    return { from: new Date(from), to: new Date(Math.max(to, from + DAY_MS)) };
  }
  const start = currentDayStart(nowMs, h);
  if (period.kind === "ontem") {
    return { from: new Date(start - DAY_MS), to: new Date(start) };
  }
  if (period.kind === "d7") {
    // Últimos 7 dias operacionais, incluindo o de hoje.
    return { from: new Date(start - 6 * DAY_MS), to: new Date(start + DAY_MS) };
  }
  // hoje
  return { from: new Date(start), to: new Date(start + DAY_MS) };
}
