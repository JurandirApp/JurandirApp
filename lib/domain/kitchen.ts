/**
 * Horário da COZINHA — lógica pura.
 *
 * Fora do horário da cozinha, os itens das categorias marcadas como "da
 * cozinha" ficam indisponíveis ("Cozinha fechada"); bebidas (demais categorias)
 * continuam vendendo normalmente.
 *
 * `kitchenHours` usa EXATAMENTE o mesmo shape do `weeklyHours` (ver
 * `lib/domain/schedule.ts`): array de 7 dias (índice 0 = domingo), cada dia com
 * 0 a 2 janelas `{ o: "HH:MM", c: "HH:MM" }`; a última pode virar a madrugada.
 *
 * Configuração vazia (nenhuma categoria marcada OU nenhuma janela na semana) =
 * cozinha SEMPRE aberta — nunca bloqueia um bar que não configurou.
 *
 * O relógio é sempre o de Brasília (America/Sao_Paulo), independente do fuso do
 * servidor ou do navegador.
 */
import {
  hasAnyWindow,
  isOpenAtParts,
  normalizeWeekly,
  toMin,
  type WeekSchedule,
} from "./schedule";

export const KITCHEN_TZ = "America/Sao_Paulo";

export type KitchenConfig = {
  /** Mesmo shape do weeklyHours (length 7, índice 0 = domingo). */
  hours: WeekSchedule;
  /** Categorias do cardápio (MenuItem.category) que são "da cozinha". */
  categories: string[];
};

/** Erro de domínio: pedido com item da cozinha fora do horário. */
export class KitchenClosedError extends Error {
  readonly code = "kitchenClosed" as const;
  constructor() {
    super("kitchenClosed");
    this.name = "KitchenClosedError";
  }
}

/** Parse seguro do que vem do banco/requisição → config validada. */
export function normalizeKitchenConfig(hours: unknown, categories: unknown): KitchenConfig {
  const cats = Array.isArray(categories)
    ? [...new Set(categories.filter((c): c is string => typeof c === "string").map((c) => c.trim()).filter(Boolean))]
    : [];
  return { hours: normalizeWeekly(hours), categories: cats.slice(0, 100) };
}

/** A cozinha está configurada (tem categoria E pelo menos uma janela)? */
export function kitchenConfigured(cfg: KitchenConfig | null | undefined): boolean {
  return !!cfg && cfg.categories.length > 0 && hasAnyWindow(cfg.hours);
}

/** O item (pela categoria) é da cozinha? */
export function isKitchenCategory(cfg: KitchenConfig | null | undefined, category: string): boolean {
  return !!cfg && cfg.categories.includes(category);
}

const WEEKDAY_IDX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
let spFmt: Intl.DateTimeFormat | null = null;

/** Dia da semana (0 = domingo) e minutos desde 00:00 no horário de Brasília. */
export function spClock(now: Date): { day: number; mins: number } {
  spFmt ??= new Intl.DateTimeFormat("en-US", {
    timeZone: KITCHEN_TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  let day = 0;
  let h = 0;
  let m = 0;
  for (const p of spFmt.formatToParts(now)) {
    if (p.type === "weekday") day = WEEKDAY_IDX[p.value] ?? 0;
    else if (p.type === "hour") h = Number(p.value) % 24;
    else if (p.type === "minute") m = Number(p.value);
  }
  return { day, mins: h * 60 + m };
}

/** Cozinha aberta agora? Config vazia/ausente → sempre true. */
export function kitchenOpenNow(cfg: KitchenConfig | null | undefined, now: Date): boolean {
  if (!kitchenConfigured(cfg)) return true;
  const { day, mins } = spClock(now);
  return isOpenAtParts(cfg!.hours, day, mins);
}

/** Próxima abertura: daqui a quantos dias (0 = hoje), dia da semana e "HH:MM". */
export type KitchenNextOpen = { dayOffset: number; weekday: number; time: string };

/** Próxima abertura da cozinha (null se aberta agora, sem config ou semana vazia). */
export function kitchenNextOpen(cfg: KitchenConfig | null | undefined, now: Date): KitchenNextOpen | null {
  if (!kitchenConfigured(cfg) || kitchenOpenNow(cfg, now)) return null;
  const { day, mins } = spClock(now);
  for (let off = 0; off <= 7; off++) {
    const wd = (day + off) % 7;
    const opens = (cfg!.hours[wd] ?? [])
      .map((w) => ({ t: w.o, min: toMin(w.o) }))
      .filter((x): x is { t: string; min: number } => x.min != null && (off > 0 || x.min > mins))
      .sort((a, b) => a.min - b.min);
    if (opens.length) return { dayOffset: off, weekday: wd, time: opens[0].t };
  }
  return null;
}

const WEEKDAYS: Record<"pt" | "en", string[]> = {
  pt: ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

/** Texto da próxima abertura: "Cozinha abre hoje às 18:00" / "Kitchen opens today at 18:00". */
export function formatKitchenNextOpen(next: KitchenNextOpen | null, locale: string = "pt"): string | undefined {
  if (!next) return undefined;
  const en = locale === "en";
  const when =
    next.dayOffset === 0
      ? en ? "today" : "hoje"
      : next.dayOffset === 1
        ? en ? "tomorrow" : "amanhã"
        : en
          ? `on ${WEEKDAYS.en[next.weekday]}`
          : `${WEEKDAYS.pt[next.weekday]}`;
  return en ? `Kitchen opens ${when} at ${next.time}` : `Cozinha abre ${when} às ${next.time}`;
}

/** Atalho: rótulo da próxima abertura agora (undefined se aberta/sem config). */
export function kitchenNextOpenLabel(
  cfg: KitchenConfig | null | undefined,
  now: Date,
  locale: string = "pt",
): string | undefined {
  return formatKitchenNextOpen(kitchenNextOpen(cfg, now), locale);
}

/**
 * Algum item do pedido é da cozinha? Casa pelo `menuItemId` quando vier; senão
 * pelo nome (o site antigo não manda o id). `kitchenItems` = itens do cardápio do
 * bar cujas categorias são da cozinha.
 */
export function orderHasKitchenItem(
  items: { menuItemId?: string | null; name: string }[],
  kitchenItems: { id: string; name: string }[],
): boolean {
  const ids = new Set(kitchenItems.map((k) => k.id));
  const names = new Set(kitchenItems.map((k) => k.name.trim().toLowerCase()));
  return items.some((i) =>
    i.menuItemId ? ids.has(i.menuItemId) : names.has(i.name.trim().toLowerCase()),
  );
}

/** Config da cozinha a partir das colunas do Establishment. */
export function kitchenConfigOf(e: { kitchenHours?: unknown; kitchenCategories?: unknown }): KitchenConfig {
  return normalizeKitchenConfig(e.kitchenHours ?? null, e.kitchenCategories ?? []);
}

/** Campos públicos da cozinha (API/site): aberta agora + rótulo da próxima abertura. */
export function kitchenPublicFields(
  cfg: KitchenConfig,
  now: Date,
  locale: string = "pt",
): { kitchenOpenNow: boolean; kitchenNextOpenLabel?: string } {
  const open = kitchenOpenNow(cfg, now);
  const label = open ? undefined : kitchenNextOpenLabel(cfg, now, locale);
  return label ? { kitchenOpenNow: open, kitchenNextOpenLabel: label } : { kitchenOpenNow: open };
}
