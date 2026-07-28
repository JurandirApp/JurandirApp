import type { Order, OrderLine } from "@/lib/data/panel";

/** pt-BR money: 1234.5 -> "R$ 1.234,50" (regular space, matches prototype). */
export function money(v: number): string {
  return (
    "R$ " +
    v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

export function orderTotal(o: { items: OrderLine[] }): number {
  return o.items.reduce((s, i) => s + i[0] * i[2], 0);
}

export function itemCount(o: { items: OrderLine[] }): number {
  return o.items.reduce((s, i) => s + i[0], 0);
}

/** "24/07 14:32" */
export function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "24/07/26 14:32" (audit table) */
export function fmtFull(ts: number): string {
  return new Date(ts).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ymd(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const SLUG = "quiosque-do-mar";

/** URL a QR encodes — points at the (future) client app for this spot. */
export function qrUrl(label: string): string {
  return `https://jurandir.app/${SLUG}?local=${encodeURIComponent(label)}`;
}

export function qrImg(label: string, size: number): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=10&data=${encodeURIComponent(
    qrUrl(label),
  )}`;
}

/** Random order code (client-only; used for real-time incoming demo orders). */
export function makeOrderCode(): string {
  const hex = "0123456789ABCDEF";
  return (
    "PED-" +
    Array.from({ length: 8 }, () => hex[Math.floor(Math.random() * 16)]).join("")
  );
}

export function padId(id: number, len = 3): string {
  return String(id).padStart(len, "0");
}

/** Order status → badge [bg, fg]. Label is translated (panel.status.<st>). */
export function statusColors(o: Order): [string, string] {
  if (o.st === "aguardando") return ["#ffe4e6", "#be123c"];
  if (o.st === "producao") return ["#fef3c7", "#b45309"];
  return ["#d1fae5", "#047857"];
}
