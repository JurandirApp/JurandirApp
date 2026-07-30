import type { PaymentMethod } from "@prisma/client";

/** Gateway fee % per method (snapshotted onto each Payment). */
export const GATEWAY_FEE_PCT: Record<PaymentMethod, number> = {
  CREDIT: 3.49,
  DEBIT: 1.99,
  PIX: 0.99,
  USDC: 1.0,
};

export const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Janela de pagamento do Pix (min). Passado isso, a cobrança expira no Mercado
 *  Pago e o pedido sai das listas ativas (não "superlota" o painel do bar). */
export const PIX_EXPIRES_MIN = 15;

/** Deriva (na leitura, sem escrita/cron) se um pedido Pix CHEIO aguardando
 *  pagamento já passou da janela. Conta dividida (split) e cartão não expiram por
 *  aqui — só o Pix direto, que é o que tem `date_of_expiration` no gateway. */
export function isPixExpired(o: {
  status: string;
  method: string | null;
  hasSplit: boolean;
  createdAtMs: number;
}): boolean {
  if (o.status !== "AWAITING_PAYMENT" || o.method !== "PIX" || o.hasSplit) return false;
  return Date.now() - o.createdAtMs > PIX_EXPIRES_MIN * 60_000;
}

/** Valor que vai ao estabelecimento no split de marketplace (Jurandir retém a platformFee). */
export function splitToEstablishment(total: number, platformFee: number): number {
  return round2(total - platformFee);
}

export type Totals = { platformFee: number; serviceFee: number; total: number };

/** Modelo comissão (marketplace): a comissão da plataforma é SOMADA à conta do
 *  cliente — o bar recebe o valor cheio. `total` = subtotal + taxa de serviço do
 *  bar + comissão da plataforma. A `platformFee` (application_fee) sai desse total
 *  pra plataforma; o resto (subtotal + taxa do bar) vai pro bar.
 *  Ex.: conta 100, comissão 5% → cliente paga 105, bar recebe 100, plataforma 5. */
export function computeTotals(
  subtotal: number,
  platformFeePct: number,
  serviceFeePct: number,
): Totals {
  const serviceFee = round2((subtotal * serviceFeePct) / 100);
  const base = round2(subtotal + serviceFee); // o que vai pro bar
  const platformFee = round2((base * platformFeePct) / 100); // comissão (application_fee)
  const total = round2(base + platformFee); // o que o cliente paga
  return { platformFee, serviceFee, total };
}

/** Split `grand` into `n` even shares; the last absorbs the rounding remainder. */
export function splitShares(grand: number, n: number): number[] {
  const base = Math.floor((grand / n) * 100) / 100;
  const arr = Array<number>(n).fill(base);
  arr[n - 1] = round2(grand - base * (n - 1));
  return arr;
}

/** Random order code: "PED-" + 8 uppercase hex chars. */
export function makeOrderCode(): string {
  const hex = "0123456789ABCDEF";
  return (
    "PED-" +
    Array.from({ length: 8 }, () => hex[Math.floor(Math.random() * 16)]).join("")
  );
}
