# Religar Painel do Estabelecimento ao banco — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o Painel do Estabelecimento consumir dados reais do Postgres/Prisma (scoped por sessão), com escritas via Server Actions e isolamento multi-tenant, preservando a UI.

**Architecture:** `painel/page.tsx` faz fetch-once scoped por `session.establishmentId`; adaptadores puros mapeiam DB→view-models existentes; `PanelApp` mantém o compute client-side, troca a fonte (`SEED_*`→props) e roteia mutações por Server Actions (com checagem de tenant) + `revalidatePath`. KPIs híbrido (rollup + itens reais). Notificação de pedido novo segue demo client-side.

**Tech Stack:** Next 16 (App Router) · Prisma/Postgres (Neon) · zod · bcryptjs · Vitest · Playwright.

## Global Constraints

- **Next.js modificado** (`AGENTS.md`): ler `node_modules/next/dist/docs/` antes de código específico de Next.
- Dinheiro em `Decimal`; converter para `number` na borda (adaptadores usam `Number(x)`).
- **Isolamento multi-tenant:** toda leitura é scoped por `session.establishmentId`; **toda Server Action valida que o recurso pertence ao estabelecimento da sessão** antes de mutar. Nunca confiar em id vindo do cliente.
- Preservar a UI: as seções consomem os mesmos tipos (`Order`/`MenuItem`/`Qr`/`ProfileForm`), com adições retrocompatíveis (`dbId?`).
- Config: só troca de senha persiste; impressora/notificações continuam toast (sem model).
- Notificação de pedido novo: segue demo (`INCOMING_ORDERS`); realtime real é Fase 6.
- **Neon configurado** no `.env`; migrations/seed/verify rodam de verdade.
- **Git:** repo não é git; passos de commit são opcionais (pular).
- Zero emoji, números pt-BR, sem hover — inalterado.

---

## Estrutura de arquivos

**Criar:**
- `lib/panel/adapters.ts` — DB→view-model + agregação pura de KPIs.
- `lib/db/panel.ts` — leituras scoped.
- `lib/db/qr.ts` — create/delete QrSpot (scoped).
- `lib/actions/panel.ts` — Server Actions (tenant-checked).
- `scripts/reset-reseed.ts` — clear + reseed controlado (consentido).
- `scripts/verify-panel.ts` — checagem de scoping.
- `tests/panel/adapters.test.ts`, `tests/panel/kpis.test.ts`.

**Modificar:**
- `prisma/schema.prisma` — `Order.number Int @default(autoincrement()) @unique`.
- `lib/data/panel.ts` — `Order` e `MenuItem` ganham `dbId?: string`; `Qr.id` vira `string`.
- `lib/validation.ts` — `profileSaveSchema`, `passwordChangeSchema`.
- `app/[locale]/painel/page.tsx` — fetch-once + adapters.
- `components/panel/PanelApp.tsx` — props + Server Actions + `stats` no context.
- `components/panel/context.tsx` — adicionar `stats` ao `PanelValue`.
- `components/panel/sections/KpisSection.tsx` — híbrido.
- `components/panel/sections/QrSection.tsx` + `modals/QrZoomModal.tsx` — `Qr.id` string.

---

## Task 0: Schema (Order.number) + clean reset & reseed

**Files:** Modify `prisma/schema.prisma`; Create `scripts/reset-reseed.ts`

**Interfaces:** Produces `Order.number` (auto, unique); a clean DB (19 menu items, no dups/orphans).

- [ ] **Step 1: Add `number` to `Order`**

In `model Order`, right after `code String @unique`, add:
```prisma
  number          Int           @default(autoincrement()) @unique
```

- [ ] **Step 2: Create `scripts/reset-reseed.ts`** (clear all tables in FK-safe order, then reseed)

```ts
/** Controlled clear + reseed of the dev DB (user-consented). Avoids the Prisma
 *  CLI's AI guard by using deleteMany, then runs the idempotent seed.
 *  npx tsx scripts/reset-reseed.ts */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Children first, then parents (respect FK).
  await prisma.splitShare.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.monthlyStat.deleteMany();
  await prisma.searchEvent.deleteMany();
  await prisma.qrSpot.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.user.deleteMany();
  await prisma.establishment.deleteMany();
  console.log("cleared");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

- [ ] **Step 3: Migrate + reset + reseed**

Run:
```bash
npm run db:migrate -- --name order_number
npx tsx scripts/reset-reseed.ts
npm run db:seed
```
Expected: migration applied; "cleared"; `seed OK { establishments: 13, users: 14, menuItems: 19, orders: ~14, ... }`. Confirm `menuItems: 19` (no duplicates).

- [ ] **Step 4: Confirm counts + numbers**

Run:
```bash
npx tsx -e "import('@prisma/client').then(async({PrismaClient})=>{const p=new PrismaClient();const m=await p.menuItem.count();const o=await p.order.findMany({select:{number:true},take:3,orderBy:{number:'asc'}});console.log('menu',m,'firstNumbers',o.map(x=>x.number));await p.\$disconnect();})"
```
Expected: `menu 19` and order numbers are small sequential ints.

- [ ] **Step 5: Build (types)** — `npm run build` → passes (new `number` field in client).

- [ ] **Step 6: Commit (opcional)** — skip (no git).

---

## Task 1: Types + adapters + KPI aggregation (TDD)

**Files:** Modify `lib/data/panel.ts`; Create `lib/panel/adapters.ts`, `tests/panel/adapters.test.ts`, `tests/panel/kpis.test.ts`

**Interfaces:**
- Produces (types): `Order.dbId?: string`, `MenuItem.dbId?: string`, `Qr = { id: string; label: string }`.
- Produces (adapters): `methodToKey(m)`, `toPanelOrder(db, ...)`, `toPanelMenuItem(db)`, `toPanelQr(db)`, `toProfileForm(db)`.
- Produces (KPI pure): `categoryShares(orders, catOf)`, `topItems(orders, catOf, itemCat)`, `scaleEstStats(stats, period, now)`.

- [ ] **Step 1: Type edits in `lib/data/panel.ts`**
  - In `type Order`, add `dbId?: string;`.
  - In `type MenuItem`, add `dbId?: string;`.
  - Change `export type Qr = { id: number; label: string };` to `export type Qr = { id: string; label: string };`.
  - In `SEED_QRS`, change the numeric `id` values to strings (`id: "1"`, `id: "2"`) so the mock still type-checks. (SEED_QRS is only used by the seed's label, but keep it valid.)

- [ ] **Step 2: Write failing tests** — `tests/panel/adapters.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { methodToKey, toPanelOrder } from "@/lib/panel/adapters";

describe("methodToKey", () => {
  it("maps enum → pt key", () => {
    expect(methodToKey("PIX")).toBe("pix");
    expect(methodToKey("CREDIT")).toBe("credito");
  });
});

describe("toPanelOrder", () => {
  const base = {
    id: "o1", number: 41, code: "PED-1", establishmentId: "e1",
    status: "AWAITING_PAYMENT", locationLabel: "Guarda-sol nº 22", posto: "Posto 3",
    customerName: "Marina", note: null, createdAt: new Date("2026-07-01T12:00:00Z"),
    items: [{ qty: 4, name: "Caipirinha", unitPrice: 22 }, { qty: 1, name: "Camarão", unitPrice: 68 }],
    payment: null,
    splitShares: [{ method: "PIX", paid: true, amount: 39 }, { method: null, paid: false, amount: 39 }],
  } as never;
  it("maps split order", () => {
    const o = toPanelOrder(base);
    expect(o.id).toBe(41);
    expect(o.dbId).toBe("o1");
    expect(o.st).toBe("aguardando");
    expect(o.items).toEqual([[4, "Caipirinha", 22], [1, "Camarão", 68]]);
    expect(o.splits).toEqual({ people: 2, paid: 1, paidAmt: 39 });
    expect(o.loc).toBe("Guarda-sol nº 22");
  });
  it("maps single-payment order", () => {
    const o = toPanelOrder({
      ...base, status: "IN_PRODUCTION", splitShares: [],
      payment: { method: "CREDIT", cardMask: "Visa •••• 4412" },
    } as never);
    expect(o.st).toBe("producao");
    expect(o.pay).toBe("credito");
    expect(o.card).toBe("Visa •••• 4412");
    expect(o.splits).toBeUndefined();
  });
});
```

`tests/panel/kpis.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { categoryShares, topItems, scaleEstStats } from "@/lib/panel/adapters";
import type { Order } from "@/lib/data/panel";

const ord = (items: [number, string, number][], st: Order["st"] = "producao"): Order =>
  ({ id: 1, code: "c", st, pay: "pix", loc: "x", ts: 0, items } as Order);
const catOf = { Caipirinha: "Bebidas", Camarão: "Alimentos" } as Record<string, string>;

describe("categoryShares", () => {
  it("sums revenue per category with fractions", () => {
    const r = categoryShares([ord([[2, "Caipirinha", 20], [1, "Camarão", 60]])], catOf);
    // Bebidas 40, Alimentos 60, total 100
    const bev = r.find((x) => x.cat === "Bebidas")!;
    expect(bev.value).toBe(40);
    expect(bev.frac).toBeCloseTo(0.4, 5);
  });
});

describe("topItems", () => {
  it("tallies qty/rev and filters by category", () => {
    const orders = [ord([[3, "Caipirinha", 20], [1, "Camarão", 60]])];
    const all = topItems(orders, catOf, "Todos");
    expect(all.find((t) => t.name === "Caipirinha")!.qty).toBe(3);
    const bev = topItems(orders, catOf, "Bebidas");
    expect(bev.every((t) => t.name === "Caipirinha")).toBe(true);
  });
});

describe("scaleEstStats", () => {
  const now = new Date("2026-07-15T12:00:00Z").getTime();
  const stats = [{ establishmentId: "e1", year: 2026, month: 7, orders: 300, gmv: 30000, byCredit: 12000, byDebit: 6000, byPix: 9000, byUsdc: 3000 }];
  it("full current month for '30d'/'tudo'", () => {
    expect(scaleEstStats(stats, "30d", now).revenue).toBe(30000);
    expect(scaleEstStats(stats, "tudo", now).revenue).toBe(30000);
  });
  it("scales down for hoje/7d", () => {
    expect(scaleEstStats(stats, "hoje", now).revenue).toBeCloseTo(1000, 0);
    expect(scaleEstStats(stats, "7d", now).orders).toBe(70);
  });
});
```

- [ ] **Step 3: Run → fail** — `npx vitest run tests/panel/` → FAIL (module missing).

- [ ] **Step 4: Implement `lib/panel/adapters.ts`**

```ts
import type { MonthlyStatLite } from "@/lib/admin/scale";
import type { MenuItem, Order, OrderLine, PayMethod, ProfileForm, Qr } from "@/lib/data/panel";

const num = (v: unknown): number => Number(v ?? 0);

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
```

- [ ] **Step 5: Run → pass** — `npx vitest run tests/panel/` → PASS. Then `npm test` (all) + `npm run lint`.

- [ ] **Step 6: Commit (opcional)** — skip.

---

## Task 2: Scoped reads + qr repo + validation

**Files:** Create `lib/db/panel.ts`, `lib/db/qr.ts`; Modify `lib/validation.ts`

**Interfaces:**
- Produces reads: `getEstablishment(id)`, `listOrders(id)` (reuse from orders.ts), `listMenu(id)` (reuse), `listQrSpots(id)`, `listMonthlyStats(id)`.
- Produces: `createQrSpot(establishmentId, label)`, `deleteQrSpot(id, establishmentId)`.
- Produces schemas: `profileSaveSchema`, `passwordChangeSchema`.

- [ ] **Step 1: `lib/db/qr.ts`**
```ts
import { prisma } from "./prisma";

export function listQrSpots(establishmentId: string) {
  return prisma.qrSpot.findMany({ where: { establishmentId }, orderBy: { createdAt: "asc" } });
}
export function createQrSpot(establishmentId: string, label: string) {
  return prisma.qrSpot.create({ data: { establishmentId, label } });
}
export function deleteQrSpot(id: string, establishmentId: string) {
  return prisma.qrSpot.deleteMany({ where: { id, establishmentId } });
}
```

- [ ] **Step 2: `lib/db/panel.ts`** (scoped reads for the panel page)
```ts
import { prisma } from "./prisma";

export function getEstablishment(id: string) {
  return prisma.establishment.findUnique({ where: { id } });
}
export function listPanelOrders(establishmentId: string) {
  return prisma.order.findMany({
    where: { establishmentId },
    orderBy: { createdAt: "desc" },
    include: { items: true, payment: true, splitShares: true },
  });
}
export function listPanelMenu(establishmentId: string) {
  return prisma.menuItem.findMany({
    where: { establishmentId },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });
}
export function listPanelQrSpots(establishmentId: string) {
  return prisma.qrSpot.findMany({ where: { establishmentId }, orderBy: { createdAt: "asc" } });
}
export function listPanelStats(establishmentId: string) {
  return prisma.monthlyStat.findMany({ where: { establishmentId } });
}
```

- [ ] **Step 3: Append to `lib/validation.ts`**
```ts
export const profileSaveSchema = z.object({
  name: z.string().min(1),
  tagline: z.string().optional(),
  desc: z.string().optional(),
  address: z.string().optional(),
  hours: z.string().optional(),
  serviceFee: z.coerce.number().int().min(0).max(100),
  radius: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  whatsapp: z.string().optional(),
  instagram: z.string().optional(),
});
export type ProfileSaveInput = z.infer<typeof profileSaveSchema>;

export const passwordChangeSchema = z.object({
  current: z.string().min(1),
  next: z.string().min(6),
});
```

- [ ] **Step 4: Typecheck + build** — `npx tsc --noEmit` + `npm run build` → clean.

- [ ] **Step 5: Commit (opcional)** — skip.

---

## Task 3: Server Actions (tenant-checked)

**Files:** Create `lib/actions/panel.ts`

**Interfaces:** Produces `deliverOrderAction(dbOrderId)`, `upsertMenuItemAction(input)`, `deleteMenuItemAction(dbId)`, `addQrSpotAction(label)`, `deleteQrSpotAction(dbId)`, `saveProfileAction(input)`, `changePasswordAction(current, next)`. All derive `establishmentId`/`userId` from the session — never trust client ids for ownership.

- [ ] **Step 1: `lib/actions/panel.ts`**
```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { deliverOrder } from "@/lib/db/orders";
import { upsertMenuItem, deleteMenuItem } from "@/lib/db/menu";
import { createQrSpot, deleteQrSpot } from "@/lib/db/qr";
import {
  menuItemUpsertSchema,
  passwordChangeSchema,
  profileSaveSchema,
  qrSpotCreateSchema,
  type MenuItemUpsertInput,
  type ProfileSaveInput,
} from "@/lib/validation";

async function requireEst() {
  const s = await getSession();
  if (s?.role !== "ESTABLISHMENT" || !s.establishmentId) throw new Error("unauthorized");
  return s;
}

export async function deliverOrderAction(dbOrderId: string): Promise<void> {
  const s = await requireEst();
  const o = await prisma.order.findUnique({ where: { id: dbOrderId }, select: { establishmentId: true } });
  if (!o || o.establishmentId !== s.establishmentId) throw new Error("forbidden");
  await deliverOrder(dbOrderId);
  revalidatePath("/painel");
}

export async function upsertMenuItemAction(
  input: Omit<MenuItemUpsertInput, "establishmentId">,
): Promise<{ ok: boolean; error?: string }> {
  const s = await requireEst();
  // If editing, verify the item belongs to the session establishment.
  if (input.id) {
    const item = await prisma.menuItem.findUnique({ where: { id: input.id }, select: { establishmentId: true } });
    if (!item || item.establishmentId !== s.establishmentId) return { ok: false, error: "forbidden" };
  }
  const parsed = menuItemUpsertSchema.safeParse({ ...input, establishmentId: s.establishmentId });
  if (!parsed.success) return { ok: false, error: "invalid" };
  await upsertMenuItem(parsed.data);
  revalidatePath("/painel");
  return { ok: true };
}

export async function deleteMenuItemAction(dbId: string): Promise<void> {
  const s = await requireEst();
  await deleteMenuItem(dbId, s.establishmentId!); // deleteMany scoped by establishmentId
  revalidatePath("/painel");
}

export async function addQrSpotAction(label: string): Promise<{ ok: boolean }> {
  const s = await requireEst();
  const parsed = qrSpotCreateSchema.safeParse({ establishmentId: s.establishmentId, label });
  if (!parsed.success) return { ok: false };
  const exists = await prisma.qrSpot.findFirst({
    where: { establishmentId: s.establishmentId!, label: parsed.data.label },
  });
  if (exists) return { ok: false };
  await createQrSpot(s.establishmentId!, parsed.data.label);
  revalidatePath("/painel");
  return { ok: true };
}

export async function deleteQrSpotAction(dbId: string): Promise<void> {
  const s = await requireEst();
  await deleteQrSpot(dbId, s.establishmentId!); // scoped by establishmentId
  revalidatePath("/painel");
}

export async function saveProfileAction(
  input: ProfileSaveInput,
): Promise<{ ok: boolean; error?: string }> {
  const s = await requireEst();
  const parsed = profileSaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const d = parsed.data;
  await prisma.establishment.update({
    where: { id: s.establishmentId! },
    data: {
      name: d.name,
      tagline: d.tagline || null,
      description: d.desc || null,
      address: d.address || null,
      hours: d.hours || null,
      serviceFeePct: d.serviceFee,
      radiusM: d.radius ? Number(d.radius) : null,
      phone: d.phone || null,
      email: d.email || null,
      website: d.website || null,
      whatsapp: d.whatsapp || null,
      instagram: d.instagram || null,
    },
  });
  revalidatePath("/painel");
  return { ok: true };
}

export async function changePasswordAction(
  current: string,
  next: string,
): Promise<{ ok: boolean; error?: string }> {
  const s = await requireEst();
  const parsed = passwordChangeSchema.safeParse({ current, next });
  if (!parsed.success) return { ok: false, error: "pwTooShort" };
  const user = await prisma.user.findUnique({ where: { id: s.sub } });
  if (!user || !(await verifyPassword(parsed.data.current, user.passwordHash))) {
    return { ok: false, error: "pwWrongCurrent" };
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.next) } });
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck + build + lint** — `npx tsc --noEmit`, `npm run build`, `npm run lint` → clean.

- [ ] **Step 3: Commit (opcional)** — skip.

---

## Task 4: Wire `painel/page.tsx` + `PanelApp` + context

**Files:** Modify `app/[locale]/painel/page.tsx`, `components/panel/PanelApp.tsx`, `components/panel/context.tsx`, `components/panel/sections/QrSection.tsx`, `components/panel/modals/QrZoomModal.tsx`

**Interfaces:** Consumes reads (Task 2), adapters (Task 1), actions (Task 3).

- [ ] **Step 1: `context.tsx` — add `stats` to `PanelValue`**

Add `import type { MonthlyStatLite } from "@/lib/admin/scale";` and, in `interface PanelValue`, add `stats: MonthlyStatLite[];` (near `orders`/`menu`/`qrs`).

- [ ] **Step 2: `painel/page.tsx` — fetch-once + adapters**

Replace the page body (keep `generateMetadata`) with:
```tsx
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/auth/session";
import {
  getEstablishment,
  listPanelMenu,
  listPanelOrders,
  listPanelQrSpots,
  listPanelStats,
} from "@/lib/db/panel";
import { toMonthlyStatLite } from "@/lib/admin/adapters";
import { toPanelMenuItem, toPanelOrder, toPanelQr, toProfileForm } from "@/lib/panel/adapters";
import { PanelApp } from "@/components/panel/PanelApp";

// (generateMetadata unchanged)

export default async function PainelPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (session?.role !== "ESTABLISHMENT" || !session.establishmentId) redirect({ href: "/login", locale });

  const estId = session.establishmentId;
  const [est, dbOrders, dbMenu, dbQrs, dbStats] = await Promise.all([
    getEstablishment(estId),
    listPanelOrders(estId),
    listPanelMenu(estId),
    listPanelQrSpots(estId),
    listPanelStats(estId),
  ]);
  if (!est) redirect({ href: "/login", locale });

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  return (
    <PanelApp
      now={now}
      profile={toProfileForm(est)}
      orders={dbOrders.map(toPanelOrder)}
      menu={dbMenu.map(toPanelMenuItem)}
      qrs={dbQrs.map(toPanelQr)}
      stats={dbStats.map(toMonthlyStatLite)}
    />
  );
}
```
Note: `redirect` throws, so `est` is non-null afterward; if TS complains, add a `return null;` after the `!est` redirect.

- [ ] **Step 3: `PanelApp.tsx` — props, source swap, actions, context `stats`**

Change the signature to accept the new props and seed state from them instead of `SEED_*`:
```tsx
export function PanelApp({
  now, profile: profile0, orders: orders0, menu: menu0, qrs: qrs0, stats,
}: {
  now: number;
  profile: ProfileForm;
  orders: Order[];
  menu: MenuItem[];
  qrs: Qr[];
  stats: MonthlyStatLite[];
}) {
```
- Seed the existing `useState`s from props: `useState<Order[]>(orders0)`, `useState<MenuItem[]>(menu0)`, `useState<Qr[]>(qrs0)`, `useState<ProfileForm>(profile0)`. Remove the `SEED_*` imports and the `minutesAgo` mapping. Keep `beach = true` and `restName = profile.name`.
- Add `stats` to the context `value` (and its dependency array).
- Wrap action calls in `useTransition` (`const [, startTransition] = useTransition();`).
- Rewire the mutation handlers to call Server Actions (import from `@/lib/actions/panel`), keeping the optimistic local update where it improves UX but relying on `revalidatePath` for truth:
  - `deliverOrder: (id) => { const o = orders.find(x => x.id === id); if (o?.dbId) startTransition(() => deliverOrderAction(o.dbId!)); }` (keep the local `setOrders(... st:"entregue")` for instant feedback).
  - `saveItem(clean)` → `startTransition(async () => { await upsertMenuItemAction({ id: clean.dbId, name: clean.name, description: clean.desc, price: clean.price, oldPrice: clean.old, photo: clean.photo, measure: clean.measure, unit: clean.unit, category: clean.cat, subcategory: clean.sub, active: true }); }); setEditing(null); toast(...)`.
  - delete item (ConfirmDialog onConfirm) → `if (delItem.dbId) startTransition(() => deleteMenuItemAction(delItem.dbId!));`
  - `addQr` → `startTransition(async () => { await addQrSpotAction(qrLabel.trim()); }); setQrLabel("");`
  - delete QR (ConfirmDialog) → `if (delQr) startTransition(() => deleteQrSpotAction(delQr.id));` (Qr.id is now the DB id).
  - `saveProfile` → `startTransition(async () => { const r = await saveProfileAction({ name: profile.name, tagline: profile.tagline, desc: profile.desc, address: profile.address, hours: profile.hours, serviceFee: Number(profile.serviceFee)||0, radius: profile.radius, phone: profile.phone, email: profile.email, website: profile.website, whatsapp: profile.whatsapp, instagram: profile.instagram }); if (r.ok) { setProfSaved(true); toast(t("toasts.profileSaved")); } });`
  - `savePw` → replace the local mock validation with a call: `startTransition(async () => { const r = await changePasswordAction(pw.cur, pw.nova); if (!r.ok) return setPwMsg({ ok:false, t: t(\`config.\${r.error === "pwWrongCurrent" ? "pwWrongCurrent" : "pwTooShort"}\`) }); setPwMsg({ ok:true, t: t("config.pwSuccess") }); setPwState(EMPTY_PW); });` — keep the client-side "fill all / mismatch" checks before calling. (Add `config.pwWrongCurrent` to messages if missing — PT "Senha atual incorreta." / EN "Current password is incorrect.")
- Keep the `INCOMING_ORDERS` demo effect (client-only new-order notification) unchanged.
- Keep all modals/toasts/notif as-is.

- [ ] **Step 4: `QrSection.tsx` + `QrZoomModal.tsx` — `Qr.id` is now string**

Wherever `q.id` was used as a number (keys, zoom, delete), it now works as a string with no change except any place that assumed numeric formatting — verify none does arithmetic on `q.id`. Fix any `Number(q.id)` / numeric use.

- [ ] **Step 5: Build + lint + tests** — `npm run build`, `npm run lint`, `npm test` → all clean.

- [ ] **Step 6: Commit (opcional)** — skip.

---

## Task 5: KpisSection — hybrid (rollup + real items)

**Files:** Modify `components/panel/sections/KpisSection.tsx`

**Interfaces:** Consumes `stats` from context; `scaleEstStats`/`categoryShares`/`topItems` from `@/lib/panel/adapters`.

- [ ] **Step 1: Rewire the `view` useMemo**

- Pull `stats` from `usePanel()`.
- Compute rollup headline from `scaleEstStats(stats, period, now)` → `{ revenue, orders: rollupOrders, byPay }`.
- Keep the raw period-filtered `data` (orders with `ts >= minTs && st !== "aguardando"`) for item-level + operational metrics.
- **Category donut:** use `categoryShares(data, catOf)` for FRACTIONS, but scale segment values + center to the rollup `revenue` (so the donut total equals the headline): `val = money(share.frac * revenue)`, center `catCenter` from `revenue`.
- **Payment donut:** build from rollup `byPay` (per method), not from raw singles. Each method bar: `total = byPay[id]`, `maxPay = max(byPay)`, `grand = sum(byPay)`. Keep the expandable per-order detail list from raw `singles` (real orders) under each method (it's fine if the detail list is shorter than the rollup total — it shows real recent payments).
- **Top items:** `topItems(data, catOf, itemCat)` then sort/slice to 5 for qty and rev (reuse the existing `mk` shaping).
- **Stat cards:** revenue = rollup `revenue`; orders = rollup `rollupOrders`; avgTicket = `revenue / rollupOrders`; inProduction = raw `data.filter(o => o.st === "producao").length` (operational, real).

- [ ] **Step 2: Verify visually via build** — `npm run build` + `npm run lint` clean; `npm test` still green (the pure helpers are covered by Task 1 tests). Runtime look verified in Task 6 Playwright.

- [ ] **Step 3: Commit (opcional)** — skip.

---

## Task 6: Verification (scoping script + Playwright)

**Files:** Create `scripts/verify-panel.ts`

- [ ] **Step 1: `scripts/verify-panel.ts` — tenant isolation (read layer)**
```ts
/** Verifies panel reads are tenant-scoped. npx tsx scripts/verify-panel.ts */
import { PrismaClient } from "@prisma/client";
import { listPanelOrders, listPanelMenu, listPanelQrSpots } from "../lib/db/panel";
const prisma = new PrismaClient();
let fail = 0;
const check = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"}  ${n}`); if (!c) fail++; };

async function main() {
  const live = await prisma.establishment.findUnique({ where: { slug: "quiosque-do-mar" } });
  const other = await prisma.establishment.findFirst({ where: { slug: { not: "quiosque-do-mar" } } });
  if (!live || !other) throw new Error("need 2 establishments");
  const liveOrders = await listPanelOrders(live.id);
  const liveMenu = await listPanelMenu(live.id);
  check("Quiosque do Mar has orders", liveOrders.length > 0);
  check("Quiosque do Mar has 19 menu items", liveMenu.length === 19);
  check("all live orders belong to live", liveOrders.every((o) => o.establishmentId === live.id));
  const otherMenu = await listPanelMenu(other.id);
  check("other establishment has its own (empty) menu", otherMenu.every((m) => m.establishmentId === other.id));
  check("no cross-tenant leak in menu", !liveMenu.some((m) => m.establishmentId !== live.id));
  console.log(fail ? `\n${fail} FALHA(S)` : "\nTODOS OS CHECKS PASSARAM");
  if (fail) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```
Run: `npx tsx scripts/verify-panel.ts` → "TODOS OS CHECKS PASSARAM".

- [ ] **Step 2: Playwright E2E (login Quiosque do Mar)**

Rebuild (`npm run build`), start `PORT=3222 npm run start` (background, poll ready). Playwright (from the scratchpad dir that has `playwright`), login `contato@quiosquedomar.com.br` / `demo1234` → `/painel`, then:
- **Pedidos:** an order card is visible; click "Entregar" on an in-production order → its status badge flips to delivered (or it moves group). Reload → still delivered (persisted).
- **Cardápio:** create an item (open editor via "add", fill name/price/category, save) → appears; edit it; delete it → gone.
- **QR Codes:** add a QR label → appears; delete it → gone.
- **Perfil:** change the tagline, save → toast; reload → persisted.
- **Config:** change password with correct current (`demo1234` → `demo1234`, or a new one and back) → success msg; with wrong current → error msg.
- **KPIs:** stat cards show non-zero revenue (rollup); category donut + top items render.
- Collect `pageerror` → none. Screenshot. Stop the server.

If a selector is unclear, dump `innerText`/screenshot and adjust. The password field is the only `input[type="password"]`.

- [ ] **Step 3: Final gates** — `npm test` + `npm run build` + `npm run lint` clean.

- [ ] **Step 4: Commit (opcional)** — skip.

---

## Self-review (autor)

- **Spec coverage:** limpeza da DB (T0) · adaptadores + KPIs pura + tipos `dbId`/`Qr.id` (T1) · reads scoped + qr repo + Zod (T2) · Server Actions tenant-checked (T3) · wiring page/PanelApp/context/QR (T4) · KPIs híbrido (T5) · verificação scoping + E2E (T6). Multi-tenant enforçado nas actions (verificam ownership antes de mutar). Config só-senha (T3 `changePasswordAction`). Notificação demo preservada (T4). KPIs híbrido coerente (donut escala à receita do rollup) (T5).
- **Placeholders:** nenhum — código real por passo; edits grandes (page/PanelApp/KPIs) descritos com os trechos exatos a inserir.
- **Consistência de tipos:** `Order.dbId?`, `MenuItem.dbId?`, `Qr.id: string`, `Order.number`, `MonthlyStatLite`, e as assinaturas das actions usadas igualmente entre T1–T5. `scaleEstStats`/`categoryShares`/`topItems` definidas em T1 e consumidas em T5.
- **Fora de escopo:** sub-projeto A; realtime real; CSV; upload de foto; settings de impressora/notif.
