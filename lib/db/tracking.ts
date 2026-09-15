import { prisma } from "./prisma";
import { OrderStatus } from "@prisma/client";

/** Uma mesa (ou label avulso) no RESUMO do rastreio do dia — sem os pedidos,
 *  só os números, pra tela principal ficar leve mesmo num dia lotado. */
export type TrackedTable = {
  label: string;
  registered: boolean; // mesa/QR cadastrada (QrSpot) ou label avulso (app/mesa digitada)
  customers: number; // clientes distintos no dia
  orderCount: number;
  revenue: number; // faturamento do dia nessa mesa (R$)
};

/** Um pedido dentro do detalhe de uma mesa. */
export type TrackedClientOrder = {
  number: number; // nº exibível (#161)
  code: string;
  items: { name: string; qty: number }[];
  placedAt: Date;
  deliveredAt: Date | null;
  waiter: string | null;
  total: number;
};

/** Um cliente (pessoa) de uma mesa, com todos os pedidos dele no dia. */
export type TrackedClient = {
  key: string; // chave de agrupamento (clientId > telefone > nome > code)
  name: string;
  phone: string;
  orderCount: number;
  total: number;
  orders: TrackedClientOrder[];
};

/** Detalhe de UMA mesa num dia: clientes (agrupados) e seus pedidos. */
export type TableDetail = {
  label: string;
  registered: boolean;
  customers: number;
  orderCount: number;
  total: number;
  clients: TrackedClient[];
};

/** Janela [00:00, 24:00) do dia no fuso do Brasil (UTC-3, sem horário de verão
 *  desde 2019). Retorna null se `day` for inválido. */
function dayWindow(day: string): { start: Date; end: Date } | null {
  const start = new Date(`${day}T03:00:00.000Z`); // 00:00 BRT
  if (Number.isNaN(start.getTime())) return null;
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/** Chave de cliente distinto: clientId > telefone > nome > code (fallback). */
function clientKey(o: {
  clientId: string | null;
  customerPhone: string | null;
  customerName: string | null;
  code: string;
}): string {
  return o.clientId || o.customerPhone || o.customerName || o.code;
}

/**
 * RESUMO por mesa de um dia. Só pedidos pagos (IN_PRODUCTION ou DELIVERED).
 * Mostra TODAS as mesas cadastradas (QrSpot) mesmo sem pedido, + labels avulsos
 * que tiveram pedido. Não traz os pedidos — isso é o `listTableDetail`.
 * `day` = "YYYY-MM-DD" no fuso do Brasil.
 */
export async function listTableTracking(
  establishmentId: string,
  day: string,
): Promise<{ tables: TrackedTable[] }> {
  const win = dayWindow(day);
  if (!win) return { tables: [] };

  const [spots, orders] = await Promise.all([
    prisma.qrSpot.findMany({
      where: { establishmentId },
      select: { label: true },
      orderBy: { label: "asc" },
    }),
    prisma.order.findMany({
      where: {
        establishmentId,
        status: { in: [OrderStatus.IN_PRODUCTION, OrderStatus.DELIVERED] },
        createdAt: { gte: win.start, lt: win.end },
      },
      select: {
        locationLabel: true,
        customerName: true,
        customerPhone: true,
        clientId: true,
        code: true,
        total: true,
      },
    }),
  ]);

  type Agg = { count: number; revenue: number; customers: Set<string> };
  const byLabel = new Map<string, Agg>();
  for (const o of orders) {
    const label = o.locationLabel || "Sem mesa";
    let agg = byLabel.get(label);
    if (!agg) {
      agg = { count: 0, revenue: 0, customers: new Set() };
      byLabel.set(label, agg);
    }
    agg.count += 1;
    agg.revenue += Number(o.total);
    agg.customers.add(clientKey(o));
  }

  const registered = new Set(spots.map((s) => s.label));
  const tables: TrackedTable[] = [];
  // 1) Todas as mesas cadastradas (mesmo sem pedidos no dia).
  for (const s of spots) {
    const agg = byLabel.get(s.label);
    tables.push({
      label: s.label,
      registered: true,
      customers: agg?.customers.size ?? 0,
      orderCount: agg?.count ?? 0,
      revenue: agg?.revenue ?? 0,
    });
  }
  // 2) Labels avulsos (app / mesa não cadastrada) que tiveram pedido.
  for (const [label, agg] of byLabel) {
    if (registered.has(label)) continue;
    tables.push({
      label,
      registered: false,
      customers: agg.customers.size,
      orderCount: agg.count,
      revenue: agg.revenue,
    });
  }
  return { tables };
}

/**
 * DETALHE de uma mesa num dia: os pedidos pagos (IN_PRODUCTION|DELIVERED)
 * daquela `label`, agrupados por cliente (pessoa). Clientes ordenados pela
 * atividade mais recente; pedidos de cada um, do mais novo pro mais antigo.
 */
export async function listTableDetail(
  establishmentId: string,
  day: string,
  label: string,
): Promise<TableDetail> {
  const win = dayWindow(day);
  const base: TableDetail = { label, registered: false, customers: 0, orderCount: 0, total: 0, clients: [] };
  if (!win) return base;

  const [isRegistered, orders] = await Promise.all([
    prisma.qrSpot.count({ where: { establishmentId, label } }),
    prisma.order.findMany({
      where: {
        establishmentId,
        locationLabel: label,
        status: { in: [OrderStatus.IN_PRODUCTION, OrderStatus.DELIVERED] },
        createdAt: { gte: win.start, lt: win.end },
      },
      select: {
        number: true,
        code: true,
        customerName: true,
        customerPhone: true,
        clientId: true,
        createdAt: true,
        total: true,
        items: { select: { name: true, qty: true } },
        events: {
          where: { type: "DELIVERED" },
          select: { at: true, waiter: { select: { name: true } } },
          orderBy: { at: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const byClient = new Map<string, TrackedClient>();
  let total = 0;
  for (const o of orders) {
    const key = clientKey(o);
    const del = o.events[0];
    const order: TrackedClientOrder = {
      number: o.number,
      code: o.code,
      items: o.items.map((i) => ({ name: i.name, qty: i.qty })),
      placedAt: o.createdAt,
      deliveredAt: del?.at ?? null,
      waiter: del?.waiter?.name ?? null,
      total: Number(o.total),
    };
    total += order.total;
    let c = byClient.get(key);
    if (!c) {
      c = {
        key,
        name: o.customerName ?? "",
        phone: o.customerPhone ?? "",
        orderCount: 0,
        total: 0,
        orders: [],
      };
      byClient.set(key, c);
    }
    c.orders.push(order); // já vem do mais novo pro mais antigo (orderBy desc)
    c.orderCount += 1;
    c.total += order.total;
  }

  // Clientes ordenados pela atividade mais recente (1º pedido do bloco = mais novo).
  const clients = [...byClient.values()].sort(
    (a, b) => (b.orders[0]?.placedAt.getTime() ?? 0) - (a.orders[0]?.placedAt.getTime() ?? 0),
  );

  return {
    label,
    registered: isRegistered > 0,
    customers: byClient.size,
    orderCount: orders.length,
    total,
    clients,
  };
}
