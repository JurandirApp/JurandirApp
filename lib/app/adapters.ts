import type { PaymentMethod } from "@prisma/client";
import { isPixExpired } from "@/lib/domain/pricing";
import type { AppEstablishment, PayId } from "@/lib/data/app";
import { COVER_IMG } from "@/lib/data/panel";
import type { MenuItem } from "@/lib/data/panel";
import type { ClientOrder, Share } from "@/lib/app/helpers";

const num = (v: unknown): number => Number(v ?? 0);

const APP_TO_ENUM: Record<PayId, PaymentMethod> = {
  credito: "CREDIT", debito: "DEBIT", pix: "PIX", usdc: "USDC",
};
export function appToEnum(id: PayId): PaymentMethod {
  return APP_TO_ENUM[id];
}

const ENUM_TO_APP: Record<string, PayId> = {
  CREDIT: "credito", DEBIT: "debito", PIX: "pix", USDC: "usdc",
};

type DbEst = {
  id: string; slug: string; name: string; tagline: string | null; coverImg: string | null;
  address: string | null; hours: string | null; posto: string | null;
  platformFeePct: number; serviceFeePct: number;
  whatsapp: string | null; instagram: string | null; phone: string | null; website: string | null;
};
export function toAppEstablishment(e: DbEst): AppEstablishment {
  return {
    id: e.id,
    slug: e.slug,
    name: e.name,
    tagline: e.tagline ?? "",
    cover: e.coverImg || COVER_IMG,
    address: e.address ?? "",
    hours: e.hours ?? "",
    platformFeePct: e.platformFeePct,
    serviceFeePct: e.serviceFeePct,
    posto: e.posto ?? "",
    whatsapp: e.whatsapp || "https://wa.me/5547999990000",
    instagram: { url: e.instagram ? `https://instagram.com/${e.instagram.replace(/^@/, "")}` : "#", handle: e.instagram ?? "" },
    phone: { tel: (e.phone ?? "").replace(/\D/g, ""), display: e.phone ?? "" },
    website: { url: e.website ? (e.website.startsWith("http") ? e.website : `https://${e.website}`) : "#" },
  };
}

type DbMenuItem = {
  id: string; name: string; description: string | null; price: unknown; oldPrice: unknown;
  photo: string | null; measure: number | null; unit: string | null; category: string; subcategory: string; sortOrder: number;
};
export function toAppMenuItem(m: DbMenuItem): MenuItem {
  return {
    id: m.sortOrder,
    dbId: m.id,
    name: m.name,
    desc: m.description ?? "",
    price: num(m.price),
    old: m.oldPrice == null ? null : num(m.oldPrice),
    photo: m.photo ?? "",
    measure: m.measure,
    unit: m.unit,
    cat: m.category,
    sub: m.subcategory,
  };
}

const STATUS: Record<string, ClientOrder["status"]> = {
  AWAITING_PAYMENT: "aguardando", IN_PRODUCTION: "producao", DELIVERED: "entregue",
};
type DbOrder = {
  id: string; number: number; code: string; status: string; customerName: string | null; note: string | null;
  createdAt: Date; subtotal: unknown; platformFee: unknown; serviceFee: unknown;
  items: { qty: number; name: string; unitPrice: unknown }[];
  payment: { method: string; installments: number; pixPayload: string | null; pixQrImage: string | null } | null;
  splitShares: { personIndex: number; method: string | null; paid: boolean; amount: unknown }[];
};
export function toClientOrder(o: DbOrder): ClientOrder {
  const splits: Share[] | null = o.splitShares.length
    ? o.splitShares.map((s) => ({ m: s.method ? ENUM_TO_APP[s.method] : null, amount: num(s.amount) }))
    : null;
  return {
    id: o.number,
    dbId: o.id,
    code: o.code,
    ts: o.createdAt.getTime(),
    items: o.items.map((i) => ({ name: i.name, qty: i.qty, price: num(i.unitPrice) })),
    total: num(o.subtotal),
    fee: num(o.platformFee),
    est: num(o.serviceFee),
    note: o.note ?? "",
    name: o.customerName ?? "",
    status: STATUS[o.status] ?? "aguardando",
    expired: isPixExpired({
      status: o.status,
      method: o.payment?.method ?? null,
      hasSplit: o.splitShares.length > 0,
      createdAtMs: o.createdAt.getTime(),
    }),
    pixPayload: o.payment?.pixPayload ?? undefined,
    pixQrImage: o.payment?.pixQrImage ?? undefined,
    pay: o.payment ? { id: ENUM_TO_APP[o.payment.method], parc: o.payment.installments } : null,
    splits,
  };
}
