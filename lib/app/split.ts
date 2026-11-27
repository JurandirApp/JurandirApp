/** Conta dividida (split por Pix) — regras puras compartilhadas entre o site e o
 *  servidor. Cada parte é uma cobrança Pix própria; o pedido só vai pra cozinha
 *  quando TODAS caem (reconciliação/webhook). */

/** O pedido aguarda pagamento e tem cobrança real pra consultar no gateway?
 *  Pagamento cheio tem `payment`; conta dividida tem só `splitShares`. */
export function needsReconcile(o: {
  status: string;
  payment: unknown | null;
  splitShares?: unknown[] | null;
}): boolean {
  if (o.status !== "AWAITING_PAYMENT") return false;
  return Boolean(o.payment) || (o.splitShares?.length ?? 0) > 0;
}

/** Corpo `payment` do pedido dividido: split é SEMPRE Pix (uma cobrança por
 *  pessoa) — o método não é escolhido no checkout. */
export function splitPayment(people: number): {
  kind: "split";
  shares: { method: "PIX" }[];
} {
  const n = Math.min(8, Math.max(2, Math.floor(people)));
  return { kind: "split", shares: Array.from({ length: n }, () => ({ method: "PIX" as const })) };
}

/** Todas as partes precisam ter cobrança Pix criada; uma parte sem cobrança
 *  nunca pode ser paga e o pedido ficaria preso em AWAITING_PAYMENT pra sempre. */
export function allSharesCharged(charges: ({ chargeId?: string | null } | null)[]): boolean {
  return charges.length > 0 && charges.every((c) => Boolean(c?.chargeId));
}
