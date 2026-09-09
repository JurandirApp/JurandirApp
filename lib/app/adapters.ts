import type { PaymentMethod } from "@prisma/client";
import { isPixExpired, round2 } from "@/lib/domain/pricing";
import { deliveryCode } from "@/lib/domain/delivery";
import { optionLabels } from "@/lib/print/escpos";
import type { AppEstablishment, PayId } from "@/lib/data/app";
import { COVER_IMG } from "@/lib/data/panel";
import type { MenuItem } from "@/lib/data/panel";
import type { ClientOrder, Share } from "@/lib/app/helpers";

const num = (v: unknown): number => Number(v ?? 0);

/** Hash estável de string → número positivo. O `id` numérico do item (chave do
 *  carrinho) precisa ser ÚNICO por item — antes usávamos `sortOrder`, que se
 *  repete (default 0) e fazia todos os itens colidirem no mesmo id. O dbId (cuid)
 *  é único e estável, então derivamos o id numérico dele. */
function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

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
  id: string; slug: string; name: string; tagline: string | null; coverImg: string | null; logoImg: string | null;
  address: string | null; hours: string | null; posto: string | null;
  platformFeePct: number; serviceFeePct: number;
  gatewayCredit: string; pagarmeRecipientId: string | null;
  whatsapp: string | null; instagram: string | null; phone: string | null; website: string | null;
};
export function toAppEstablishment(e: DbEst): AppEstablishment {
  return {
    id: e.id,
    slug: e.slug,
    name: e.name,
    tagline: e.tagline ?? "",
    cover: e.coverImg || COVER_IMG,
    logo: e.logoImg ?? null,
    address: e.address ?? "",
    hours: e.hours ?? "",
    platformFeePct: e.platformFeePct,
    serviceFeePct: e.serviceFeePct,
    posto: e.posto ?? "",
    // Carteira nativa só quando o crédito é Pagar.me E o bar tem recebedor próprio
    // (senão o split não paga o bar / o token não é cobrável).
    walletPay: e.gatewayCredit === "PAGARME" && Boolean(e.pagarmeRecipientId),
    whatsapp: e.whatsapp || "https://wa.me/5547999990000",
    instagram: { url: e.instagram ? `https://instagram.com/${e.instagram.replace(/^@/, "")}` : "#", handle: e.instagram ?? "" },
    phone: { tel: (e.phone ?? "").replace(/\D/g, ""), display: e.phone ?? "" },
    website: { url: e.website ? (e.website.startsWith("http") ? e.website : `https://${e.website}`) : "#" },
  };
}

type DbOptionGroup = {
  id: string; name: string; required: boolean; minSelect: number; maxSelect: number;
  options: { id: string; name: string; priceDelta: unknown; active: boolean }[];
};
type DbMenuItem = {
  id: string; name: string; description: string | null; price: unknown; oldPrice: unknown;
  photo: string | null; measure: number | null; unit: string | null; category: string; subcategory: string; sortOrder: number;
  optionGroups?: DbOptionGroup[];
};
export function toAppMenuItem(m: DbMenuItem): MenuItem {
  // Cliente só vê opções ativas; grupo que ficou sem opção ativa é omitido.
  const groups = (m.optionGroups ?? [])
    .map((g) => ({
      id: g.id,
      name: g.name,
      required: g.required,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      options: g.options
        .filter((o) => o.active)
        .map((o) => ({ id: o.id, name: o.name, priceDelta: num(o.priceDelta), active: o.active })),
    }))
    .filter((g) => g.options.length > 0);
  return {
    id: hashId(m.id),
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
    groups,
  };
}

const STATUS: Record<string, ClientOrder["status"]> = {
  AWAITING_PAYMENT: "aguardando", IN_PRODUCTION: "producao", DELIVERED: "entregue",
};
type DbOrder = {
  id: string; number: number; code: string; status: string; customerName: string | null; note: string | null;
  customerPhone: string | null;
  establishment?: { waiterModuleEnabled: boolean } | null;
  createdAt: Date; subtotal: unknown; platformFee: unknown; serviceFee: unknown;
  items: {
    qty: number; name: string; unitPrice: unknown; options?: unknown;
    qtyReady?: number; qtyOutForDelivery?: number; qtyDelivered?: number;
  }[];
  payment: { method: string; installments: number; pixPayload: string | null; pixQrImage: string | null } | null;
  splitShares: {
    personIndex: number;
    method: string | null;
    paid: boolean;
    amount: unknown;
    pixPayload?: string | null;
    pixQrImage?: string | null;
  }[];
};
export function toClientOrder(o: DbOrder): ClientOrder {
  const splits: Share[] | null = o.splitShares.length
    ? o.splitShares.map((s) => ({
        m: s.method ? ENUM_TO_APP[s.method] : null,
        amount: num(s.amount),
        paid: s.paid,
        pixPayload: s.pixPayload ?? undefined,
        pixQrImage: s.pixQrImage ?? undefined,
      }))
    : null;
  return {
    id: o.number,
    dbId: o.id,
    code: o.code,
    // Código de entrega só quando o Módulo do Garçom está ligado no bar; senão
    // não há garçom/entrega e o código só confundiria o cliente.
    code4: o.establishment?.waiterModuleEnabled
      ? deliveryCode(o.customerPhone, String(o.number).slice(-4).padStart(4, "0"))
      : undefined,
    ts: o.createdAt.getTime(),
    items: o.items.map((i) => ({
      name: i.name, qty: i.qty, price: num(i.unitPrice), options: optionLabels(i.options),
      ready: num(i.qtyReady), outForDelivery: num(i.qtyOutForDelivery), delivered: num(i.qtyDelivered),
    })),
    total: num(o.subtotal),
    fee: num(o.platformFee),
    est: num(o.serviceFee),
    // O que o cliente paga = subtotal + taxa do bar + comissão (bate com computeTotals).
    grand: round2(num(o.subtotal) + num(o.serviceFee) + num(o.platformFee)),
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
