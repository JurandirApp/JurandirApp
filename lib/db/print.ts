import { prisma } from "./prisma";
import { renderPrepTicket, type PrepTicketData } from "@/lib/print/escpos";

const toB64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");
const timeLabel = (d: Date): string =>
  d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

type OrderItemRow = { menuItemId: string | null; name: string; qty: number };
type PrinterRow = { id: string; name: string; categories: string[]; isDefault: boolean };
type OrderRow = {
  id: string;
  code: string;
  number: number;
  locationLabel: string;
  customerName: string | null;
  note: string | null;
  createdAt: Date;
  items: OrderItemRow[];
};

/** Mapa menuItemId → categoria (pra rotear cada item pra impressora certa). */
async function categoryByItemId(items: OrderItemRow[]): Promise<Map<string, string>> {
  const ids = items.map((i) => i.menuItemId).filter((x): x is string => Boolean(x));
  if (ids.length === 0) return new Map();
  const menu = await prisma.menuItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, category: true },
  });
  return new Map(menu.map((m) => [m.id, m.category]));
}

/** Escolhe a impressora de um item: a que tem a categoria na lista dela; senão a
 *  marcada como padrão; senão a primeira. Nunca deixa um item sem destino. */
function pickPrinter(category: string | null, printers: PrinterRow[]): PrinterRow {
  if (category) {
    const match = printers.find((p) => p.categories.includes(category));
    if (match) return match;
  }
  return printers.find((p) => p.isDefault) ?? printers[0];
}

function groupByPrinter(
  items: OrderItemRow[],
  catByItem: Map<string, string>,
  printers: PrinterRow[],
): { printer: PrinterRow; items: OrderItemRow[] }[] {
  const groups = new Map<string, { printer: PrinterRow; items: OrderItemRow[] }>();
  for (const it of items) {
    const cat = it.menuItemId ? (catByItem.get(it.menuItemId) ?? null) : null;
    const printer = pickPrinter(cat, printers);
    const g = groups.get(printer.id) ?? { printer, items: [] };
    g.items.push(it);
    groups.set(printer.id, g);
  }
  return [...groups.values()];
}

/** Cria uma comanda de produção (sem valor) por impressora que tenha itens.
 *  Retorna quantas comandas criou. */
async function createOrderJobs(
  order: OrderRow,
  establishmentId: string,
  establishmentName: string,
): Promise<number> {
  const printers = await prisma.printer.findMany({
    where: { establishmentId, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, categories: true, isDefault: true },
  });
  if (printers.length === 0) return 0;
  const catByItem = await categoryByItemId(order.items);
  const groups = groupByPrinter(order.items, catByItem, printers);
  for (const { printer, items } of groups) {
    const data: PrepTicketData = {
      establishment: establishmentName,
      station: printer.name,
      code: order.code,
      number: order.number,
      location: order.locationLabel,
      customer: order.customerName ?? undefined,
      timeLabel: timeLabel(order.createdAt),
      items: items.map((i) => ({ qty: i.qty, name: i.name })),
      note: order.note ?? undefined,
    };
    await prisma.printJob.create({
      data: {
        establishmentId,
        printerId: printer.id,
        orderId: order.id,
        kind: "ORDER",
        payloadB64: toB64(renderPrepTicket(data)),
      },
    });
  }
  return groups.length;
}

/** Enfileira as comandas de um pedido (uma por estação). Idempotente por pedido;
 *  só se printEnabled e houver ao menos uma impressora ativa. */
export async function enqueuePrintJob(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { select: { menuItemId: true, name: true, qty: true } },
      establishment: { select: { id: true, name: true, printEnabled: true } },
    },
  });
  if (!order || !order.establishment.printEnabled) return;
  const existing = await prisma.printJob.findFirst({ where: { orderId, kind: "ORDER" } });
  if (existing) return;
  await createOrderJobs(order, order.establishment.id, order.establishment.name);
}

/** Reimpressão manual (botão "Imprimir" no painel). Cria comandas novas mesmo que
 *  já existam pro pedido, e independe de printEnabled. Retorna false se o pedido
 *  não for do estabelecimento. */
export async function enqueueOrderReprint(
  orderId: string,
  establishmentId: string,
): Promise<boolean> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { select: { menuItemId: true, name: true, qty: true } },
      establishment: { select: { id: true, name: true } },
    },
  });
  if (!order || order.establishment.id !== establishmentId) return false;
  await createOrderJobs(order, establishmentId, order.establishment.name);
  return true;
}

/** Enfileira uma comanda de teste numa impressora específica (ou na padrão/primeira). */
export async function enqueueTestJob(
  establishmentId: string,
  printerId?: string,
): Promise<void> {
  const est = await prisma.establishment.findUnique({
    where: { id: establishmentId },
    select: { name: true },
  });
  if (!est) return;
  const printer = printerId
    ? await prisma.printer.findFirst({ where: { id: printerId, establishmentId } })
    : await prisma.printer.findFirst({
        where: { establishmentId, active: true },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      });
  const sample: PrepTicketData = {
    establishment: est.name,
    station: printer?.name ?? "Teste",
    code: "TESTE",
    number: 0,
    location: "Balcao",
    timeLabel: "00:00",
    items: [{ qty: 1, name: "Teste de impressao" }],
    note: "Comanda de teste Jurandir",
  };
  await prisma.printJob.create({
    data: {
      establishmentId,
      printerId: printer?.id ?? null,
      kind: "TEST",
      payloadB64: toB64(renderPrepTicket(sample)),
    },
  });
}

/** Comandas pendentes do estabelecimento, já com o alvo (impressora) pro agente. */
export function takePendingJobs(establishmentId: string, limit = 5) {
  return prisma.printJob.findMany({
    where: { establishmentId, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      payloadB64: true,
      printer: { select: { connection: true, target: true, port: true } },
    },
  });
}

export async function ackJob(jobId: string, ok: boolean, error?: string): Promise<void> {
  const job = await prisma.printJob.findUnique({
    where: { id: jobId },
    select: { attempts: true },
  });
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
