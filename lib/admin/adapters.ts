import type { AdminEst, AdminOrder, PayKey, SearchEvent } from "@/lib/data/admin";
import type { MonthlyStatLite } from "@/lib/admin/scale";

const num = (v: unknown): number => Number(v ?? 0);

export function methodToKey(m: string): string {
  return { CREDIT: "credito", DEBIT: "debito", PIX: "pix", USDC: "usdc" }[m] ?? m.toLowerCase();
}

type DbEst = {
  id: string; name: string; owner: string; city: string; neighborhood: string | null;
  type: string; plan: string; status: string; createdAt: Date; platformFeePct: number;
  posto: string | null; radiusM: number | null; phone: string | null; email: string | null;
  website: string | null; whatsapp: string | null; instagram: string | null; logoImg: string | null; isLive: boolean;
  paymentProvider: string; paymentOnboarded: boolean;
  printerIp: string | null; printEnabled: boolean; printAgentToken: string | null;
  users?: { email: string }[];
};

/** DB establishment (+ its current-month stat) → AdminEst view-model. */
export function toAdminEst(db: DbEst, cur?: MonthlyStatLite): AdminEst {
  return {
    id: db.id,
    name: db.name,
    owner: db.owner,
    city: db.city,
    neigh: db.neighborhood ?? "",
    tipo: db.type,
    plan: db.plan,
    status: db.status === "ACTIVE" ? "ativo" : "pendente",
    since: db.createdAt.toISOString().slice(0, 10),
    fee: String(db.platformFeePct),
    orders: cur?.orders ?? 0,
    revenue: cur?.gmv ?? 0,
    byPay: {
      credito: cur?.byCredit ?? 0,
      debito: cur?.byDebit ?? 0,
      pix: cur?.byPix ?? 0,
      usdc: cur?.byUsdc ?? 0,
    },
    phone: db.phone ?? "",
    email: db.email ?? "",
    website: db.website ?? "",
    whatsapp: db.whatsapp ?? "",
    instagram: db.instagram ?? "",
    logoImg: db.logoImg ?? "",
    user: db.users?.[0]?.email ?? "",
    password: "",
    posto: db.posto ?? "",
    radius: db.radiusM != null ? String(db.radiusM) : "",
    isLive: db.isLive,
    paymentProvider: db.paymentProvider === "MERCADO_PAGO" ? "MERCADO_PAGO" : "ASAAS",
    paymentOnboarded: db.paymentOnboarded,
    printerIp: db.printerIp ?? "",
    printEnabled: db.printEnabled,
    hasPrintToken: Boolean(db.printAgentToken),
  };
}

type DbStat = {
  establishmentId: string; year: number; month: number; orders: number;
  gmv: unknown; byCredit: unknown; byDebit: unknown; byPix: unknown; byUsdc: unknown;
};
export function toMonthlyStatLite(s: DbStat): MonthlyStatLite {
  return {
    establishmentId: s.establishmentId,
    year: s.year,
    month: s.month,
    orders: s.orders,
    gmv: num(s.gmv),
    byCredit: num(s.byCredit),
    byDebit: num(s.byDebit),
    byPix: num(s.byPix),
    byUsdc: num(s.byUsdc),
  };
}

type DbOrder = {
  id: string; code: string; establishmentId: string; createdAt: Date; total: unknown;
  customerName: string | null;
  items: { qty: number; name: string }[];
  payment: { method: string; cardMask: string | null } | null;
  splitShares: { id: string }[];
};
export function toAdminOrder(o: DbOrder, index: number): AdminOrder {
  const m = o.payment ? methodToKey(o.payment.method) : o.splitShares.length ? "split" : "—";
  return {
    id: index,
    code: o.code,
    est: o.establishmentId,
    ts: o.createdAt.getTime(),
    m,
    card: o.payment?.cardMask ?? "",
    total: num(o.total),
    items: o.items.map((i) => `${i.qty}× ${i.name}`).join(", "),
    cust: o.customerName ?? "",
  };
}

type DbEvent = {
  city: string | null; neighborhood: string | null; cuisine: string | null;
  type: string | null; createdAt: Date;
};
/** One DB search event → one `{field, value, day}` per populated dimension. */
export function toSearchEventRows(ev: DbEvent): SearchEvent[] {
  const day = new Date(ev.createdAt).getDate() - 1;
  const dims: [string, string | null][] = [
    ["city", ev.city],
    ["neighborhood", ev.neighborhood],
    ["cuisine", ev.cuisine],
    ["tipo", ev.type],
  ];
  return dims
    .filter(([, v]) => !!v)
    .map(([field, value]) => ({ field, value: value as string, day }));
}

export type { PayKey };
