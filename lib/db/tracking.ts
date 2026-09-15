import { prisma } from "./prisma";
import { OrderStatus } from "@prisma/client";

export type TrackedOrder = {
  code: string;
  customerName: string;
  customerPhone: string;
  items: { name: string; qty: number }[];
  placedAt: Date;
  deliveredAt: Date | null;
  waiter: string | null;
};

export type TrackedTable = {
  label: string;
  registered: boolean; // é uma mesa/QR cadastrada (QrSpot) ou um label avulso (app/mesa digitada)
  customers: number; // clientes distintos no dia
  orderCount: number;
  orders: TrackedOrder[];
};

/**
 * Rastreio por mesa de UM dia. Só pedidos pagos (IN_PRODUCTION ou DELIVERED).
 * Agrupa por `locationLabel`; mostra TODAS as mesas cadastradas (QrSpot) mesmo
 * sem pedido no dia, e ainda os labels avulsos que tiveram pedido (app / mesa
 * digitada não cadastrada). `day` = "YYYY-MM-DD" no fuso do Brasil (UTC-3, sem
 * horário de verão desde 2019).
 */
export async function listTableTracking(
  establishmentId: string,
  day: string,
): Promise<{ tables: TrackedTable[] }> {
  const start = new Date(`${day}T03:00:00.000Z`); // 00:00 BRT
  if (Number.isNaN(start.getTime())) return { tables: [] };
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

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
        createdAt: { gte: start, lt: end },
      },
      select: {
        code: true,
        locationLabel: true,
        customerName: true,
        customerPhone: true,
        clientId: true,
        createdAt: true,
        items: { select: { name: true, qty: true } },
        // Entrega: o DELIVERED mais recente traz horário + garçom (módulo on).
        events: {
          where: { type: "DELIVERED" },
          select: { at: true, waiter: { select: { name: true } } },
          orderBy: { at: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const byLabel = new Map<string, TrackedOrder[]>();
  const custByLabel = new Map<string, Set<string>>();
  for (const o of orders) {
    const label = o.locationLabel || "Sem mesa";
    if (!byLabel.has(label)) {
      byLabel.set(label, []);
      custByLabel.set(label, new Set());
    }
    const del = o.events[0];
    byLabel.get(label)!.push({
      code: o.code,
      customerName: o.customerName ?? "",
      customerPhone: o.customerPhone ?? "",
      items: o.items.map((i) => ({ name: i.name, qty: i.qty })),
      placedAt: o.createdAt,
      deliveredAt: del?.at ?? null,
      waiter: del?.waiter?.name ?? null,
    });
    // Cliente distinto: clientId > telefone > nome > code (fallback).
    custByLabel.get(label)!.add(o.clientId || o.customerPhone || o.customerName || o.code);
  }

  const registered = new Set(spots.map((s) => s.label));
  const tables: TrackedTable[] = [];
  // 1) Todas as mesas cadastradas (mesmo sem pedidos no dia).
  for (const s of spots) {
    const os = byLabel.get(s.label) ?? [];
    tables.push({
      label: s.label,
      registered: true,
      customers: custByLabel.get(s.label)?.size ?? 0,
      orderCount: os.length,
      orders: os,
    });
  }
  // 2) Labels avulsos (app / mesa não cadastrada) que tiveram pedido.
  for (const [label, os] of byLabel) {
    if (registered.has(label)) continue;
    tables.push({
      label,
      registered: false,
      customers: custByLabel.get(label)?.size ?? 0,
      orderCount: os.length,
      orders: os,
    });
  }
  return { tables };
}
