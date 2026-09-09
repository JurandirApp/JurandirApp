/** 4 últimos dígitos do telefone do cliente (ignora máscara). Sem telefone →
 *  usa o fallback (código aleatório salvo por pedido). Zero-pad se tiver menos. */
export function deliveryCode(customerPhone: string | null, fallback: string | null): string {
  const digits = (customerPhone ?? "").replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(-4);
  if (digits.length > 0) return digits.padStart(4, "0");
  return fallback ?? randomCode4();
}

export function randomCode4(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

/** Pedido completo = TODA linha entregue por inteiro. Vazio = não completo. */
export function isOrderFullyDelivered(items: { qty: number; qtyDelivered: number }[]): boolean {
  return items.length > 0 && items.every((i) => i.qtyDelivered >= i.qty);
}
