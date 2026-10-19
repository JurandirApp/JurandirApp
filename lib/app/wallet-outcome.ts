// Decisões puras do pagamento por carteira (Apple/Google Pay) no site — sem
// React, sem servidor. Usadas pelo payWithWallet do ClientApp.

import type { OrderCreateInput } from "@/lib/validation";

/** Snapshot tirado NO CLIQUE: o mesmo pedido e o mesmo valor vão pra folha da
 *  carteira e pro servidor (o carrinho pode mudar com a folha aberta). */
export type WalletAttempt = { input: OrderCreateInput; amount: number };

export type WalletOutcome = "paid" | "pending" | "declined" | "unknown";

/** Duração dos avisos da carteira (recusado/indisponível): mais longa que o
 *  padrão porque o cliente acabou de sair da folha nativa. */
export const WALLET_TOAST_MS = 4500;

/** Desfecho da cobrança. "unknown" = não dá pra afirmar que NÃO cobrou (exceção
 *  no servidor/rede) → nunca mostrar "recusado" (evita o cliente pagar 2x). */
export function walletOutcome(
  c: { ok: boolean; status: "paid" | "pending" | "failed"; order?: unknown } | "exception",
): WalletOutcome {
  if (c === "exception") return "unknown";
  if (c.status === "paid") return "paid";
  if (c.status === "pending") return "pending";
  // Recusa real volta com o pedido; "failed" sem pedido = exceção no servidor.
  return c.order ? "declined" : "unknown";
}

export function toCents(v: number): number {
  return Math.round(v * 100);
}

/** O total do pedido criado bate com o valor autorizado na folha (em centavos)? */
export function amountMatches(orderGrand: number, authorizedCents: number): boolean {
  return Number.isFinite(orderGrand) && toCents(orderGrand) === authorizedCents;
}
