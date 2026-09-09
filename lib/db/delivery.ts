import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { isOrderFullyDelivered, deliveryCode } from "@/lib/domain/delivery";

/** Bar marca N unidades prontas. Transação: lê o item (escopo estab + pedido EM
 *  PRODUÇÃO), valida que há "preparando" suficiente, incrementa qtyReady e grava
 *  OrderEvent(READY). Só pedidos pagos (IN_PRODUCTION) entram na fila do garçom —
 *  senão um pedido não pago poderia ser entregue e marcado como concluído. */
export async function markItemReady(establishmentId: string, orderItemId: string, qty: number) {
  try {
    return await prisma.$transaction(async (tx) => {
      const it = await tx.orderItem.findFirst({
        where: { id: orderItemId, order: { establishmentId, status: "IN_PRODUCTION" } },
        select: { id: true, orderId: true, qty: true, qtyReady: true, qtyOutForDelivery: true, qtyDelivered: true },
      });
      if (!it) return { ok: false as const };
      const preparing = it.qty - (it.qtyReady + it.qtyOutForDelivery + it.qtyDelivered);
      if (qty > preparing) return { ok: false as const };
      await tx.orderItem.update({ where: { id: it.id }, data: { qtyReady: { increment: qty } } });
      await tx.orderEvent.create({ data: { orderId: it.orderId, orderItemId: it.id, type: "READY", qty } });
      return { ok: true as const };
    }, { isolationLevel: "Serializable" });
  } catch (e) {
    // Conflito de serialização (dois marcando o MESMO item ao mesmo tempo) → o
    // Serializable aborta uma das transações, preservando qtyReady+…≤qty. Falha
    // graciosa (o painel mostra o toast e reenvia) em vez de 500/rejeição crua.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") {
      return { ok: false as const };
    }
    throw e;
  }
}

/** Fila do garçom: itens PRONTOS (qtyReady>0) e/ou JÁ EM ENTREGA
 *  (qtyOutForDelivery>0) de pedidos em produção. Os "em entrega" permitem
 *  retomar a confirmação por código quando o garçom saiu da tela sem confirmar
 *  (senão as unidades ficariam "a caminho" pra sempre). */
export async function listReadyItems(establishmentId: string) {
  const rows = await prisma.orderItem.findMany({
    where: {
      order: { establishmentId, status: "IN_PRODUCTION" },
      OR: [{ qtyReady: { gt: 0 } }, { qtyOutForDelivery: { gt: 0 } }],
    },
    select: {
      id: true, name: true, qtyReady: true, qtyOutForDelivery: true,
      order: { select: { id: true, locationLabel: true, customerName: true, createdAt: true } },
    },
    orderBy: { order: { createdAt: "asc" } },
  });
  return rows.map((r) => ({
    orderId: r.order.id, orderItemId: r.id, name: r.name,
    mesa: r.order.locationLabel, cliente: r.order.customerName ?? "",
    qtyReady: r.qtyReady, qtyOutForDelivery: r.qtyOutForDelivery,
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
  // 1) Movimento do contador + auditoria, atômicos numa transação.
  const moved = await prisma.$transaction(async (tx) => {
    const r = await tx.orderItem.updateMany({
      where: { id: orderItemId, qtyOutForDelivery: { gte: qty } },
      data: { qtyOutForDelivery: { decrement: qty }, qtyDelivered: { increment: qty } },
    });
    if (r.count === 0) return { ok: false as const, error: "qty" as const };
    await tx.orderEvent.create({ data: { orderId: it.orderId, orderItemId, type: "DELIVERED", qty, waiterId } });
    return { ok: true as const };
  });
  if (!moved.ok) return moved;
  // 2) Completude FORA da transação de movimento: a leitura roda contra o estado
  //    JÁ COMMITADO, então o garçom que confirma a última entrega enxerga todas
  //    as linhas — imune à corrida entre entregas de LINHAS DIFERENTES (que a
  //    checagem dentro da tx, em READ COMMITTED, deixava ambos sub-contarem e o
  //    pedido nunca fechava). O flip é idempotente (guardado por status), então
  //    dois garçons chegando aqui é inofensivo. Só IN_PRODUCTION→DELIVERED.
  const items = await prisma.orderItem.findMany({
    where: { orderId: it.orderId },
    select: { qty: true, qtyDelivered: true },
  });
  const done = isOrderFullyDelivered(items);
  if (done) {
    await prisma.order.updateMany({
      where: { id: it.orderId, status: "IN_PRODUCTION" },
      data: { status: "DELIVERED" },
    });
  }
  return { ok: true as const, orderDone: done };
}

/** Código de fallback do pedido (só usado quando não há telefone): 4 últimos
 *  dígitos do "number" do pedido, zero-pad — estável e igual ao `code4` que o
 *  cliente vê no app. */
async function pedidoFallbackCode(orderId: string): Promise<string | null> {
  const o = await prisma.order.findUnique({ where: { id: orderId }, select: { code: true } });
  const n = await prisma.order.findUnique({ where: { id: orderId }, select: { number: true } });
  return n ? String(n.number).slice(-4).padStart(4, "0") : (o?.code ?? null);
}

/** Um evento da timeline do pedido: os reais (OrderEvent: READY/PICKED/DELIVERED)
 *  mais os sintéticos derivados de `Order.createdAt` (realizado) e
 *  `Payment.confirmedAt` (pago / em produção) — ver spec §9. */
export type TimelineEvent = {
  id: string;
  type: "CREATED" | "PAID" | "IN_PRODUCTION" | "READY" | "PICKED" | "DELIVERED";
  at: Date;
  qty: number | null;
  waiter: { name: string } | null;
};

/** Monta a timeline (item 7 da spec) de um pedido: sintetiza "realizado" (criação)
 *  e "pago"/"em produção" (confirmação do pagamento) a partir dos timestamps do
 *  Order/Payment e mescla com os OrderEvent reais, tudo ordenado por hora. Scoped
 *  por estabelecimento. Cobre pedidos antigos sem depender de OrderEvents PAID. */
export async function buildOrderTimeline(orderId: string, establishmentId: string): Promise<TimelineEvent[]> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, establishmentId },
    select: { createdAt: true, payment: { select: { confirmedAt: true } } },
  });
  if (!order) return [];
  const events = await prisma.orderEvent.findMany({
    where: { orderId, order: { establishmentId } },
    orderBy: { at: "asc" },
    include: { waiter: { select: { name: true } } },
  });
  const synth: TimelineEvent[] = [
    { id: "created", type: "CREATED", at: order.createdAt, qty: null, waiter: null },
  ];
  if (order.payment?.confirmedAt) {
    synth.push({ id: "paid", type: "PAID", at: order.payment.confirmedAt, qty: null, waiter: null });
    synth.push({ id: "production", type: "IN_PRODUCTION", at: order.payment.confirmedAt, qty: null, waiter: null });
  }
  const real: TimelineEvent[] = events.map((e) => ({
    id: e.id, type: e.type, at: e.at, qty: e.qty, waiter: e.waiter,
  }));
  // Sort estável (V8): eventos de mesma hora mantêm a ordem de inserção
  // (created < paid < production < …reais), então "Pago" vem antes de "Em produção".
  return [...synth, ...real].sort((a, b) => a.at.getTime() - b.at.getTime());
}
