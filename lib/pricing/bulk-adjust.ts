/**
 * Ajuste de preço em massa — lógica pura de cálculo (sem banco, sem I/O).
 *
 * Modos de arredondamento (escolhidos pelo estabelecimento a cada ajuste):
 * - `exact`  → arredonda ao centavo (meio-pra-cima). Fiel ao percentual.
 * - `end90`  → arredonda PRA CIMA pro próximo valor terminando em ,90.
 * - `end99`  → arredonda PRA CIMA pro próximo valor terminando em ,99.
 * - `whole`  → arredonda pro real cheio mais próximo (meio-pra-cima).
 */
export type RoundingMode = "exact" | "end90" | "end99" | "whole";

/** Margem contra o erro de ponto flutuante (ex.: 8.5*1.15 = 9.774999… em float). */
const EPS = 1e-6;

/**
 * Aplica `percent` (20 = +20%, -15 = -15%) a um preço em reais e arredonda
 * conforme `mode`. Trabalha em centavos inteiros pra não sofrer com float.
 * Nunca retorna valor negativo.
 */
export function adjustPrice(price: number, percent: number, mode: RoundingMode): number {
  const baseCents = Math.round(price * 100);
  // Alvo em centavos, seguro contra float: inteiro * (100 + percent) / 100.
  const rawCents = Math.max(0, (baseCents * (100 + percent)) / 100);
  return roundCents(rawCents, mode) / 100;
}

function roundCents(rawCents: number, mode: RoundingMode): number {
  if (rawCents <= EPS) return 0;
  switch (mode) {
    case "exact":
      return Math.round(rawCents + EPS);
    case "whole":
      return Math.round(rawCents / 100 + EPS) * 100;
    case "end90":
      return ceilToEnding(rawCents, 90);
    case "end99":
      return ceilToEnding(rawCents, 99);
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

/** Menor valor em centavos que termina em `ending` (ex.: 90) e é >= rawCents. */
function ceilToEnding(rawCents: number, ending: number): number {
  const base = Math.floor((rawCents + EPS) / 100) * 100;
  let candidate = base + ending;
  if (candidate < rawCents - EPS) candidate += 100;
  return candidate;
}

// ---------------------------------------------------------------------------
// Montagem do "de → para" de uma seleção de itens (preview do ajuste em massa).
// ---------------------------------------------------------------------------

export interface AdjustableOption {
  id: string;
  name: string;
  priceDelta: number;
}

export interface AdjustableItem {
  id: string;
  name: string;
  price: number;
  options: AdjustableOption[];
}

export interface AdjustParams {
  percent: number;
  rounding: RoundingMode;
  /** Aplica o mesmo % também nos adicionais (com preço) dos itens. */
  includeAddons: boolean;
}

export interface OptionChange {
  id: string;
  name: string;
  oldDelta: number;
  newDelta: number;
}

export interface ItemChange {
  id: string;
  name: string;
  oldPrice: number;
  newPrice: number;
  /** Adicionais alterados. Vazio quando `includeAddons` é false. */
  options: OptionChange[];
}

/**
 * Calcula o "de → para" de cada item da seleção. Função pura: não lê nem grava
 * banco — recebe os itens e devolve a lista de mudanças, preservando a ordem.
 * Só entram em `options` os adicionais com preço (`priceDelta > 0`) e apenas
 * quando `includeAddons` é true.
 */
export function computeAdjustment(items: AdjustableItem[], params: AdjustParams): ItemChange[] {
  const { percent, rounding, includeAddons } = params;
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    oldPrice: item.price,
    newPrice: adjustPrice(item.price, percent, rounding),
    options: includeAddons
      ? item.options
          .filter((o) => o.priceDelta > 0)
          .map((o) => ({
            id: o.id,
            name: o.name,
            oldDelta: o.priceDelta,
            newDelta: adjustPrice(o.priceDelta, percent, rounding),
          }))
      : [],
  }));
}
