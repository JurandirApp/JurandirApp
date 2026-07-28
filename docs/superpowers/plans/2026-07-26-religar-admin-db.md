# Religar Admin ao banco — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o Painel Admin consumir dados reais do Postgres/Prisma (via tabela de rollup `MonthlyStat`), preservando a UI e o comportamento atuais, com CRUD de tenant e taxa via Server Actions.

**Architecture:** Rollup `MonthlyStat` seedado das baselines×sazonalidade. A page server faz fetch-once (ests + stats + orders + events), adaptadores puros mapeiam linhas do DB → view-models existentes (`AdminEst`/`AdminOrder`/`SearchEvent`), e o `AdminApp` mantém o compute client-side trocando `scaleEsts` por `scaleFromStats`. Escritas via Server Actions + `revalidatePath`.

**Tech Stack:** Next 16 (App Router) · Prisma/Postgres (Neon) · zod · Vitest.

## Global Constraints

- **Next.js modificado** (`AGENTS.md`): ler `node_modules/next/dist/docs/` antes de código específico de Next.
- Dinheiro em `Decimal(10,2)`/`Decimal(12,2)`; converter para `number` na borda (adaptadores usam `Number(x)`).
- Preservar a UI: seções consomem `ScaledEst`/`AdminOrder`/`SearchEvent` **sem mudança de shape**.
- Multi-tenant não se aplica ao admin (vê tudo); mas as **escritas** validam com Zod.
- **Neon já configurado** no `.env` (migrations/seed/verify rodam de verdade).
- **Git:** repo não é git; passos de commit são opcionais (só se sob git + autorizado).
- Zero emoji, números pt-BR, sem hover — inalterado (não tocamos no visual).

---

## Estrutura de arquivos

**Modificar:**
- `prisma/schema.prisma` — `MonthlyStat` (novo), `SearchEvent` (+`neighborhood`,`type`), `Establishment` (+`isLive`).
- `prisma/seed.ts` — seed de `MonthlyStat`, `SearchEvent`, orders de backlog, `isLive`.
- `lib/data/admin.ts` — `AdminEst` ganha `isLive: boolean`.
- `lib/admin/scale.ts` — adicionar `scaleFromStats` + tipo `MonthlyStatLite`.
- `components/admin/AdminApp.tsx` — receber props do servidor; usar `scaleFromStats` + Server Actions.
- `app/[locale]/admin/page.tsx` — fetch-once + montar view-models.
- `components/admin/sections/{Cadastros,Faturamento,Taxas,Dashboard}Section.tsx` — badge `isLive`; Taxas persiste fee onBlur.

**Criar:**
- `lib/admin/adapters.ts` — mapeadores puros DB → view-model.
- `lib/db/admin.ts` — leituras do admin.
- `lib/actions/admin.ts` — Server Actions (CRUD tenant + fee).
- `lib/validation.ts` — adicionar `establishmentUpsertSchema` (editar arquivo existente).
- Testes: `tests/admin/scale.test.ts`, `tests/admin/adapters.test.ts`.
- `scripts/verify-admin.ts` — verificação de agregados + CRUD.

---

## Task 1: Schema (MonthlyStat, SearchEvent, isLive) + migration

**Files:** Modify `prisma/schema.prisma`

**Interfaces:** Produces model `MonthlyStat`; `SearchEvent.neighborhood/type`; `Establishment.isLive`.

- [ ] **Step 1: Adicionar `isLive` ao `Establishment`**

Em `model Establishment`, após `status ... @default(ACTIVE)`:
```prisma
  isLive         Boolean             @default(false)
```

- [ ] **Step 2: Estender `SearchEvent`**

Substituir o `model SearchEvent` por:
```prisma
model SearchEvent {
  id              String         @id @default(cuid())
  query           String?
  city            String?
  neighborhood    String?
  cuisine         String?
  type            String?
  category        String?
  openNow         Boolean?
  establishmentId String?
  establishment   Establishment? @relation(fields: [establishmentId], references: [id], onDelete: SetNull)
  createdAt       DateTime       @default(now())
}
```

- [ ] **Step 3: Adicionar `MonthlyStat`**

No fim do schema:
```prisma
model MonthlyStat {
  id              String        @id @default(cuid())
  establishmentId String
  establishment   Establishment @relation(fields: [establishmentId], references: [id], onDelete: Cascade)
  year            Int
  month           Int
  orders          Int
  gmv             Decimal       @db.Decimal(12, 2)
  byCredit        Decimal       @db.Decimal(12, 2)
  byDebit         Decimal       @db.Decimal(12, 2)
  byPix           Decimal       @db.Decimal(12, 2)
  byUsdc          Decimal       @db.Decimal(12, 2)

  @@unique([establishmentId, year, month])
}
```

- [ ] **Step 4: Adicionar a relação inversa em `Establishment`**

Em `model Establishment`, junto das outras relações (`orders Order[]` etc.):
```prisma
  monthlyStats MonthlyStat[]
```

- [ ] **Step 5: Validar, migrar e gerar**

Run: `npx prisma validate`
Expected: schema válido.
Run: `npm run db:migrate -- --name admin_rollup`
Expected: migration criada e aplicada no Neon; client regenerado.

- [ ] **Step 6: Build (tipos)**

Run: `npm run build`
Expected: passa (tipos do novo model disponíveis).

- [ ] **Step 7: Commit (opcional)** — `git add prisma/ && git commit -m "feat(admin): schema rollup (MonthlyStat, SearchEvent, isLive)"`

---

## Task 2: Seed — rollup, search events, backlog, isLive

**Files:** Modify `prisma/seed.ts`

**Interfaces:** Consumes `SEED_ESTS`, `SEED_EVENTS`, `admin.ts` `SEED_ORDERS`, `SEASON`.

- [ ] **Step 1: Imports adicionais no topo de `prisma/seed.ts`**

Adicionar aos imports existentes:
```ts
import {
  SEED_ESTS,
  SEED_EVENTS,
  SEASON,
  SEED_ORDERS as ADMIN_SEED_ORDERS,
} from "../lib/data/admin";
```
(`SEED_ESTS` já é importado — não duplicar; adicionar apenas `SEED_EVENTS`, `SEASON`, e `SEED_ORDERS as ADMIN_SEED_ORDERS`.)

- [ ] **Step 2: Marcar o Quiosque do Mar como `isLive` no upsert do estabelecimento**

No `create` do `prisma.establishment.upsert`, adicionar:
```ts
        isLive: isDemo,
```

- [ ] **Step 3: Após o loop `for (const e of SEED_ESTS)`, antes do admin user, adicionar o rollup + eventos + backlog**

```ts
  // ---- MonthlyStat rollup (baselines × seasonality), 12 months from `since`.
  const monthMap = new Map<string, string>(); // adminEstId -> db establishment id
  for (const e of SEED_ESTS) {
    const slug = e.id === "live" ? "quiosque-do-mar" : slugify(e.name);
    const dbEst = await prisma.establishment.findUnique({ where: { slug } });
    if (dbEst) monthMap.set(e.id, dbEst.id);
  }

  const nowD = new Date(now);
  for (const e of SEED_ESTS) {
    const dbId = monthMap.get(e.id);
    if (!dbId) continue;
    const sinceMs = new Date(e.since).getTime();
    const totalPay = e.byPay.credito + e.byPay.debito + e.byPay.pix + e.byPay.usdc || 1;
    for (let i = 0; i < 12; i++) {
      const d = new Date(nowD.getFullYear(), nowD.getMonth() - i, 1);
      if (d.getTime() < new Date(sinceMs).setDate(1)) continue; // skip pre-join months
      const season = SEASON[d.getMonth()];
      const gmv = +(e.revenue * season).toFixed(2);
      const orders = Math.round(e.orders * season);
      const share = (v: number) => +((gmv * v) / totalPay).toFixed(2);
      await prisma.monthlyStat.upsert({
        where: {
          establishmentId_year_month: {
            establishmentId: dbId,
            year: d.getFullYear(),
            month: d.getMonth() + 1,
          },
        },
        update: {},
        create: {
          establishmentId: dbId,
          year: d.getFullYear(),
          month: d.getMonth() + 1,
          orders,
          gmv,
          byCredit: share(e.byPay.credito),
          byDebit: share(e.byPay.debito),
          byPix: share(e.byPay.pix),
          byUsdc: share(e.byPay.usdc),
        },
      });
    }
  }

  // ---- Search events (landing analytics)
  const evField: Record<string, "city" | "neighborhood" | "cuisine" | "type"> = {
    city: "city",
    neighborhood: "neighborhood",
    cuisine: "cuisine",
    tipo: "type",
  };
  for (const ev of SEED_EVENTS) {
    const col = evField[ev.field];
    if (!col) continue;
    await prisma.searchEvent.create({
      data: {
        [col]: ev.value,
        createdAt: new Date(now - ev.day * 86400000),
      },
    });
  }

  // ---- Backlog orders (cross-establishment), items parsed from the summary string.
  const parseItems = (s: string) =>
    s.split(",").map((part) => {
      const m = part.trim().match(/^(\d+)×?\s*(.+)$/);
      return m ? { qty: Number(m[1]), name: m[2].trim() } : { qty: 1, name: part.trim() };
    });
  for (const o of ADMIN_SEED_ORDERS) {
    const dbId = monthMap.get(o.est);
    if (!dbId) continue;
    const exists = await prisma.order.findUnique({ where: { code: o.code } });
    if (exists) continue;
    const method = PAY_MAP[o.m]; // undefined for "split"
    const createdAt = new Date(now - o.minutesAgo * 60000);
    await prisma.order.create({
      data: {
        establishmentId: dbId,
        code: o.code,
        status: "DELIVERED",
        locationLabel: "—",
        customerName: o.cust || null,
        subtotal: o.total,
        platformFee: 0,
        serviceFee: 0,
        total: o.total,
        createdAt,
        items: { create: parseItems(o.items).map((i) => ({ name: i.name, qty: i.qty, unitPrice: 0 })) },
        ...(method
          ? { payment: { create: { method, installments: 1, gatewayFeePct: GATEWAY_FEE_PCT[method], cardMask: o.card || null } } }
          : { splitShares: { create: [{ personIndex: 0, amount: o.total, method: null, paid: false }] } }),
      },
    });
  }
```

- [ ] **Step 4: Re-seed**

Run: `npm run db:seed`
Expected: `seed OK {...}` sem erro; contagens agora incluem monthlyStats e mais orders/searchEvents. (O seed é idempotente por `upsert`/`findUnique`.)

- [ ] **Step 5: Conferência rápida**

Run:
```bash
npx tsx -e "import('@prisma/client').then(async({PrismaClient})=>{const p=new PrismaClient();console.log('stats',await p.monthlyStat.count(),'events',await p.searchEvent.count(),'orders',await p.order.count());await p.\$disconnect();})"
```
Expected: `stats` > 100, `events` > 100, `orders` ≥ 20.

- [ ] **Step 6: Commit (opcional)** — `git add prisma/seed.ts && git commit -m "feat(admin): seed rollup + search events + backlog orders"`

---

## Task 3: `scaleFromStats` + `AdminEst.isLive` (TDD)

**Files:** Modify `lib/admin/scale.ts`, `lib/data/admin.ts`; Create `tests/admin/scale.test.ts`

**Interfaces:**
- Produces `type MonthlyStatLite`, `scaleFromStats(ests, stats, period, month): ScaledEst[]`, and `AdminEst.isLive: boolean`.

- [ ] **Step 1: Adicionar `isLive` ao tipo `AdminEst`**

Em `lib/data/admin.ts`, no `type AdminEst`, adicionar (após `id: string;`):
```ts
  isLive?: boolean;
```
(Opcional pra não quebrar o `SEED_ESTS.map` existente; os view-models do DB sempre setam.)

- [ ] **Step 2: Escrever o teste (falhando)** — `tests/admin/scale.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { scaleFromStats, type MonthlyStatLite } from "@/lib/admin/scale";
import type { AdminEst } from "@/lib/data/admin";

const est = (id: string): AdminEst => ({
  id, name: id, owner: "", city: "", neigh: "", tipo: "Bar", plan: "Básico",
  status: "ativo", since: "2025-01-01", fee: "8", orders: 0, revenue: 0,
  byPay: { credito: 0, debito: 0, pix: 0, usdc: 0 },
  phone: "", email: "", website: "", whatsapp: "", instagram: "",
  user: "", password: "", posto: "", radius: "",
});
const stat = (establishmentId: string): MonthlyStatLite => ({
  establishmentId, year: 2026, month: 7, orders: 300, gmv: 30000,
  byCredit: 12000, byDebit: 6000, byPix: 9000, byUsdc: 3000,
});

describe("scaleFromStats", () => {
  it("mês cheio usa o stat do mês", () => {
    const [r] = scaleFromStats([est("a")], [stat("a")], "mes", "2026-07");
    expect(r.pOrders).toBe(300);
    expect(r.pRevenue).toBe(30000);
    expect(r.pByPay.pix).toBe(9000);
  });
  it("dia = 1/30 do mês", () => {
    const [r] = scaleFromStats([est("a")], [stat("a")], "dia", "2026-07");
    expect(r.pOrders).toBe(10);
    expect(r.pRevenue).toBeCloseTo(1000, 2);
  });
  it("mês sem stat vira zero", () => {
    const [r] = scaleFromStats([est("a")], [stat("a")], "mes", "2026-06");
    expect(r.pOrders).toBe(0);
    expect(r.pRevenue).toBe(0);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar** — `npx vitest run tests/admin/scale.test.ts` → FAIL (sem `scaleFromStats`).

- [ ] **Step 4: Implementar em `lib/admin/scale.ts`** (adicionar; manter `scaleEsts`/`factorFor`/`monthOptions`)

```ts
export type MonthlyStatLite = {
  establishmentId: string;
  year: number;
  month: number;
  orders: number;
  gmv: number;
  byCredit: number;
  byDebit: number;
  byPix: number;
  byUsdc: number;
};

/** Scale each establishment by the selected month's rollup row and the period fraction. */
export function scaleFromStats(
  ests: AdminEst[],
  stats: MonthlyStatLite[],
  period: string,
  month: string,
): ScaledEst[] {
  const [y, m] = month.split("-").map(Number);
  const frac = periodFraction(period);
  return ests.map((e) => {
    const s = stats.find(
      (x) => x.establishmentId === e.id && x.year === y && x.month === m,
    );
    const g = s ? s.gmv : 0;
    const o = s ? s.orders : 0;
    return {
      ...e,
      pOrders: Math.round(o * frac),
      pRevenue: g * frac,
      pByPay: {
        credito: (s?.byCredit ?? 0) * frac,
        debito: (s?.byDebit ?? 0) * frac,
        pix: (s?.byPix ?? 0) * frac,
        usdc: (s?.byUsdc ?? 0) * frac,
      },
    };
  });
}
```

- [ ] **Step 5: Rodar e ver passar** — `npx vitest run tests/admin/scale.test.ts` → PASS.

- [ ] **Step 6: Commit (opcional)** — `git add lib/admin/scale.ts lib/data/admin.ts tests/admin/scale.test.ts && git commit -m "feat(admin): scaleFromStats + isLive"`

---

## Task 4: Adaptadores DB → view-model (TDD)

**Files:** Create `lib/admin/adapters.ts`, `tests/admin/adapters.test.ts`

**Interfaces:**
- Produces `toAdminEst`, `toMonthlyStatLite`, `toAdminOrder`, `toSearchEventRows`, `methodToKey`.

- [ ] **Step 1: Escrever o teste (falhando)** — `tests/admin/adapters.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { toAdminOrder, toSearchEventRows, methodToKey } from "@/lib/admin/adapters";

describe("methodToKey", () => {
  it("mapeia enum -> chave pt", () => {
    expect(methodToKey("CREDIT")).toBe("credito");
    expect(methodToKey("PIX")).toBe("pix");
  });
});

describe("toAdminOrder", () => {
  it("monta a string de itens, método e total", () => {
    const o = toAdminOrder(
      {
        id: "o1", code: "PED-1", establishmentId: "e1",
        createdAt: new Date("2026-07-01T12:00:00Z"), total: 96, customerName: "Lucas",
        items: [{ qty: 1, name: "Filé" }, { qty: 2, name: "Heineken" }],
        payment: null, splitShares: [{ id: "s" }],
      } as never,
      0,
    );
    expect(o.est).toBe("e1");
    expect(o.m).toBe("split");
    expect(o.items).toBe("1× Filé, 2× Heineken");
    expect(o.total).toBe(96);
    expect(o.cust).toBe("Lucas");
  });
  it("usa o método do payment quando não é split", () => {
    const o = toAdminOrder(
      {
        id: "o2", code: "PED-2", establishmentId: "e1",
        createdAt: new Date(), total: 50, customerName: null,
        items: [{ qty: 1, name: "X" }],
        payment: { method: "CREDIT", cardMask: "Visa •••• 1" }, splitShares: [],
      } as never,
      1,
    );
    expect(o.m).toBe("credito");
    expect(o.card).toBe("Visa •••• 1");
  });
});

describe("toSearchEventRows", () => {
  it("explode uma linha em pares de dimensão", () => {
    const rows = toSearchEventRows({
      city: "Itajaí/SC", neighborhood: null, cuisine: "Frutos do mar", type: null,
      createdAt: new Date("2026-07-05T00:00:00Z"),
    } as never);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.field).sort()).toEqual(["city", "cuisine"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/admin/adapters.test.ts` → FAIL.

- [ ] **Step 3: Implementar `lib/admin/adapters.ts`**

```ts
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
  website: string | null; whatsapp: string | null; instagram: string | null; isLive: boolean;
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
    user: db.users?.[0]?.email ?? "",
    password: "",
    posto: db.posto ?? "",
    radius: db.radiusM != null ? String(db.radiusM) : "",
    isLive: db.isLive,
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
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run tests/admin/adapters.test.ts` → PASS.

- [ ] **Step 5: Commit (opcional)** — `git add lib/admin/adapters.ts tests/admin/adapters.test.ts && git commit -m "feat(admin): adaptadores DB → view-model"`

---

## Task 5: Leituras + validação + Server Actions (CRUD)

**Files:** Create `lib/db/admin.ts`, `lib/actions/admin.ts`; Modify `lib/validation.ts`

**Interfaces:**
- Produces reads `getAdminEstablishments`, `listMonthlyStats`, `listAllOrders`, `listSearchEvents`; actions `createEstablishmentAction`, `updateEstablishmentAction`, `deleteEstablishmentAction`, `updateFeeAction`; `establishmentUpsertSchema`.

- [ ] **Step 1: `establishmentUpsertSchema` em `lib/validation.ts`** (adicionar ao fim)

```ts
export const establishmentUpsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  owner: z.string().min(1),
  type: z.string().min(1),
  city: z.string().optional(),
  neighborhood: z.string().optional(),
  posto: z.string().optional(),
  radiusM: z.string().optional(),
  plan: z.string().min(1),
  platformFeePct: z.coerce.number().int().min(0).max(100),
  user: z.string().email(),
  password: z.string().optional(), // required on create; blank on edit = keep
  phone: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  whatsapp: z.string().optional(),
  instagram: z.string().optional(),
});
export type EstablishmentUpsertInput = z.infer<typeof establishmentUpsertSchema>;
```

- [ ] **Step 2: `lib/db/admin.ts` (leituras)**

```ts
import { prisma } from "./prisma";

export function getAdminEstablishments() {
  return prisma.establishment.findMany({
    orderBy: { name: "asc" },
    include: {
      users: { where: { role: "ESTABLISHMENT" }, take: 1, select: { email: true } },
    },
  });
}

export function listMonthlyStats() {
  return prisma.monthlyStat.findMany();
}

export function listAllOrders() {
  return prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: { items: true, payment: true, splitShares: { select: { id: true } } },
  });
}

export function listSearchEvents() {
  return prisma.searchEvent.findMany({ orderBy: { createdAt: "desc" } });
}
```

- [ ] **Step 3: `lib/actions/admin.ts` (Server Actions)**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import {
  establishmentUpsertSchema,
  type EstablishmentUpsertInput,
} from "@/lib/validation";

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function assertAdmin() {
  const s = await getSession();
  if (s?.role !== "ADMIN") throw new Error("unauthorized");
}

export async function updateFeeAction(id: string, pct: number): Promise<void> {
  await assertAdmin();
  await prisma.establishment.update({ where: { id }, data: { platformFeePct: pct } });
  revalidatePath("/admin");
}

export async function createEstablishmentAction(
  input: EstablishmentUpsertInput,
): Promise<{ ok: boolean; error?: string }> {
  await assertAdmin();
  const data = establishmentUpsertSchema.parse(input);
  if (!data.password || data.password.length < 6)
    return { ok: false, error: "passwordRequired" };
  const existing = await prisma.user.findUnique({ where: { email: data.user.toLowerCase() } });
  if (existing) return { ok: false, error: "emailTaken" };

  const est = await prisma.establishment.create({
    data: {
      slug: `${slugify(data.name)}-${Date.now().toString(36)}`,
      name: data.name,
      owner: data.owner,
      type: data.type,
      city: data.city || "—",
      neighborhood: data.neighborhood || null,
      posto: data.posto || null,
      radiusM: data.radiusM ? Number(data.radiusM) : null,
      plan: data.plan,
      platformFeePct: data.platformFeePct,
      phone: data.phone || null,
      email: data.email || null,
      website: data.website || null,
      whatsapp: data.whatsapp || null,
      instagram: data.instagram || null,
    },
  });
  await prisma.user.create({
    data: {
      email: data.user.toLowerCase(),
      passwordHash: await hashPassword(data.password),
      name: data.name,
      role: "ESTABLISHMENT",
      establishmentId: est.id,
    },
  });
  revalidatePath("/admin");
  return { ok: true };
}

export async function updateEstablishmentAction(
  input: EstablishmentUpsertInput,
): Promise<{ ok: boolean; error?: string }> {
  await assertAdmin();
  const data = establishmentUpsertSchema.parse(input);
  if (!data.id) return { ok: false, error: "missingId" };
  await prisma.establishment.update({
    where: { id: data.id },
    data: {
      name: data.name,
      owner: data.owner,
      type: data.type,
      city: data.city || "—",
      neighborhood: data.neighborhood || null,
      posto: data.posto || null,
      radiusM: data.radiusM ? Number(data.radiusM) : null,
      plan: data.plan,
      platformFeePct: data.platformFeePct,
      phone: data.phone || null,
      email: data.email || null,
      website: data.website || null,
      whatsapp: data.whatsapp || null,
      instagram: data.instagram || null,
    },
  });
  // Update the login's email; only rehash the password if a new one was provided.
  const est = await prisma.establishment.findUnique({
    where: { id: data.id },
    include: { users: { where: { role: "ESTABLISHMENT" }, take: 1 } },
  });
  const user = est?.users[0];
  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        email: data.user.toLowerCase(),
        name: data.name,
        ...(data.password && data.password.length >= 6
          ? { passwordHash: await hashPassword(data.password) }
          : {}),
      },
    });
  }
  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteEstablishmentAction(id: string): Promise<void> {
  await assertAdmin();
  await prisma.establishment.delete({ where: { id } }); // cascades users/menu/orders/stats
  revalidatePath("/admin");
}
```

- [ ] **Step 4: Typecheck + build** — `npx tsc --noEmit` e `npm run build` → sem erros.

- [ ] **Step 5: Commit (opcional)** — `git add lib/db/admin.ts lib/actions/admin.ts lib/validation.ts && git commit -m "feat(admin): leituras + Server Actions de CRUD"`

---

## Task 6: Wire `admin/page.tsx` + `AdminApp` + seções

**Files:** Modify `app/[locale]/admin/page.tsx`, `components/admin/AdminApp.tsx`, `components/admin/sections/{Cadastros,Faturamento,Taxas,Dashboard}Section.tsx`

**Interfaces:** Consumes reads (Task 5), adapters (Task 4), `scaleFromStats` (Task 3), actions (Task 5).

- [ ] **Step 1: `app/[locale]/admin/page.tsx` — fetch-once + view-models**

Substituir o corpo do componente (mantendo `generateMetadata`) por:
```tsx
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/auth/session";
import {
  getAdminEstablishments,
  listAllOrders,
  listMonthlyStats,
  listSearchEvents,
} from "@/lib/db/admin";
import {
  toAdminEst,
  toAdminOrder,
  toMonthlyStatLite,
  toSearchEventRows,
} from "@/lib/admin/adapters";
import { AdminApp } from "@/components/admin/AdminApp";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "panel.placeholder.admin" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (session?.role !== "ADMIN") redirect({ href: "/login", locale });

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const nowD = new Date(now);
  const curY = nowD.getFullYear();
  const curM = nowD.getMonth() + 1;

  const [dbEsts, dbStats, dbOrders, dbEvents] = await Promise.all([
    getAdminEstablishments(),
    listMonthlyStats(),
    listAllOrders(),
    listSearchEvents(),
  ]);

  const stats = dbStats.map(toMonthlyStatLite);
  const ests = dbEsts.map((e) =>
    toAdminEst(
      e,
      stats.find((s) => s.establishmentId === e.id && s.year === curY && s.month === curM),
    ),
  );
  const orders = dbOrders.map((o, i) => toAdminOrder(o, i));
  const events = dbEvents.flatMap(toSearchEventRows);

  return <AdminApp now={now} ests={ests} stats={stats} orders={orders} events={events} />;
}
```

- [ ] **Step 2: `AdminApp.tsx` — props + `scaleFromStats` + actions**

Substituir o arquivo inteiro por:
```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { AdminEst, AdminOrder, SearchEvent } from "@/lib/data/admin";
import { scaleFromStats, type MonthlyStatLite } from "@/lib/admin/scale";
import {
  createEstablishmentAction,
  deleteEstablishmentAction,
  updateEstablishmentAction,
  updateFeeAction,
} from "@/lib/actions/admin";
import { Link } from "@/i18n/navigation";
import { AdminContext, type AdminTabId, type AdminValue } from "./context";
import { AdminSidebar } from "./AdminSidebar";
import { PeriodBar } from "./PeriodBar";
import { DashboardSection } from "./sections/DashboardSection";
import { FaturamentoSection } from "./sections/FaturamentoSection";
import { BuscasSection } from "./sections/BuscasSection";
import { CadastrosSection } from "./sections/CadastrosSection";
import { TaxasSection } from "./sections/TaxasSection";
import { BacklogSection } from "./sections/BacklogSection";
import { RegEditorModal, type RegPayload } from "./modals/RegEditorModal";
import { ConfirmDialog } from "@/components/panel/modals/ConfirmDialog";

function currentMonth(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function AdminApp({
  now,
  ests,
  stats,
  orders,
  events,
}: {
  now: number;
  ests: AdminEst[];
  stats: MonthlyStatLite[];
  orders: AdminOrder[];
  events: SearchEvent[];
}) {
  const t = useTranslations("admin");
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<AdminTabId>("dashboard");
  const [period, setPeriod] = useState("mes");
  const [month, setMonth] = useState(() => currentMonth(now));
  const [estabScope, setEstabScope] = useState("");

  const [editing, setEditing] = useState<{ est: AdminEst | null } | null>(null);
  const [del, setDel] = useState<AdminEst | null>(null);

  const allScaled = useMemo(
    () => scaleFromStats(ests, stats, period, month),
    [ests, stats, period, month],
  );
  const scopedScaled = useMemo(
    () => (estabScope ? allScaled.filter((e) => e.id === estabScope) : allScaled),
    [allScaled, estabScope],
  );

  const value = useMemo<AdminValue>(
    () => ({
      now,
      tab,
      setTab,
      period,
      setPeriod,
      month,
      setMonth,
      estabScope,
      setEstabScope,
      ests,
      orders,
      events,
      allScaled,
      scopedScaled,
      updateFee: (id, v) => {
        const pct = Math.round(parseFloat(v.replace(",", ".")) || 0);
        startTransition(() => updateFeeAction(id, pct));
      },
      openReg: (est) => setEditing({ est }),
      askDelete: (est) => setDel(est),
    }),
    [now, tab, period, month, estabScope, ests, orders, events, allScaled, scopedScaled],
  );

  const saveReg = (payload: RegPayload, id: string | null) => {
    const input = {
      id: id ?? undefined,
      name: payload.name,
      owner: payload.owner,
      type: payload.tipo,
      city: payload.city,
      neighborhood: payload.neigh,
      posto: payload.posto,
      radiusM: payload.radius,
      plan: payload.plan,
      platformFeePct: Math.round(parseFloat(payload.fee.replace(",", ".")) || 8),
      user: payload.user,
      password: payload.password || undefined,
      phone: payload.phone,
      email: payload.email,
      website: payload.website,
      whatsapp: payload.whatsapp,
      instagram: payload.instagram,
    };
    startTransition(async () => {
      if (id) await updateEstablishmentAction(input);
      else await createEstablishmentAction(input);
    });
    setEditing(null);
    setTab("cadastros");
  };

  return (
    <AdminContext.Provider value={value}>
      <div className="min-h-screen bg-page">
        <header className="sticky top-0 z-40 flex h-[84px] items-center bg-ink">
          <div className="box-border w-[248px] flex-shrink-0 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/jurandir-logo-horizontal.svg"
              alt="Jurandir"
              className="block w-full rounded-[10px]"
            />
          </div>
          <Link
            href="/painel"
            className="ml-auto flex items-center gap-1.5 pr-6 text-sm text-sand/80"
          >
            <span className="ms text-[17px]">storefront</span>
            {t("estPanel")}
          </Link>
        </header>

        <div className="flex min-h-[calc(100vh-84px)] items-stretch">
          <AdminSidebar />
          <main className="box-border min-w-0 flex-1 p-6 md:px-7 md:py-6">
            {(tab === "dashboard" || tab === "faturamento") && <PeriodBar />}
            {tab === "dashboard" && <DashboardSection />}
            {tab === "faturamento" && <FaturamentoSection />}
            {tab === "buscas" && <BuscasSection />}
            {tab === "cadastros" && <CadastrosSection />}
            {tab === "taxas" && <TaxasSection />}
            {tab === "backlog" && <BacklogSection />}
          </main>
        </div>

        {editing && (
          <RegEditorModal
            est={editing.est}
            onClose={() => setEditing(null)}
            onSave={saveReg}
          />
        )}
        {del && (
          <ConfirmDialog
            icon="delete"
            title={t("confirm.title")}
            body={t.rich("confirm.body", { name: del.name, b: (c) => <b>{c}</b> })}
            confirmLabel={t("confirm.delete")}
            onCancel={() => setDel(null)}
            onConfirm={() => {
              const id = del.id;
              startTransition(() => deleteEstablishmentAction(id));
              setDel(null);
            }}
          />
        )}
      </div>
    </AdminContext.Provider>
  );
}
```

- [ ] **Step 3: Badge "AO VIVO" → `isLive` (4 arquivos)**

- `sections/CadastrosSection.tsx`: `const canDel = e.id !== "live";` → `const canDel = !e.isLive;` e `{e.id === "live" && (` → `{e.isLive && (`.
- `sections/FaturamentoSection.tsx`: `{e.id === "live" && (` → `{e.isLive && (`.
- `sections/TaxasSection.tsx`: `{e.id === "live" && (` → `{e.isLive && (`.
- `sections/DashboardSection.tsx`: `live: e.id === "live",` → `live: !!e.isLive,`.

- [ ] **Step 4: Taxas — persistir fee onBlur (não a cada tecla)**

Em `sections/TaxasSection.tsx`, o `<input>` de fee: trocar o controle direto por estado local + persistência onBlur. Substituir o input:
```tsx
              <FeeInput value={e.fee} onCommit={(v) => updateFee(e.id, v)} />
```
E adicionar, no fim do arquivo:
```tsx
function FeeInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      className="w-16 rounded-lg border-2 border-ink/15 p-2 text-right text-sm outline-none focus:border-ink"
    />
  );
}
```
Adicionar `import { useState } from "react";` no topo do arquivo.

- [ ] **Step 5: Build + lint + testes**

Run: `npm run build` → passa.
Run: `npm run lint` → limpo.
Run: `npm test` → todos passam.

- [ ] **Step 6: Commit (opcional)** — `git add app/ components/admin && git commit -m "feat(admin): wire UI ao banco (fetch-once + actions)"`

---

## Task 7: Verificação (script + Playwright)

**Files:** Create `scripts/verify-admin.ts`

- [ ] **Step 1: `scripts/verify-admin.ts`**

```ts
/** Verifica agregados do admin + CRUD. Requer DATABASE_URL + seed aplicado.
 *  npx tsx scripts/verify-admin.ts */
import { PrismaClient } from "@prisma/client";
import { getAdminEstablishments, listMonthlyStats } from "../lib/db/admin";
import {
  createEstablishmentAction,
} from "../lib/actions/admin";

const prisma = new PrismaClient();
let fail = 0;
const check = (n: string, c: boolean) => {
  console.log(`${c ? "PASS" : "FAIL"}  ${n}`);
  if (!c) fail++;
};

async function main() {
  const stats = await listMonthlyStats();
  check("há rollup de MonthlyStat", stats.length > 100);
  const ests = await getAdminEstablishments();
  check("13 estabelecimentos", ests.length === 13);
  check("Quiosque do Mar é isLive", ests.some((e) => e.isLive));
  const withUser = ests.filter((e) => e.users.length > 0).length;
  check("estabelecimentos têm login", withUser >= 13);

  // GMV do mês atual > 0
  const now = new Date();
  const cur = stats.filter((s) => s.year === now.getFullYear() && s.month === now.getMonth() + 1);
  const gmv = cur.reduce((a, s) => a + Number(s.gmv), 0);
  check("GMV do mês atual > 0", gmv > 0);

  console.log(fail ? `\n${fail} FALHA(S)` : "\nTODOS OS CHECKS PASSARAM");
  if (fail) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

> Nota: `createEstablishmentAction`/`deleteEstablishmentAction` chamam `getSession()` (cookies) e `revalidatePath`, que só funcionam dentro do request do Next — **não** rodam neste script `tsx`. Por isso o CRUD é verificado via Playwright (Step 3), não aqui. O import acima é só ilustrativo; se causar erro de `server-only`/`next/cache`, remover a linha do import de actions.

- [ ] **Step 2: Rodar o script**

Run: `npx tsx scripts/verify-admin.ts`
Expected: TODOS OS CHECKS PASSARAM. (Se falhar por import de action, remover esse import — os checks usados são só de leitura.)

- [ ] **Step 3: Playwright (dashboard real + CRUD)**

Escrever um script Playwright no scratchpad que:
1. `addCookies` com `jur_session` de um ADMIN válido — obtê-lo logando via UI (`/login` com `admin@jurandir.app`/`admin1234`) e reusando o contexto.
2. Vai em `/admin`, confere que o dashboard mostra número de GMV não-zero (ex.: `getByText(/R\$\s?\d/)` visível) e o badge "AO VIVO" aparece.
3. Cadastros → "Cadastrar", preenche nome/dono/tipo/user/senha, salva → o novo estabelecimento aparece na lista (após revalidate).
4. Coleta `pageerror` — deve ser vazio.

Rodar contra `npm run start` numa porta livre (padrão do projeto). Confirmar: dashboard com números reais, CRUD refletindo, zero erros.

- [ ] **Step 4: Verificação final**

Run: `npm test` · `npm run build` · `npm run lint` → tudo limpo.

- [ ] **Step 5: Commit (opcional)** — `git add scripts/verify-admin.ts && git commit -m "test(admin): verificação de agregados + CRUD"`

---

## Self-review (autor)

- **Cobertura do spec:** MonthlyStat/SearchEvent/isLive + migration (T1) · seed rollup+events+backlog (T2) · scaleFromStats + isLive (T3) · adaptadores (T4) · leituras + Zod + Server Actions CRUD (T5) · wiring page/AdminApp + badge isLive + fee onBlur + senha-em-branco-na-edição (T6) · verificação (T7). Fonte agregada = rollup ✓; UI preservada (shapes `ScaledEst`/`AdminOrder`/`SearchEvent`) ✓.
- **Sem placeholders:** código real em cada passo. (T7 nota honestamente que o CRUD via action não roda em `tsx` — vai por Playwright.)
- **Consistência de tipos:** `MonthlyStatLite`, `AdminEst.isLive`, `EstablishmentUpsertInput`, e os adaptadores usam os mesmos nomes entre T3–T6. `RegPayload` (tipos/campos `tipo/neigh/radius/fee`) é mapeado para `EstablishmentUpsertInput` em `saveReg`.
- **Fora de escopo:** sub-projetos B e A; realtime; rollup automático a partir de `Order`.
