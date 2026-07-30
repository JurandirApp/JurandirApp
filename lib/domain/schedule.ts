/**
 * Horário de funcionamento semanal — modelo canônico + lógica pura.
 *
 * Uma semana são 7 dias (índice 0 = domingo, batendo com `Date.getDay()`), e
 * cada dia tem 0 a 2 janelas `{abre, fecha}`. Lista vazia = fechado. A última
 * janela do dia pode virar a madrugada (`fecha ≤ abre`, ex.: 18h→6h).
 *
 * É a fonte única: o painel edita `weeklyHours`, e daqui derivamos o texto de
 * exibição (`formatWeekly`) e a fronteira do "dia operacional" do filtro de
 * pedidos (`deriveDayStartHour`).
 */

export type TimeWindow = { o: string; c: string }; // "HH:MM"
/** 0 a 2 janelas; lista vazia = fechado. */
export type DayWindows = TimeWindow[];
/** Length 7, índice 0 = domingo. */
export type WeekSchedule = DayWindows[];

export const EMPTY_WEEK: WeekSchedule = [[], [], [], [], [], [], []];

/** Ordem de exibição começando na segunda (índices JS de `getDay`). */
export const MON_FIRST = [1, 2, 3, 4, 5, 6, 0] as const;

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** Minutos desde 00:00, ou null se o texto não for um "HH:MM" válido. */
function toMin(hhmm: unknown): number | null {
  if (typeof hhmm !== "string") return null;
  const m = HHMM.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Normaliza pra "HH:MM" com zero à esquerda, ou null se inválido. */
function normTime(hhmm: unknown): string | null {
  const min = toMin(hhmm);
  if (min == null) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** A janela vira a madrugada? (fecha em hora ≤ que abre, e não à meia-noite). */
export function isOvernight(w: TimeWindow): boolean {
  const o = toMin(w.o);
  const c = toMin(w.c);
  if (o == null || c == null) return false;
  // fecha às 00:00 = fecha à meia-noite, não é madrugada.
  return c > 0 && c <= o;
}

/**
 * Parse seguro do JSON do banco → `WeekSchedule` validado. Aceita o shape
 * ANTIGO (`{o,c} | null` por dia) e converte pro novo, filtra janelas inválidas,
 * limita a 2 janelas/dia e garante length 7.
 */
export function normalizeWeekly(raw: unknown): WeekSchedule {
  const arr = Array.isArray(raw) ? raw : [];
  const out: WeekSchedule = [];
  for (let i = 0; i < 7; i++) {
    const day = arr[i];
    let windows: unknown[];
    if (day == null) windows = []; // fechado (ou dia ausente)
    else if (Array.isArray(day)) windows = day; // novo shape
    else windows = [day]; // shape antigo: um único {o,c}
    const clean: DayWindows = [];
    for (const w of windows) {
      if (clean.length >= 2) break;
      if (!w || typeof w !== "object") continue;
      const o = normTime((w as TimeWindow).o);
      const c = normTime((w as TimeWindow).c);
      if (o && c) clean.push({ o, c });
    }
    out.push(clean);
  }
  return out;
}

/** O estabelecimento está aberto no instante dado? Trata virada de madrugada. */
export function isOpenAt(week: WeekSchedule, date: Date): boolean {
  const day = date.getDay();
  const mins = date.getHours() * 60 + date.getMinutes();

  for (const w of week[day] ?? []) {
    const o = toMin(w.o);
    const c = toMin(w.c);
    if (o == null || c == null) continue;
    // Mesmo dia (fecha depois de abrir): aberto entre abre e fecha.
    if (c > o && mins >= o && mins < c) return true;
    // Madrugada (fecha ≤ abre): aberto de abre até o fim do dia.
    if (c <= o && mins >= o) return true;
  }

  // Janela de ontem que virou a madrugada pode ainda estar aberta cedo hoje.
  for (const w of week[(day + 6) % 7] ?? []) {
    if (!isOvernight(w)) continue;
    const c = toMin(w.c)!;
    if (mins < c) return true;
  }

  return false;
}

/** "18:00" → "18h", "18:30" → "18h30", "06:00" → "6h". */
function fmtTime(hhmm: string): string {
  const min = toMin(hhmm) ?? 0;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/** Texto de uma janela: "18h–6h". */
function fmtWindow(w: TimeWindow): string {
  return `${fmtTime(w.o)}–${fmtTime(w.c)}`;
}

/** Texto das janelas de UM dia: "18h–23h" ou "12h–15h e 18h–23h" (vazio = fechado). */
export function formatDayWindows(day: DayWindows, and = "e"): string {
  return day.map(fmtWindow).join(` ${and} `);
}

type FormatOpts = {
  /** Rótulos por dia, índice 0 = domingo (ex.: ["Dom","Seg",…]). */
  labels: string[];
  /** Conjunção entre 2 turnos no mesmo dia ("e" / "and"). */
  and: string;
  /** Texto quando a semana inteira está fechada. */
  allClosed: string;
};

/**
 * Resumo legível do horário, agrupando dias consecutivos (ordem seg→dom) com
 * janelas iguais. Dias fechados são omitidos; se todos fechados → `allClosed`.
 * Ex.: "Ter–Qui 18h–23h · Sex 18h–6h · Sáb 14h–4h".
 */
export function formatWeekly(week: WeekSchedule, opts: FormatOpts): string {
  const sig = (d: DayWindows) => d.map(fmtWindow).join(` ${opts.and} `);
  const parts: string[] = [];
  let i = 0;
  while (i < MON_FIRST.length) {
    const day = week[MON_FIRST[i]] ?? [];
    const text = sig(day);
    if (!text) {
      i++;
      continue; // fechado → omite
    }
    // Estende o grupo enquanto o próximo dia tiver a mesma assinatura.
    let j = i;
    while (
      j + 1 < MON_FIRST.length &&
      sig(week[MON_FIRST[j + 1]] ?? []) === text
    ) {
      j++;
    }
    const from = opts.labels[MON_FIRST[i]];
    const to = opts.labels[MON_FIRST[j]];
    const daysLabel = i === j ? from : `${from}–${to}`;
    parts.push(`${daysLabel} ${text}`);
    i = j + 1;
  }
  return parts.length ? parts.join(" · ") : opts.allClosed;
}

/**
 * Fronteira do "dia operacional" pro filtro de pedidos: o fechamento de
 * madrugada mais tarde da semana (hora arredondada pra cima). Sem madrugada → 0.
 * Ex.: Sex fecha 06:00, Sáb 04:00 → 6.
 */
export function deriveDayStartHour(week: WeekSchedule): number {
  let latest = 0;
  for (const day of week) {
    for (const w of day) {
      if (!isOvernight(w)) continue;
      const c = toMin(w.c)!;
      const hour = Math.ceil(c / 60);
      if (hour > latest) latest = hour;
    }
  }
  return latest > 23 ? 23 : latest;
}

/** Algum dia tem pelo menos uma janela? (semana "preenchida"). */
export function hasAnyWindow(week: WeekSchedule): boolean {
  return week.some((d) => d.length > 0);
}
