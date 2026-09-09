import { optionLabels, type TicketData } from "./escpos";

export type OrderForTicket = {
  code: string;
  number: number;
  locationLabel: string;
  customerName: string | null;
  note: string | null;
  createdAt: Date;
  subtotal: unknown;
  platformFee: unknown;
  serviceFee: unknown;
  total: unknown;
  items: { qty: number; name: string; unitPrice: unknown; options?: unknown }[];
  establishment: { name: string };
};

const n = (v: unknown): number => Number(v ?? 0);

export function orderToTicket(o: OrderForTicket): TicketData {
  return {
    establishment: o.establishment.name,
    code: o.code,
    number: o.number,
    location: o.locationLabel,
    customer: o.customerName ?? undefined,
    timeLabel: o.createdAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    items: o.items.map((i) => ({
      qty: i.qty,
      name: i.name,
      total: n(i.unitPrice) * i.qty,
      options: optionLabels(i.options),
    })),
    subtotal: n(o.subtotal),
    platformFee: n(o.platformFee),
    serviceFee: n(o.serviceFee),
    total: n(o.total),
    note: o.note ?? undefined,
  };
}
