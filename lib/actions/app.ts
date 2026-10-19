"use server";

import { revalidatePath } from "next/cache";
import type { PaymentMethod } from "@prisma/client";
import { createOrder, payShare, getOrdersByIds } from "@/lib/db/orders";
import {
  createCardCheckout,
  reconcileOrder,
  payOrderWithCard,
  payOrderWithWallet,
  resolveChargeableOrder,
} from "@/lib/db/payments";
import { orderCreateSchema, type OrderCreateInput } from "@/lib/validation";
import { toClientOrder } from "@/lib/app/adapters";
import type { ClientOrder } from "@/lib/app/helpers";
import type { CardBrickData, ChargeStatus } from "@/lib/payments/types";

// Public (anonymous QR customer) — no session required.
export async function createOrderAction(
  input: OrderCreateInput,
): Promise<{ ok: boolean; order?: ClientOrder; checkoutUrl?: string; error?: string }> {
  const parsed = orderCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const created = await createOrder(parsed.data);
    // Cartão (e Pix via InfinitePay) nasce AWAITING_PAYMENT → cria o checkout
    // hospedado e devolve a URL pro cliente ser redirecionado ao gateway.
    let checkoutUrl: string | undefined;
    if (
      created.status === "AWAITING_PAYMENT" &&
      (created.payment?.method === "CREDIT" ||
        created.payment?.method === "DEBIT" ||
        (created.payment?.method === "PIX" && created.payment?.provider === "INFINITEPAY"))
    ) {
      checkoutUrl = (await createCardCheckout(created.id)) ?? undefined;
    }
    return { ok: true, order: toClientOrder(created), checkoutUrl };
  } catch {
    return { ok: false, error: "failed" };
  }
}

/** Checkout transparente (Payment Brick): cria o pedido de cartão (AWAITING) e
 *  cobra na hora com o token do Brick. Aprovado → pedido já volta "producao". */
export async function payCardAction(
  input: OrderCreateInput,
  brick: CardBrickData,
): Promise<{ ok: boolean; status: ChargeStatus; order?: ClientOrder; detail?: string }> {
  const parsed = orderCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, status: "failed" };
  try {
    const created = await createOrder(parsed.data); // nasce AWAITING_PAYMENT (cartão)
    const res = await payOrderWithCard(created.id, brick);
    const [fresh] = await getOrdersByIds([created.id]);
    return {
      ok: res.status !== "failed",
      status: res.status,
      order: fresh ? toClientOrder(fresh) : undefined,
      detail: res.statusDetail,
    };
  } catch {
    return { ok: false, status: "failed" };
  }
}

/** Carteira (Apple/Google Pay) no site, passo 1: cria o pedido CREDIT SEM checkout
 *  hospedado; o id fica no cliente e a cobrança é feita por chargeWalletAction. */
export async function createWalletOrderAction(
  input: OrderCreateInput,
): Promise<{ ok: boolean; order?: ClientOrder; error?: string }> {
  const parsed = orderCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const pay = parsed.data.payment;
  if (!pay || pay.kind !== "full" || pay.method !== "CREDIT") return { ok: false, error: "invalid" };
  try {
    // Carteira é sempre crédito à vista.
    const created = await createOrder({ ...parsed.data, payment: { ...pay, installments: 1 } });
    return { ok: true, order: toClientOrder(created) };
  } catch {
    return { ok: false, error: "failed" };
  }
}

/** Carteira no site, passo 2: cobra o pedido já criado com o token da carteira.
 *  Pedido já quitado/pendente não é cobrado de novo. Nunca loga o token. */
export async function chargeWalletAction(
  orderId: string,
  walletType: "apple_pay" | "google_pay",
  token: string,
): Promise<{ ok: boolean; status: ChargeStatus; order?: ClientOrder; detail?: string }> {
  if (
    (walletType !== "apple_pay" && walletType !== "google_pay") ||
    typeof token !== "string" ||
    !token ||
    typeof orderId !== "string" ||
    !orderId
  ) {
    return { ok: false, status: "failed" };
  }
  try {
    const r = await resolveChargeableOrder(orderId);
    // Fail-closed: só cobra quando a decisão é explicitamente "charge".
    if (r.kind !== "charge") {
      if (r.kind === "settled") {
        const [row] = await getOrdersByIds([orderId]);
        return { ok: true, status: r.status, order: row ? toClientOrder(row) : undefined };
      }
      return { ok: false, status: "failed" };
    }
    const res = await payOrderWithWallet(orderId, walletType, token);
    if (res.uncertain) {
      // Pode ter cobrado: sem pedido na resposta o cliente vai pra "Meus pedidos"
      // (nunca "recusado") e o polling confirma.
      console.error("[chargeWallet] resultado incerto", orderId);
      return { ok: false, status: "failed" };
    }
    const [fresh] = await getOrdersByIds([orderId]);
    return {
      ok: res.status !== "failed",
      status: res.status,
      order: fresh ? toClientOrder(fresh) : undefined,
      detail: res.statusDetail,
    };
  } catch (e) {
    console.error("[chargeWallet]", e instanceof Error ? e.message : "erro");
    return { ok: false, status: "failed" };
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
