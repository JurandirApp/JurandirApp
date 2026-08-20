/** Client App (Fase 4) pure helpers — cart math, service fees, bill splitting. */

import type { MenuItem } from "@/lib/data/panel";
import type { PayId } from "@/lib/data/app";

/** Jurandir platform fee (8%) + establishment service fee (10%). */
export const JUR_FEE_PCT = 8;
export const EST_FEE_PCT = 10;

export type CartLine = { id: number; qty: number };

/** A friend's share in a split bill: their payment method (or unpaid) + amount.
 *  No split REAL por Pix, cada parte é uma cobrança Pix própria: `paid` diz se já
 *  caiu, `pixPayload`/`pixQrImage` são o copia-e-cola + QR daquela pessoa. */
export type Share = {
  m: PayId | null;
  amount: number;
  paid?: boolean;
  pixPayload?: string;
  pixQrImage?: string;
};

export type ClientOrder = {
  id: number;
  dbId?: string;
  code: string;
  /** epoch ms (client clock at checkout) */
  ts: number;
  items: { name: string; qty: number; price: number }[];
  /** Subtotal do carrinho (só os itens). */
  total: number;
  /** Comissão da plataforma (parte do `grand`). */
  fee: number;
  /** Taxa de serviço do bar (parte do `grand`). */
  est: number;
  /** O que o cliente paga de verdade = subtotal + taxa do bar + comissão. */
  grand: number;
  note: string;
  name: string;
  status: "aguardando" | "producao" | "entregue";
  /** Pix cheio aguardando que passou da janela de pagamento (QR morto no MP). */
  expired?: boolean;
  /** Pix (cobrança real): copia-e-cola + QR base64, presentes enquanto aguarda pagamento. */
  pixPayload?: string;
  pixQrImage?: string;
  /** Full payment: chosen method + installments (parc). Null when split. */
  pay: { id: PayId; parc: number } | null;
  /** Split payment: one row per friend. Null when paid in full. */
  splits: Share[] | null;
};

const round2 = (v: number) => +v.toFixed(2);

export function cartTotal(cart: CartLine[], menu: MenuItem[]): number {
  return cart.reduce((s, c) => {
    const m = menu.find((x) => x.id === c.id);
    return s + (m ? m.price * c.qty : 0);
  }, 0);
}

export function cartCount(cart: CartLine[]): number {
  return cart.reduce((s, c) => s + c.qty, 0);
}

/**
 * Modelo comissão. `total` = subtotal do carrinho → { fee (comissão da plataforma,
 * SOMADA à conta do cliente), est (taxa de serviço do bar), grand (o que o cliente
 * paga = subtotal + taxa do bar + comissão) }. Espelha `computeTotals` no servidor.
 */
export function fees(total: number, platformFeePct = JUR_FEE_PCT, serviceFeePct = EST_FEE_PCT) {
  const est = round2((total * serviceFeePct) / 100); // taxa de serviço do bar
  const base = round2(total + est); // o que vai pro bar
  const fee = round2((base * platformFeePct) / 100); // comissão da plataforma
  const grand = round2(base + fee); // o que o cliente paga (inclui a comissão)
  return { fee, est, grand };
}

/** Split `grand` into `n` even shares; the last one absorbs the rounding. */
export function shares(grand: number, n: number): number[] {
  const base = Math.floor((grand / n) * 100) / 100;
  const arr = Array(n).fill(base);
  arr[n - 1] = round2(grand - base * (n - 1));
  return arr;
}

/** Max installments: only above R$100, min R$50/parcel, capped at 6, no interest. */
export function maxInstallments(grand: number): number {
  return grand < 100 ? 1 : Math.min(6, Math.floor(grand / 50));
}

/** Random order code (client-only, generated at checkout). */
export function makeOrderCode(): string {
  const hex = "0123456789ABCDEF";
  return (
    "PED-" +
    Array.from({ length: 8 }, () => hex[Math.floor(Math.random() * 16)]).join("")
  );
}

/** "Pago" = flag `paid` (split real por Pix) com fallback pro método escolhido
 *  (compatibilidade com o modelo antigo de simulação). */
const isSharePaid = (s: Share): boolean => s.paid ?? !!s.m;

export function paidCount(splits: Share[]): number {
  return splits.filter(isSharePaid).length;
}

export function paidAmount(splits: Share[]): number {
  return splits.reduce((s, x) => s + (isSharePaid(x) ? x.amount : 0), 0);
}
