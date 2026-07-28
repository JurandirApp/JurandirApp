import { prisma } from "./prisma";
import { renderTicket, type TicketData } from "@/lib/print/escpos";
import { orderToTicket } from "@/lib/print/ticket";

const toB64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");

/** Enfileira a comanda de um pedido. Idempotente por pedido; só se printEnabled. */
export async function enqueuePrintJob(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      establishment: { select: { id: true, name: true, printEnabled: true } },
    },
  });
  if (!order || !order.establishment.printEnabled) return;
  const existing = await prisma.printJob.findFirst({ where: { orderId, kind: "ORDER" } });
  if (existing) return;
  const payloadB64 = toB64(renderTicket(orderToTicket(order)));
  await prisma.printJob.create({
    data: { establishmentId: order.establishment.id, orderId, kind: "ORDER", payloadB64 },
  });
}

/** Enfileira uma comanda de teste (botão do admin). */
export async function enqueueTestJob(establishmentId: string): Promise<void> {
  const est = await prisma.establishment.findUnique({
    where: { id: establishmentId },
    select: { name: true },
  });
  if (!est) return;
  const sample: TicketData = {
    establishment: est.name,
    code: "PED-TESTE",
    number: 0,
    location: "Balcao",
    timeLabel: "00:00",
    items: [{ qty: 1, name: "Teste de impressao", total: 0 }],
    subtotal: 0,
    platformFee: 0,
    serviceFee: 0,
    total: 0,
    note: "Comanda de teste Jurandir",
  };
  await prisma.printJob.create({
    data: { establishmentId, kind: "TEST", payloadB64: toB64(renderTicket(sample)) },
  });
}

/** Reimpressão manual da comanda (botão "Imprimir" no painel). Cria um job novo
 *  mesmo que já exista um pro pedido — o dono pediu de novo — e independe de
 *  printEnabled. Retorna false se o pedido não for do estabelecimento. */
export async function enqueueOrderReprint(
  orderId: string,
  establishmentId: string,
): Promise<boolean> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      establishment: { select: { id: true, name: true } },
    },
  });
  if (!order || order.establishment.id !== establishmentId) return false;
  const payloadB64 = toB64(renderTicket(orderToTicket(order)));
  await prisma.printJob.create({
    data: { establishmentId, orderId, kind: "ORDER", payloadB64 },
  });
  return true;
}

export function takePendingJobs(establishmentId: string, limit = 5) {
  return prisma.printJob.findMany({
    where: { establishmentId, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, payloadB64: true },
  });
}

export async function ackJob(jobId: string, ok: boolean, error?: string): Promise<void> {
  const job = await prisma.printJob.findUnique({ where: { id: jobId }, select: { attempts: true } });
  if (!job) return;
  if (ok) {
    await prisma.printJob.update({
      where: { id: jobId },
      data: { status: "PRINTED", printedAt: new Date(), error: null },
    });
  } else {
    const attempts = job.attempts + 1;
    await prisma.printJob.update({
      where: { id: jobId },
      data: { attempts, error: error ?? "erro", status: attempts >= 5 ? "FAILED" : "PENDING" },
    });
  }
}
