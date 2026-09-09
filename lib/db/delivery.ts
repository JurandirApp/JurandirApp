import { prisma } from "./prisma";
import { isOrderFullyDelivered, deliveryCode } from "@/lib/domain/delivery";

/** Bar marca N unidades prontas. Transação: lê o item (escopo estab), valida que
 *  há "preparando" suficiente, incrementa qtyReady e grava OrderEvent(READY). */
export async function markItemReady(establishmentId: string, orderItemId: string, qty: number) {
  return prisma.$transaction(async (tx) => {
    const it = await tx.orderItem.findFirst({
      where: { id: orderItemId, order: { establishmentId } },
      select: { id: true, orderId: true, qty: true, qtyReady: true, qtyOutForDelivery: true, qtyDelivered: true },
    });
    if (!it) return { ok: false as const };
    const preparing = it.qty - (it.qtyReady + it.qtyOutForDelivery + it.qtyDelivered);
    if (qty > preparing) return { ok: false as const };
    await tx.orderItem.update({ where: { id: it.id }, data: { qtyReady: { increment: qty } } });
    await tx.orderEvent.create({ data: { orderId: it.orderId, orderItemId: it.id, type: "READY", qty } });
    return { ok: true as const };
  }, { isolationLevel: "Serializable" });
}

export async function listReadyItems(establishmentId: string) {
  const rows = await prisma.orderItem.findMany({
    where: { order: { establishmentId }, qtyReady: { gt: 0 } },
    select: {
      id: true, name: true, qtyReady: true,
      order: { select: { id: true, locationLabel: true, customerName: true, createdAt: true } },
    },
    orderBy: { order: { createdAt: "asc" } },
  });
  return rows.map((r) => ({
    orderId: r.order.id, orderItemId: r.id, name: r.name,
    mesa: r.order.locationLabel, cliente: r.order.customerName ?? "", qtyReady: r.qtyReady,
  }));
}

/** Pegar: decremento ATÔMICO guardado (updateMany é um único UPDATE). count===0
 *  → outro garçom já levou. Grava OrderEvent(PICKED). */
export async function pickItem(establishmentId: string, waiterId: string, orderItemId: string, qty: number) {
  return prisma.$transaction(async (tx) => {
    const r = await tx.orderItem.updateMany({
      where: { id: orderItemId, order: { establishmentId }, qtyReady: { gte: qty } },
      data: { qtyReady: { decrement: qty }, qtyOutForDelivery: { increment: qty } },
    });
    if (r.count === 0) return { ok: false as const };
    const it = await tx.orderItem.findUnique({ where: { id: orderItemId }, select: { orderId: true } });
    if (it) await tx.orderEvent.create({ data: { orderId: it.orderId, orderItemId, type: "PICKED", qty, waiterId } });
    return { ok: true as const };
  });
}

/** Entregar: valida código (4 últimos do telefone OU fallback do pedido),
 *  decremento atômico de qtyOutForDelivery→qtyDelivered, grava DELIVERED, e
 *  fecha o pedido se todas as linhas foram entregues. */
export async function deliverItem(
  establishmentId: string, waiterId: string, orderItemId: string, qty: number, code: string,
) {
  const it = await prisma.orderItem.findFirst({
    where: { id: orderItemId, order: { establishmentId } },
    select: { id: true, orderId: true, order: { select: { customerPhone: true } } },
  });
  if (!it) return { ok: false as const, error: "notfound" as const };
  // Fallback: se não há telefone, o código foi salvo no evento de criação (ver Task 8).
  const fallback = await pedidoFallbackCode(it.orderId);
  if (code !== deliveryCode(it.order.customerPhone, fallback)) {
    return { ok: false as const, error: "code" as const };
  }
  return prisma.$transaction(async (tx) => {
    const r = await tx.orderItem.updateMany({
      where: { id: orderItemId, qtyOutForDelivery: { gte: qty } },
      data: { qtyOutForDelivery: { decrement: qty }, qtyDelivered: { increment: qty } },
    });
    if (r.count === 0) return { ok: false as const, error: "qty" as const };
    await tx.orderEvent.create({ data: { orderId: it.orderId, orderItemId, type: "DELIVERED", qty, waiterId } });
    // Completou o pedido?
    const items = await tx.orderItem.findMany({ where: { orderId: it.orderId }, select: { qty: true, qtyDelivered: true } });
    const done = isOrderFullyDelivered(items);
    if (done) await tx.order.update({ where: { id: it.orderId }, data: { status: "DELIVERED" } });
    return { ok: true as const, orderDone: done };
  });
}

/** Código de fallback do pedido (só usado quando não há telefone): armazenado
 *  como um OrderEvent leve na criação (ver Task 8) ou derivado de forma estável. */
async function pedidoFallbackCode(orderId: string): Promise<string | null> {
  const o = await prisma.order.findUnique({ where: { id: orderId }, select: { code: true } });
  // Estável e sem telefone: 4 últimos dígitos do "number" do pedido, zero-pad.
  const n = await prisma.order.findUnique({ where: { id: orderId }, select: { number: true } });
  return n ? String(n.number).slice(-4).padStart(4, "0") : (o?.code ?? null);
}
