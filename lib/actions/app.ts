"use server";

import { revalidatePath } from "next/cache";
import type { PaymentMethod } from "@prisma/client";
import { createOrder, payShare, getOrdersByIds } from "@/lib/db/orders";
import { createCardCheckout, reconcileOrder } from "@/lib/db/payments";
import { orderCreateSchema, type OrderCreateInput } from "@/lib/validation";
import { toClientOrder } from "@/lib/app/adapters";
import type { ClientOrder } from "@/lib/app/helpers";

// Public (anonymous QR customer) — no session required.
export async function createOrderAction(
  input: OrderCreateInput,
): Promise<{ ok: boolean; order?: ClientOrder; checkoutUrl?: string; error?: string }> {
  const parsed = orderCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const created = await createOrder(parsed.data);
    // Cartão via Mercado Pago nasce AWAITING_PAYMENT → cria a preferência do
    // Checkout Pro e devolve a URL pro cliente ser redirecionado ao MP.
    let checkoutUrl: string | undefined;
    if (
      created.status === "AWAITING_PAYMENT" &&
      (created.payment?.method === "CREDIT" || created.payment?.method === "DEBIT")
    ) {
      checkoutUrl = (await createCardCheckout(created.id)) ?? undefined;
    }
    return { ok: true, order: toClientOrder(created), checkoutUrl };
  } catch {
    return { ok: false, error: "failed" };
  }
}

export async function payShareAction(
  orderId: string,
  personIndex: number,
  method: PaymentMethod,
): Promise<{ ok: boolean; order?: ClientOrder }> {
  try {
    const updated = await payShare(orderId, personIndex, method);
    if (!updated) return { ok: false };
    revalidatePath("/painel"); // establishment panel sees the status flip
    return { ok: true, order: toClientOrder(updated) };
  } catch {
    return { ok: false };
  }
}

export async function getMyOrdersAction(ids: string[]): Promise<ClientOrder[]> {
  if (!ids.length) return [];
  let rows = await getOrdersByIds(ids);
  // Reconcilia pedidos aguardando pagamento com cobrança real (viabiliza dev sem
  // webhook público). reconcileOrder cobre Pix (por id) e cartão/Checkout Pro
  // (por external_reference).
  const awaiting = rows.filter((o) => o.status === "AWAITING_PAYMENT" && o.payment);
  if (awaiting.length) {
    await Promise.all(awaiting.map((o) => reconcileOrder(o.id).catch(() => {})));
    rows = await getOrdersByIds(ids);
  }
  return rows.map(toClientOrder);
}
