# Religar App do Cliente ao banco — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o App do Cliente ler estabelecimento+cardápio do banco por slug e persistir pedidos reais (full/split/parcelas) via Server Actions públicas, com "Meus pedidos" via localStorage + fetch do DB.

**Architecture:** Server component busca o estabelecimento por slug + cardápio, adapta para os view-models do app, e passa ao `ClientApp`. A criação de pedido (`finish`), o pagamento de shares e "Meus pedidos" chamam Server Actions **públicas** (cliente anônimo) que reusam `createOrder`/`payShare` da Fase 2. Ids de pedidos criados ficam no `localStorage["jur_orders_<slug>"]`.

**Tech Stack:** Next 16 (App Router) · Prisma/Postgres (Neon) · zod · Vitest · Playwright.

## Global Constraints

- **Next.js modificado** (`AGENTS.md`): ler `node_modules/next/dist/docs/` antes de código específico de Next.
- Dinheiro em `Decimal`; converter para `number` na borda (adaptadores usam `Number(x)`).
- **Público/anônimo:** `createOrderAction`/`payShareAction`/`getMyOrdersAction` NÃO exigem sessão. Ids são cuid (não-adivinháveis).
- Sem mudança de schema. Reusa `createOrder`/`payShare` de `lib/db/orders.ts` e `orderCreateSchema` de `lib/validation.ts`.
- Preservar a UI do app (Fase 4). Só `finish`/`myOrders`/`payShare` tocam o banco; carrinho/checkout seguem client-side.
- **Neon configurado**; DB com dados limpos (19 itens no Quiosque do Mar).
- **Git:** repo não é git; commits opcionais (pular).
- i18n inalterado (nomes de itens = dado do tenant, PT).

---

## Estrutura de arquivos

**Criar:**
- `lib/app/adapters.ts` — `toAppEstablishment`, `toAppMenuItem`, `toClientOrder`, `appToEnum`.
- `lib/actions/app.ts` — `createOrderAction`, `payShareAction`, `getMyOrdersAction`.
- `tests/app/adapters.test.ts`.

**Modificar:**
- `lib/data/app.ts` — `AppEstablishment` ganha `id: string`; `APP_EST` recebe um `id`.
- `lib/app/helpers.ts` — `ClientOrder` ganha `dbId?: string`.
- `lib/db/orders.ts` — adicionar `getOrdersByIds(ids)`.
- `app/[locale]/[slug]/page.tsx` — fetch est+menu por slug (`notFound()` se não existir).
- `components/app/ClientApp.tsx` — `menu` prop; `finish`/`payShare` via actions; carregar `myOrders` do localStorage+DB.

---

## Task 1: Types + adapters + reads (TDD)

**Files:** Modify `lib/data/app.ts`, `lib/app/helpers.ts`, `lib/db/orders.ts`; Create `lib/app/adapters.ts`, `tests/app/adapters.test.ts`

**Interfaces:**
- Produces: `AppEstablishment.id: string`; `ClientOrder.dbId?: string`; `getOrdersByIds(ids: string[])`; `toAppEstablishment(db)`, `toAppMenuItem(db)`, `toClientOrder(db)`, `appToEnum(payId): PaymentMethod`.

- [ ] **Step 1: Type edits**
  - `lib/data/app.ts`: in `type AppEstablishment`, add `id: string;` (first field). In the `APP_EST` object literal add `id: "quiosque-do-mar",` (the mock is a fallback; the page uses the DB row).
  - `lib/app/helpers.ts`: in `type ClientOrder`, add `dbId?: string;`.

- [ ] **Step 2: `getOrdersByIds` in `lib/db/orders.ts`** (append)
```ts
export function getOrdersByIds(ids: string[]) {
  return prisma.order.findMany({
    where: { id: { in: ids } },
    orderBy: { createdAt: "desc" },
    include: { items: true, payment: true, splitShares: { orderBy: { personIndex: "asc" } } },
  });
}
```

- [ ] **Step 3: Write failing tests** — `tests/app/adapters.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { appToEnum, toClientOrder, toAppMenuItem } from "@/lib/app/adapters";

describe("appToEnum", () => {
  it("maps app pay id → Prisma enum", () => {
    expect(appToEnum("credito")).toBe("CREDIT");
    expect(appToEnum("pix")).toBe("PIX");
    expect(appToEnum("usdc")).toBe("USDC");
  });
});

describe("toAppMenuItem", () => {
  it("uses sortOrder as the numeric id", () => {
    const m = toAppMenuItem({
      id: "cuid1", name: "Caipirinha", description: "d", price: 22, oldPrice: 28,
      photo: "p", measure: 300, unit: "ml", category: "Bebidas", subcategory: "Drinks", sortOrder: 1,
    } as never);
    expect(m.id).toBe(1);
    expect(m.dbId).toBe("cuid1");
    expect(m.price).toBe(22);
    expect(m.old).toBe(28);
  });
});

describe("toClientOrder", () => {
  const base = {
    id: "o1", number: 12, code: "PED-ABC", status: "IN_PRODUCTION",
    customerName: "Rômulo", note: "sem gelo", createdAt: new Date("2026-07-01T12:00:00Z"),
    subtotal: 121, platformFee: 9.68, serviceFee: 12.1,
    items: [{ qty: 1, name: "Combo Casal", unitPrice: 99 }, { qty: 1, name: "Caipirinha", unitPrice: 22 }],
  };
  it("maps a full-payment order", () => {
    const o = toClientOrder({
      ...base, payment: { method: "CREDIT", installments: 3 }, splitShares: [],
    } as never);
    expect(o.id).toBe(12);
    expect(o.dbId).toBe("o1");
    expect(o.code).toBe("PED-ABC");
    expect(o.status).toBe("producao");
    expect(o.total).toBe(121);
    expect(o.fee).toBe(9.68);
    expect(o.est).toBe(12.1);
    expect(o.pay).toEqual({ id: "credito", parc: 3 });
    expect(o.splits).toBeNull();
    expect(o.name).toBe("Rômulo");
  });
  it("maps a split order", () => {
    const o = toClientOrder({
      ...base, status: "AWAITING_PAYMENT", payment: null,
      splitShares: [{ personIndex: 0, method: "PIX", paid: true, amount: 71.39 }, { personIndex: 1, method: null, paid: false, amount: 71.39 }],
    } as never);
    expect(o.status).toBe("aguardando");
    expect(o.pay).toBeNull();
    expect(o.splits).toEqual([{ m: "pix", amount: 71.39 }, { m: null, amount: 71.39 }]);
  });
});
```

- [ ] **Step 4: Run → fail** — `npx vitest run tests/app/adapters.test.ts` → FAIL (module missing).

- [ ] **Step 5: Implement `lib/app/adapters.ts`**
```ts
import type { PaymentMethod } from "@prisma/client";
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
  payment: { method: string; installments: number } | null;
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
    pay: o.payment ? { id: ENUM_TO_APP[o.payment.method], parc: o.payment.installments } : null,
    splits,
  };
}
```
Note: `ClientOrder.status` type is `"aguardando" | "producao" | "entregue"` (from `lib/app/helpers.ts`). `MenuItem` is from `@/lib/data/panel` (the app reuses that type). `COVER_IMG` is exported by `lib/data/panel.ts`.

- [ ] **Step 6: Run → pass** — `npx vitest run tests/app/adapters.test.ts` → PASS. Then `npm test` + `npm run lint`.

- [ ] **Step 7: Commit (opcional)** — skip.

---

## Task 2: Public Server Actions

**Files:** Create `lib/actions/app.ts`

**Interfaces:**
- Consumes: `createOrder`/`payShare`/`getOrdersByIds` (`@/lib/db/orders`), `orderCreateSchema` (`@/lib/validation`), adapters (`@/lib/app/adapters`).
- Produces: `createOrderAction(input): Promise<{ ok: boolean; order?: ClientOrder; error?: string }>`, `payShareAction(orderId, personIndex, method): Promise<{ ok: boolean; order?: ClientOrder }>`, `getMyOrdersAction(ids): Promise<ClientOrder[]>`.

- [ ] **Step 1: `lib/actions/app.ts`**
```ts
"use server";

import { revalidatePath } from "next/cache";
import type { PaymentMethod } from "@prisma/client";
import { createOrder, payShare, getOrdersByIds } from "@/lib/db/orders";
import { orderCreateSchema, type OrderCreateInput } from "@/lib/validation";
import { toClientOrder } from "@/lib/app/adapters";
import type { ClientOrder } from "@/lib/app/helpers";

// Public (anonymous QR customer) — no session required.
export async function createOrderAction(
  input: OrderCreateInput,
): Promise<{ ok: boolean; order?: ClientOrder; error?: string }> {
  const parsed = orderCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const created = await createOrder(parsed.data);
    return { ok: true, order: toClientOrder(created) };
  } catch {
    return { ok: false, error: "failed" };
  }
}

export async function payShareAction(
  orderId: string,
  personIndex: number,
  method: PaymentMethod,
): Promise<{ ok: boolean; order?: ClientOrder }> {
  try {
    const updated = await payShare(orderId, personIndex, method);
    if (!updated) return { ok: false };
    revalidatePath("/painel"); // establishment panel sees the status flip
    return { ok: true, order: toClientOrder(updated) };
  } catch {
    return { ok: false };
  }
}

export async function getMyOrdersAction(ids: string[]): Promise<ClientOrder[]> {
  if (!ids.length) return [];
  const rows = await getOrdersByIds(ids);
  return rows.map(toClientOrder);
}
```
Note: `createOrder` already returns the order with `items/payment/splitShares` included (ORDER_INCLUDE), so `toClientOrder` has everything. `payShare` returns the updated order with the same include.

- [ ] **Step 2: Typecheck + build + lint** — `npx tsc --noEmit`, `npm run build`, `npm run lint` → clean.

- [ ] **Step 3: Commit (opcional)** — skip.

---

## Task 3: Wire page + ClientApp

**Files:** Modify `app/[locale]/[slug]/page.tsx`, `components/app/ClientApp.tsx`

**Interfaces:** Consumes reads (`getEstablishmentBySlug` from `@/lib/db/establishments`, `listMenu` from `@/lib/db/menu`), adapters (Task 1), actions (Task 2).

- [ ] **Step 1: `app/[locale]/[slug]/page.tsx` — fetch by slug**
```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getEstablishmentBySlug } from "@/lib/db/establishments";
import { listMenu } from "@/lib/db/menu";
import { toAppEstablishment, toAppMenuItem } from "@/lib/app/adapters";
import { ClientApp } from "@/components/app/ClientApp";
import { BEACH_TYPES } from "@/lib/data/admin";
import { DEFAULT_LOC_BEACH, DEFAULT_LOC_TABLE } from "@/lib/data/app";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const est = await getEstablishmentBySlug(slug);
  return { title: est?.name ?? "Jurandir" };
}

export default async function ClientAppPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ local?: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const dbEst = await getEstablishmentBySlug(slug);
  if (!dbEst) notFound();
  const dbMenu = await listMenu(dbEst.id);

  const beach = BEACH_TYPES.includes(dbEst.type);
  const { local } = await searchParams;
  const loc = local ?? (beach ? DEFAULT_LOC_BEACH : DEFAULT_LOC_TABLE);

  return (
    <ClientApp
      est={toAppEstablishment(dbEst)}
      menu={dbMenu.map(toAppMenuItem)}
      beach={beach}
      loc={loc}
    />
  );
}
```

- [ ] **Step 2: `ClientApp.tsx` — props, actions, localStorage**

- Change the signature to require `est` and add `menu`:
```tsx
export function ClientApp({
  est, menu, beach, loc,
}: {
  est: AppEstablishment;
  menu: MenuItem[];
  beach: boolean;
  loc: string;
}) {
```
  Remove the `const menu = APP_MENU;` line and the `APP_EST`/`APP_MENU`/`makeOrderCode`/`FIRST_ID`/`nextId` usages that become dead. Keep `CATS`, `PayId`, `AppEstablishment`. Import `MenuItem` from `@/lib/data/panel`. Import `appToEnum` from `@/lib/app/adapters` and the three actions from `@/lib/actions/app`. Add `import { useTransition } from "react"` (or reuse a plain async call inside the handlers — but keep `paying` state for the spinner).

- Replace `finish` with a DB-backed version (build the `orderCreateSchema` input, call `createOrderAction`, persist the id to localStorage, set `lastOrder`/`myOrders` from the returned order):
```tsx
const STORAGE_KEY = `jur_orders_${est.slug}`;

const finish = (sharesArg: Share[] | null) => {
  const items = cart.map((c) => {
    const m = menu.find((x) => x.id === c.id)!;
    return { name: m.name, qty: c.qty, unitPrice: m.price };
  });
  const payment = sharesArg
    ? { kind: "split" as const, shares: sharesArg.map((s) => ({ method: s.m ? appToEnum(s.m) : null })) }
    : { kind: "full" as const, method: appToEnum(selPay!), installments: selPay === "credito" ? parc : 1 };
  setPaying(true);
  (async () => {
    const r = await createOrderAction({
      establishmentId: est.id,
      locationLabel: loc,
      posto: beach ? est.posto : undefined,
      customerName: custName.trim() || undefined,
      note: note.trim() || undefined,
      items,
      payment,
    });
    setPaying(false);
    if (!r.ok || !r.order) { toastMsg(t("orderError")); return; }
    const order = r.order;
    try {
      const ids: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (order.dbId && !ids.includes(order.dbId)) localStorage.setItem(STORAGE_KEY, JSON.stringify([order.dbId, ...ids]));
    } catch {}
    setMyOrders((prev) => [order, ...prev]);
    setLastOrder(order);
    setCart([]); setSelPay(null); setParc(1); setMode("full"); setPeople(2); setPaid([null, null]); setNote("");
    setStep("done");
  })();
};
```
  (Drop the `finishTimer`/`setTimeout` mock. Keep the `finishTimer` ref cleanup only if still referenced — remove it if now unused. Use the existing `setToast` for the error, or add a translated key `app.orderError`; simplest: `setToast(t("orderError"))` after adding `app.orderError` PT "Não foi possível enviar o pedido." / EN "Could not send the order." to messages — do that and use `t("orderError")`.)

- Load `myOrders` from localStorage + DB on mount:
```tsx
useEffect(() => {
  let ids: string[] = [];
  try { ids = JSON.parse(localStorage.getItem(`jur_orders_${est.slug}`) ?? "[]"); } catch {}
  if (ids.length) getMyOrdersAction(ids).then(setMyOrders).catch(() => {});
}, [est.slug]);
```

- Rewire `payShare` to call the action (look up the order's `dbId` from `myOrders`, then re-fetch):
```tsx
payShare: (orderId, idx, id) => {
  const o = myOrders.find((x) => x.id === orderId);
  if (!o?.dbId) return;
  (async () => {
    const r = await payShareAction(o.dbId!, idx, appToEnum(id));
    if (r.ok) {
      let ids: string[] = [];
      try { ids = JSON.parse(localStorage.getItem(`jur_orders_${est.slug}`) ?? "[]"); } catch {}
      const fresh = await getMyOrdersAction(ids);
      setMyOrders(fresh);
    }
  })();
},
```
  Update the `value` useMemo dependency array to drop `nextId` and keep `myOrders` (already present).

- [ ] **Step 3: Add `app.orderError` message key** to `messages/pt.json` + `messages/en.json` (PT "Não foi possível enviar o pedido." / EN "Could not send the order.") and use `t("orderError")` in the finish error path. (Add `const t = useTranslations("app");`-equivalent — but ClientApp is not currently using `useTranslations`; the screens do. Simplest: use a literal via `setToast` OR add the key and read it. If ClientApp has no `useTranslations`, add `import { useTranslations } from "next-intl"; const t = useTranslations("app");` at the top of ClientApp and use `t("orderError")`.)

- [ ] **Step 4: Build + lint + tests** — `npm run build`, `npm run lint`, `npm test` → all clean. Confirm `node -e "require('./messages/pt.json');require('./messages/en.json')"` parses.

- [ ] **Step 5: Commit (opcional)** — skip.

---

## Task 4: Verification (Playwright — the payoff)

**Files:** none (scratchpad scripts)

- [ ] **Step 1: Build + start server** — `npm run build`, then `PORT=<free> npm run start` (background, poll ready).

- [ ] **Step 2: Playwright E2E — order flows through to panel/admin**
Write a Playwright script (in the scratchpad that has `playwright`):
1. **Create a full-pay order:** goto `/quiosque-do-mar?local=Guarda-sol%20nº%2014`; on the QR screen fill the name and click "Ver cardápio e pedir"; add an item (an item card "Add" button); open the cart bar → "Ir para o pagamento"; on checkout, "Pagar tudo" → pick "Pix" → click the sticky "Pagar R$ …" button; wait; assert the confirmation screen shows a real code matching `/PED-[0-9A-F]{8}/`; capture the code.
2. **My orders from DB:** click "Ver Meus Pedidos com O Jurandir"; assert the order (its code) is listed. Reload the page (`/quiosque-do-mar…`), go to "Meus pedidos" again → the order is STILL there (localStorage + DB fetch persisted).
3. **Panel sees it:** in a new context, login `contato@quiosquedomar.com.br` / `demo1234` → `/painel` → Pedidos → assert an order with that customer name / code is present (the real order created in step 1).
4. **Split flow:** create a split order (checkout → "Dividir conta" → set 1 friend paid → "Enviar pedido"); confirmation shows "Pagamento parcial recebido"; in My Orders, complete the remaining share → the order becomes paid/producao.
5. Collect `pageerror` → none. Screenshots. Stop the server.
If a selector is unclear, dump `innerText`/screenshot and adjust.

- [ ] **Step 3: Final gates** — `npm test` + `npm run build` + `npm run lint` clean.

- [ ] **Step 4: Commit (opcional)** — skip.

---

## Self-review (autor)

- **Spec coverage:** reads by slug + adapters + notFound (T1/T3) · public Server Actions create/payShare/getMyOrders (T2) · ClientApp finish→DB, myOrders via localStorage+DB, payShare→DB (T3) · verification incl. order appearing in panel/admin + split + reload persistence (T4). `toClientOrder` maps full/split/fees/status; `appToEnum` app→enum. No schema change; reuses createOrder/payShare.
- **Placeholders:** nenhum — código real; a edição do `finish`/`payShare` está com o código exato a inserir.
- **Consistência de tipos:** `AppEstablishment.id`, `ClientOrder.dbId?`, `MenuItem` (de panel, com `dbId?`/`id`), `OrderCreateInput` (full `{kind:"full",method,installments}` / split `{kind:"split",shares:[{method}]}`), `appToEnum` — usados igualmente entre T1–T3. `getOrdersByIds`/`toClientOrder` definidos em T1, consumidos em T2.
- **Fora de escopo:** gateway real, realtime, rate-limiting; landing leads/busca (não é este sub-projeto).
