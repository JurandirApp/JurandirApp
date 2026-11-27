// Cadastro de mesas/guarda-sóis (QrSpot) em lote — regras puras, usadas pelo
// painel (prévia no navegador), pela server action e pela rota do app.

/** Máximo de rótulos por lote. */
export const QR_BATCH_MAX = 200;
/** Tamanho máximo de um rótulo (o QR codifica o rótulo na URL). */
export const QR_LABEL_MAX = 60;

/** Normaliza um rótulo como o cadastro avulso faz: só `trim`. */
export function normalizeSpotLabel(raw: string): string {
  return raw.trim();
}

/** Chave de comparação: o painel já trata "mesa 1" e "Mesa 1" como iguais. */
const keyOf = (label: string) => label.toLocaleLowerCase("pt-BR");

/** Faixa numérica: prefixo + de/até. `pad` = zeros à esquerda ("Mesa 01");
 *  a largura é a do maior número, no mínimo 2. Prefixo vazio → só o número.
 *  Faixa inválida (não inteiro, negativo, de > até) ou maior que o limite → null. */
export function rangeLabels(
  prefix: string,
  from: number,
  to: number,
  pad = false,
): string[] | null {
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
  if (from < 0 || to < from) return null;
  if (to - from + 1 > QR_BATCH_MAX) return null;
  const p = normalizeSpotLabel(prefix);
  const width = pad ? Math.max(2, String(to).length) : 0;
  const out: string[] = [];
  for (let n = from; n <= to; n++) {
    const num = pad ? String(n).padStart(width, "0") : String(n);
    out.push(p ? `${p} ${num}` : num);
  }
  return out;
}

/** Lista colada: um rótulo por linha; linhas vazias são ignoradas. */
export function parseLabelList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(normalizeSpotLabel)
    .filter((l) => l.length > 0);
}

/** Valida o corpo `labels` (vindo do cliente/app). Retorna os rótulos
 *  normalizados ou null quando inválido: não é array, item não-string, rótulo
 *  longo demais, nenhum rótulo, ou mais que o limite. */
export function validateBatchLabels(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > QR_BATCH_MAX) return null;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return null;
    const label = normalizeSpotLabel(item);
    if (!label) continue;
    if (label.length > QR_LABEL_MAX) return null;
    out.push(label);
  }
  return out.length > 0 ? out : null;
}

/** Separa o que criar do que pular (repetido no lote ou já cadastrado),
 *  comparando sem diferenciar maiúsculas. Mantém a ordem de entrada. */
export function planBatch(
  labels: string[],
  existing: string[],
): { toCreate: string[]; skipped: number } {
  const seen = new Set(existing.map(keyOf));
  const toCreate: string[] = [];
  for (const label of labels) {
    const k = keyOf(label);
    if (seen.has(k)) continue;
    seen.add(k);
    toCreate.push(label);
  }
  return { toCreate, skipped: labels.length - toCreate.length };
}
