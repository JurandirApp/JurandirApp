import { isPixExpired } from "@/lib/domain/pricing";
import type { MonthlyStatLite } from "@/lib/admin/scale";
import type {
  MenuItem,
  Order,
  OrderLine,
  PanelPrintJob,
  PayMethod,
  ProfileForm,
  Qr,
} from "@/lib/data/panel";

const num = (v: unknown): number => Number(v ?? 0);

export function toPanelPrintJob(j: {
  id: string;
  kind: string;
  status: string;
  error: string | null;
  createdAt: Date;
  code: string;
}): PanelPrintJob {
  return {
    id: j.id,
    kind: j.kind === "TEST" ? "TEST" : "ORDER",
    status: j.status as PanelPrintJob["status"],
    code: j.code,
    timeLabel: j.createdAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    error: j.error ?? undefined,
  };
}

export function methodToKey(m: string): PayMethod {
  return ({ CREDIT: "credito", DEBIT: "debito", PIX: "pix", USDC: "usdc" }[m] ?? "pix") as PayMethod;
}

const STATUS: Record<string, Order["st"]> = {
  AWAITING_PAYMENT: "aguardando",
  IN_PRODUCTION: "producao",
  DELIVERED: "entregue",
};

type DbOrder = {
  id: string; number: number; code: string; status: string; locationLabel: string;
  posto: string | null; customerName: string | null; note: string | null; createdAt: Date;
  items: { qty: number; name: string; unitPrice: unknown }[];
  payment: { method: string; cardMask: string | null } | null;
  splitShares: { method: string | null; paid: boolean; amount: unknown }[];
};

export function toPanelOrder(o: DbOrder): Order {
  const items: OrderLine[] = o.items.map((i) => [i.qty, i.name, num(i.unitPrice)]);
  const hasSplit = o.splitShares.length > 0;
  const firstPaid = o.splitShares.find((s) => s.method);
  const pay: PayMethod = o.payment
    ? methodToKey(o.payment.method)
    : firstPaid
      ? methodToKey(firstPaid.method as string)
      : "pix";
  const splits = hasSplit
    ? {
        people: o.splitShares.length,
        paid: o.splitShares.filter((s) => s.paid).length,
        paidAmt: o.splitShares.reduce((s, x) => s + (x.paid ? num(x.amount) : 0), 0),
      }
    : undefined;
  return {
    id: o.number,
    dbId: o.id,
    code: o.code,
    st: STATUS[o.status] ?? "aguardando",
    expired: isPixExpired({
      status: o.status,
      method: o.payment?.method ?? null,
      hasSplit,
      createdAtMs: o.createdAt.getTime(),
    }),
    pay,
    loc: o.locationLabel,
    posto: o.posto ?? undefined,
    cust: o.customerName ?? undefined,
    ts: o.createdAt.getTime(),
    items,
    note: o.note ?? undefined,
    card: o.payment?.cardMask ?? undefined,
    splits,
  };
}

type DbMenuItem = {
  id: string; name: string; description: string | null; price: unknown; oldPrice: unknown;
  photo: string | null; measure: number | null; unit: string | null; category: string; subcategory: string;
};
export function toPanelMenuItem(m: DbMenuItem): MenuItem {
  return {
    id: 0, // display id unused for menu; dbId drives keys/mutations
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

export function toPanelQr(q: { id: string; label: string }): Qr {
  return { id: q.id, label: q.label };
}

type DbEst = {
  name: string; tagline: string | null; description: string | null; address: string | null;
  hours: string | null; serviceFeePct: number; radiusM: number | null; phone: string | null;
  email: string | null; website: string | null; whatsapp: string | null; instagram: string | null;
};
export function toProfileForm(e: DbEst): ProfileForm {
  return {
    name: e.name,
    tagline: e.tagline ?? "",
    desc: e.description ?? "",
    address: e.address ?? "",
    hours: e.hours ?? "",
    serviceFee: String(e.serviceFeePct),
    radius: e.radiusM != null ? String(e.radiusM) : "",
    phone: e.phone ?? "",
    email: e.email ?? "",
    website: e.website ?? "",
    whatsapp: e.whatsapp ?? "",
    instagram: e.instagram ?? "",
  };
}

// ---- KPI aggregation (pure) ----
export function categoryShares(orders: Order[], catOf: Record<string, string>) {
  const byCat: Record<string, number> = {};
  orders.forEach((o) =>
    o.items.forEach(([qty, name, price]) => {
      const c = catOf[name] || "Outros";
      byCat[c] = (byCat[c] || 0) + qty * price;
    }),
  );
  const total = Object.values(byCat).reduce((a, b) => a + b, 0);
  return Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, value]) => ({ cat, value, frac: total ? value / total : 0 }));
}

export function topItems(orders: Order[], catOf: Record<string, string>, itemCat: string) {
  const tally: Record<string, { qty: number; rev: number }> = {};
  orders.forEach((o) =>
    o.items.forEach(([qty, name, price]) => {
      if (itemCat !== "Todos" && catOf[name] !== itemCat) return;
      if (!tally[name]) tally[name] = { qty: 0, rev: 0 };
      tally[name].qty += qty;
      tally[name].rev += qty * price;
    }),
  );
  return Object.entries(tally).map(([name, t]) => ({ name, ...t }));
}

/** Scale the establishment's current-month rollup to the panel period. */
export function scaleEstStats(stats: MonthlyStatLite[], period: string, now: number) {
  const d = new Date(now);
  const cur = stats.find((s) => s.year === d.getFullYear() && s.month === d.getMonth() + 1);
  const frac = period === "hoje" ? 1 / 30 : period === "7d" ? 7 / 30 : 1; // 30d/tudo → full month
  if (period === "tudo") {
    const rev = stats.reduce((a, s) => a + s.gmv, 0);
    const ord = stats.reduce((a, s) => a + s.orders, 0);
    const bp = {
      credito: stats.reduce((a, s) => a + s.byCredit, 0),
      debito: stats.reduce((a, s) => a + s.byDebit, 0),
      pix: stats.reduce((a, s) => a + s.byPix, 0),
      usdc: stats.reduce((a, s) => a + s.byUsdc, 0),
    };
    return { revenue: rev, orders: ord, byPay: bp };
  }
  const g = cur?.gmv ?? 0;
  return {
    revenue: g * frac,
    orders: Math.round((cur?.orders ?? 0) * frac),
    byPay: {
      credito: (cur?.byCredit ?? 0) * frac,
      debito: (cur?.byDebit ?? 0) * frac,
      pix: (cur?.byPix ?? 0) * frac,
      usdc: (cur?.byUsdc ?? 0) * frac,
    },
  };
}
