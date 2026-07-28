import type { PaymentMethod } from "@prisma/client";

/** Gateway fee % per method (snapshotted onto each Payment). */
export const GATEWAY_FEE_PCT: Record<PaymentMethod, number> = {
  CREDIT: 3.49,
  DEBIT: 1.99,
  PIX: 0.99,
  USDC: 1.0,
};

export const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Valor que vai ao estabelecimento no split de marketplace (Jurandir retém a platformFee). */
export function splitToEstablishment(total: number, platformFee: number): number {
  return round2(total - platformFee);
}

export type Totals = { platformFee: number; serviceFee: number; total: number };

/** Modelo comissão (marketplace): o cliente paga `subtotal` (+ taxa de serviço do
 *  bar, se houver). A `platformFee` é a COMISSÃO da plataforma (application_fee) —
 *  ela NÃO é somada ao total; sai do valor que vai pro bar. Ex.: cliente paga 100,
 *  comissão 5% → bar recebe 95, plataforma 5. */
export function computeTotals(
  subtotal: number,
  platformFeePct: number,
  serviceFeePct: number,
): Totals {
  const serviceFee = round2((subtotal * serviceFeePct) / 100);
  const total = round2(subtotal + serviceFee);
  const platformFee = round2((total * platformFeePct) / 100);
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
