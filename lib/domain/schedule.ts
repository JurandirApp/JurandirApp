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
export function toMin(hhmm: unknown): number | null {
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

/** O estabelecimento está aberto no instante dado? Trata virada de madrugada.
 *  Usa o fuso LOCAL do `Date` (navegador); no servidor use `openStatus`. */
export function isOpenAt(week: WeekSchedule, date: Date): boolean {
  return isOpenAtParts(week, date.getDay(), date.getHours() * 60 + date.getMinutes());
}

/** Igual a `isOpenAt`, mas recebe o dia da semana (0 = domingo) e os minutos
 *  desde 00:00 já calculados — permite avaliar em qualquer fuso (ex.: Brasília)
 *  sem depender do fuso do servidor/navegador. */
export function isOpenAtParts(week: WeekSchedule, day: number, mins: number): boolean {
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

/** Fuso dos estabelecimentos (todos no Brasil, horário de Brasília). */
export const EST_TIMEZONE = "America/Sao_Paulo";

const WEEKDAY_IDX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Dia da semana (0 = dom) e minutos desde 00:00 de `date` no fuso `timeZone`
 *  — independe do fuso do servidor (a Vercel roda em UTC). */
export function localDayMinutes(date: Date, timeZone = EST_TIMEZONE): { day: number; mins: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = WEEKDAY_IDX[get("weekday")] ?? 0;
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  return { day, mins: hour * 60 + minute };
}

/** Idiomas dos rótulos gerados no servidor (próxima abertura etc.). */
export type LabelLocale = "pt" | "en" | "es";

/** Normaliza qualquer locale/`?lang=` pra um idioma de rótulo (padrão pt). */
export function labelLocale(l: string | null | undefined): LabelLocale {
  return l === "en" || l === "es" ? l : "pt";
}

/** Dias da semana (índice 0 = domingo) por idioma. */
export const WEEKDAY_NAMES: Record<LabelLocale, string[]> = {
  pt: ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  es: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
};

/** "Abre hoje às 18:00" / "Opens today at 18:00" / "Abre hoy a las 18:00". */
function formatNextOpen(locale: LabelLocale, dayOffset: number, weekday: number, time: string): string {
  const wd = WEEKDAY_NAMES[locale][weekday];
  if (locale === "en") {
    const when = dayOffset === 0 ? "today" : dayOffset === 1 ? "tomorrow" : `on ${wd}`;
    return `Opens ${when} at ${time}`;
  }
  if (locale === "es") {
    const when = dayOffset === 0 ? "hoy" : dayOffset === 1 ? "mañana" : `el ${wd}`;
    return `Abre ${when} a las ${time}`;
  }
  const when = dayOffset === 0 ? "hoje" : dayOffset === 1 ? "amanhã" : wd;
  return `Abre ${when} às ${time}`;
}

export type OpenStatus = {
  /** O bar tem horário configurado (alguma janela na semana)? */
  configured: boolean;
  /** Aberto agora. Sem horário configurado → sempre true (nunca bloqueia). */
  openNow: boolean;
  /** Só quando fechado: "Abre hoje às 18:00" / "Abre amanhã às 18:00" /
   *  "Abre sexta às 18:00". */
  nextOpenLabel?: string;
};

/**
 * Aberto agora + próxima abertura, no fuso do estabelecimento. Puro (o `now`
 * entra por parâmetro). Aceita o JSON cru do banco (`weeklyHours`).
 */
export function openStatus(
  rawWeekly: unknown,
  now: Date,
  timeZone = EST_TIMEZONE,
  locale: string = "pt",
): OpenStatus {
  const week = normalizeWeekly(rawWeekly);
  if (!hasAnyWindow(week)) return { configured: false, openNow: true };
  const { day, mins } = localDayMinutes(now, timeZone);
  if (isOpenAtParts(week, day, mins)) return { configured: true, openNow: true };

  // Próxima janela que abre: hoje (depois de agora) ou nos próximos 7 dias.
  for (let offset = 0; offset <= 7; offset++) {
    const d = (day + offset) % 7;
    const opens = (week[d] ?? [])
      .map((w) => ({ w, o: toMin(w.o) }))
      .filter((x): x is { w: TimeWindow; o: number } => x.o != null)
      .filter((x) => offset > 0 || x.o > mins)
      .sort((a, b) => a.o - b.o);
    if (opens.length) {
      const nextOpenLabel = formatNextOpen(labelLocale(locale), offset, d, opens[0].w.o);
      return { configured: true, openNow: false, nextOpenLabel };
    }
  }
  return { configured: true, openNow: false };
}
