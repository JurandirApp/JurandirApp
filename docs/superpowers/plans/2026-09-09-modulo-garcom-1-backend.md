# Módulo do Garçom — Plano 1: Backend (dados + endpoints)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar toda a fundação de backend do Módulo do Garçom — modelo de dados, autenticação de garçom, e os endpoints de bar/garçom/device — deixando o fluxo de entrega parcial funcional e testável via API, antes de qualquer tela.

**Architecture:** A entrega é por **quantidade** (contadores no `OrderItem`), com transições atômicas via `updateMany` guardado (dois garçons nunca pegam a mesma unidade). Cada transição grava um `OrderEvent` (auditoria). O pedido vira `DELIVERED` quando todas as linhas fecham. Segue os padrões atuais do repo (`authEstablishment`, actions/rotas com `force-dynamic` + CORS, validação Zod, funções de DB em `lib/db/*`).

**Tech Stack:** Next.js 16 (Turbopack), Prisma/Neon, Zod, vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-modulo-garcom-entrega-design.md` (leia junto — este plano argumenta a partir dele).

## Global Constraints

- **Este NÃO é o Next.js que você conhece** (AGENTS.md): leia o guia em `node_modules/next/dist/docs/` antes de escrever rota/action. Respeite avisos de deprecação.
- **`prisma db push` é rodado pelo USUÁRIO** (política do projeto — o executor NÃO roda migração/DB). O executor roda `npx prisma generate`.
- **Sem mocks** a não ser pagamento/impressora — integrações reais (Neon).
- **Tudo escopado por `establishmentId`** (defense-in-depth): garçom só vê/age no bar dele; toda query/update filtra por estabelecimento.
- Reusar padrões existentes: `authEstablishment`/bearer em `lib/auth/bearer.ts`, `export const dynamic = "force-dynamic"`, headers CORS, Zod em `lib/validation.ts`, funções puras de domínio em `lib/domain/`, acesso a dados em `lib/db/`.
- Testes: vitest (`npx vitest run`). Lógica pura → testada. Camada de DB/rotas (dependem do Neon) → validadas por `npx tsc --noEmit` + verificação manual (o projeto não testa a camada de DB com banco real).

---

## File Structure

**Criar:**
- `lib/domain/delivery.ts` — helpers puros (código de entrega, checagem de pedido completo, montagem de timeline).
- `lib/db/waiters.ts` — CRUD de garçom + atividade.
- `lib/db/delivery.ts` — operações de entrega (marcar pronto, listar prontos, pegar, entregar).
- `lib/db/devices.ts` — registro de device token.
- `lib/auth/waiter.ts` — `authWaiter(req)`.
- `app/api/public/panel/order-items/[id]/ready/route.ts` — bar marca pronto.
- `app/api/public/panel/waiters/route.ts` — CRUD garçom (GET/POST/DELETE).
- `app/api/public/panel/orders/[id]/timeline/route.ts` — timeline do pedido.
- `app/api/public/waiter/ready/route.ts` — lista prontos do garçom.
- `app/api/public/waiter/order-items/[id]/pick/route.ts` — pegar.
- `app/api/public/waiter/order-items/[id]/deliver/route.ts` — entregar (código).
- `app/api/public/devices/route.ts` — registrar token.
- `tests/domain/delivery.test.ts` — testes dos helpers puros.

**Modificar:**
- `prisma/schema.prisma` — Role WAITER, contadores no OrderItem, campos no Order, OrderEvent, DeviceToken.
- `lib/validation.ts` — schemas novos.
- `lib/auth/bearer.ts` (se necessário) — expor helper reaproveitável de leitura do token.
- A action/rota de login — aceitar/retornar role `WAITER` (verificar).

---

## Task 1: Schema Prisma (dados do módulo)

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: enum `Role` += `WAITER`; enum `OrderEventType`; `OrderItem.qtyReady/qtyOutForDelivery/qtyDelivered`; `Order.customerPhone/clientId`; models `OrderEvent`, `DeviceToken`; relations `Order.events`, `User.deliveredEvents`.

- [ ] **Step 1: Adicionar WAITER ao enum Role**

```prisma
enum Role {
  ADMIN
  ESTABLISHMENT
  WAITER
}
```

- [ ] **Step 2: Adicionar contadores no `OrderItem`** (logo após `options Json?`)

```prisma
  // Entrega parcial por quantidade (o restante está "preparando").
  qtyReady          Int @default(0)
  qtyOutForDelivery Int @default(0)
  qtyDelivered      Int @default(0)
```

- [ ] **Step 3: Adicionar campos e relação no `Order`**

```prisma
  customerPhone String?
  clientId      String?
  events        OrderEvent[]
```

- [ ] **Step 4: Adicionar enum + models novos** (perto de OrderItem)

```prisma
enum OrderEventType {
  PAID
  IN_PRODUCTION
  READY
  PICKED
  DELIVERED
}

model OrderEvent {
  id          String         @id @default(cuid())
  orderId     String
  order       Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)
  orderItemId String?
  type        OrderEventType
  qty         Int?
  waiterId    String?
  waiter      User?          @relation("WaiterEvents", fields: [waiterId], references: [id], onDelete: SetNull)
  at          DateTime       @default(now())

  @@index([orderId])
}

model DeviceToken {
  id              String   @id @default(cuid())
  token           String   @unique
  userId          String?
  clientId        String?
  establishmentId String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([establishmentId])
  @@index([clientId])
}
```

- [ ] **Step 5: Adicionar a relação inversa no `User`** (para `OrderEvent.waiter`)

```prisma
  deliveredEvents OrderEvent[] @relation("WaiterEvents")
```

- [ ] **Step 6: Gerar o client (NÃO rodar db push — é do usuário)**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" sem erro.

- [ ] **Step 7: Avisar o usuário** que precisa rodar `npx prisma db push` no Neon antes dos endpoints funcionarem. Commit.

```bash
git add prisma/schema.prisma
git commit -m "feat(garcom): schema do modulo do garcom (WAITER, contadores, OrderEvent, DeviceToken)"
```

---

## Task 2: Validação Zod

**Files:**
- Modify: `lib/validation.ts`

**Interfaces:**
- Produces: `waiterUpsertSchema`/`WaiterUpsertInput`; `markReadySchema`; `pickItemSchema`; `deliverItemSchema`; `deviceRegisterSchema`.

- [ ] **Step 1: Adicionar os schemas** (no fim de `lib/validation.ts`)

```ts
export const waiterUpsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(120),
  user: z.string().min(1).max(120),      // login (email ou username)
  password: z.string().min(4).optional(), // obrigatório no create; vazio no edit = mantém
});
export type WaiterUpsertInput = z.infer<typeof waiterUpsertSchema>;

export const markReadySchema = z.object({ qty: z.number().int().positive() });
export const pickItemSchema = z.object({ qty: z.number().int().positive() });
export const deliverItemSchema = z.object({
  qty: z.number().int().positive(),
  code: z.string().min(1).max(8),
});
export const deviceRegisterSchema = z.object({
  token: z.string().min(1),
  clientId: z.string().optional(),
});
```

- [ ] **Step 2: Verificar tipos** — Run: `npx tsc --noEmit` → sem erro. Commit.

```bash
git add lib/validation.ts
git commit -m "feat(garcom): schemas Zod (waiter, ready/pick/deliver, device)"
```

---

## Task 3: Helpers puros de domínio (com testes)

**Files:**
- Create: `lib/domain/delivery.ts`
- Test: `tests/domain/delivery.test.ts`

**Interfaces:**
- Produces:
  - `deliveryCode(customerPhone: string | null, fallback: string | null): string` — 4 últimos dígitos do telefone; se não houver, usa/gera o fallback.
  - `randomCode4(): string` — 4 dígitos aleatórios (fallback de pedidos sem telefone).
  - `isOrderFullyDelivered(items: {qty:number; qtyDelivered:number}[]): boolean`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from "vitest";
import { deliveryCode, isOrderFullyDelivered } from "@/lib/domain/delivery";

describe("deliveryCode", () => {
  it("usa os 4 últimos dígitos do telefone, ignorando máscara", () => {
    expect(deliveryCode("(91) 99999-4587", null)).toBe("4587");
  });
  it("cai no fallback quando não há telefone", () => {
    expect(deliveryCode(null, "1234")).toBe("1234");
  });
  it("telefone com menos de 4 dígitos → usa o que tem, zero-pad à esquerda", () => {
    expect(deliveryCode("12", null)).toBe("0012");
  });
});

describe("isOrderFullyDelivered", () => {
  it("true quando toda linha tem qtyDelivered == qty", () => {
    expect(isOrderFullyDelivered([{ qty: 5, qtyDelivered: 5 }, { qty: 1, qtyDelivered: 1 }])).toBe(true);
  });
  it("false quando falta entregar", () => {
    expect(isOrderFullyDelivered([{ qty: 5, qtyDelivered: 3 }])).toBe(false);
  });
  it("false para pedido sem itens (defensivo)", () => {
    expect(isOrderFullyDelivered([])).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npx vitest run tests/domain/delivery.test.ts` → FAIL ("Cannot find module").

- [ ] **Step 3: Implementar `lib/domain/delivery.ts`**

```ts
/** 4 últimos dígitos do telefone do cliente (ignora máscara). Sem telefone →
 *  usa o fallback (código aleatório salvo por pedido). Zero-pad se tiver menos. */
export function deliveryCode(customerPhone: string | null, fallback: string | null): string {
  const digits = (customerPhone ?? "").replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(-4);
  if (digits.length > 0) return digits.padStart(4, "0");
  return fallback ?? randomCode4();
}

export function randomCode4(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

/** Pedido completo = TODA linha entregue por inteiro. Vazio = não completo. */
export function isOrderFullyDelivered(items: { qty: number; qtyDelivered: number }[]): boolean {
  return items.length > 0 && items.every((i) => i.qtyDelivered >= i.qty);
}
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npx vitest run tests/domain/delivery.test.ts` → PASS. Commit.

```bash
git add lib/domain/delivery.ts tests/domain/delivery.test.ts
git commit -m "feat(garcom): helpers de dominio (codigo de entrega, pedido completo) + testes"
```

---

## Task 4: Auth de garçom + CRUD de garçom (DB)

**Files:**
- Create: `lib/auth/waiter.ts`, `lib/db/waiters.ts`
- Modify: `lib/auth/bearer.ts` (só se `authEstablishment` não expuser um helper reaproveitável de decode)

**Interfaces:**
- Consumes: `waiterUpsertSchema` (Task 2); o mesmo esquema de token/sessão de `lib/auth/bearer.ts`.
- Produces:
  - `authWaiter(req: Request): Promise<{ userId: string; establishmentId: string } | null>` — valida token E `role === "WAITER"`.
  - `upsertWaiter(establishmentId, input): Promise<{id,name,user}|null>`
  - `deleteWaiter(id, establishmentId): Promise<{count:number}>`
  - `listWaiters(establishmentId): Promise<{id,name,user}[]>`
  - `waiterActivity(establishmentId, waiterId): Promise<OrderEvent[]>` (eventos PICKED/DELIVERED do garçom)

- [ ] **Step 1: Ler `lib/auth/bearer.ts`** para reusar exatamente o mesmo mecanismo de token de `authEstablishment` (mesma verificação/segredo). `authWaiter` = mesma leitura, mas exige `role === "WAITER"` e retorna `establishmentId`.

- [ ] **Step 2: Implementar `lib/auth/waiter.ts`**

```ts
// Espelha authEstablishment, mas exige role WAITER. Ajuste os imports/nomes ao
// que bearer.ts expõe (ex.: uma função decodeBearer(req) que devolve a sessão).
import { prisma } from "@/lib/db/prisma";
import { readBearer } from "./bearer"; // criar/expor em bearer.ts se ainda não existir

export async function authWaiter(req: Request): Promise<{ userId: string; establishmentId: string } | null> {
  const session = await readBearer(req); // { userId, role, establishmentId } | null
  if (!session || session.role !== "WAITER" || !session.establishmentId) return null;
  return { userId: session.userId, establishmentId: session.establishmentId };
}
```

- [ ] **Step 3: Implementar `lib/db/waiters.ts`** (segue o padrão de `lib/db/menu.ts`)

```ts
import { prisma } from "./prisma";
import { hashPassword } from "@/lib/auth/passwords"; // reusar o hash já usado no cadastro de usuários
import { waiterUpsertSchema, type WaiterUpsertInput } from "@/lib/validation";

export async function listWaiters(establishmentId: string) {
  const rows = await prisma.user.findMany({
    where: { establishmentId, role: "WAITER" },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, user: r.email }));
}

export async function upsertWaiter(establishmentId: string, input: WaiterUpsertInput) {
  const data = waiterUpsertSchema.parse(input);
  if (data.id) {
    const r = await prisma.user.updateMany({
      where: { id: data.id, establishmentId, role: "WAITER" },
      data: {
        name: data.name,
        email: data.user,
        ...(data.password ? { passwordHash: await hashPassword(data.password) } : {}),
      },
    });
    if (r.count === 0) return null;
    return { id: data.id, name: data.name, user: data.user };
  }
  if (!data.password) return null; // senha obrigatória no create
  const u = await prisma.user.create({
    data: {
      name: data.name,
      email: data.user,
      passwordHash: await hashPassword(data.password),
      role: "WAITER",
      establishment: { connect: { id: establishmentId } },
    },
    select: { id: true, name: true, email: true },
  });
  return { id: u.id, name: u.name, user: u.email };
}

export function deleteWaiter(id: string, establishmentId: string) {
  return prisma.user.deleteMany({ where: { id, establishmentId, role: "WAITER" } });
}

export function waiterActivity(establishmentId: string, waiterId: string) {
  return prisma.orderEvent.findMany({
    where: { waiterId, order: { establishmentId }, type: { in: ["PICKED", "DELIVERED"] } },
    orderBy: { at: "desc" },
    take: 100,
  });
}
```

> Nota ao executor: confirme o nome real do helper de hash de senha (procure onde `passwordHash` é setado hoje — provavelmente `lib/auth/*`). Reuse-o; não crie outro.

- [ ] **Step 4: Verificar tipos** — Run: `npx tsc --noEmit` → sem erro. Commit.

```bash
git add lib/auth/waiter.ts lib/db/waiters.ts lib/auth/bearer.ts
git commit -m "feat(garcom): authWaiter + CRUD de garcom (db)"
```

---

## Task 5: Operações de entrega (DB) — marcar pronto / listar / pegar / entregar

**Files:**
- Create: `lib/db/delivery.ts`

**Interfaces:**
- Consumes: `isOrderFullyDelivered`, `deliveryCode`, `randomCode4` (Task 3).
- Produces:
  - `markItemReady(establishmentId, orderItemId, qty): Promise<{ok:boolean}>`
  - `listReadyItems(establishmentId): Promise<{orderId,orderItemId,name,mesa,cliente,qtyReady}[]>`
  - `pickItem(establishmentId, waiterId, orderItemId, qty): Promise<{ok:boolean}>`
  - `deliverItem(establishmentId, waiterId, orderItemId, qty, code): Promise<{ok:boolean; error?:"code"|"qty"|"notfound"; orderDone?:boolean}>`

- [ ] **Step 1: Implementar `lib/db/delivery.ts`**

```ts
import { prisma } from "./prisma";
import { isOrderFullyDelivered, deliveryCode } from "@/lib/domain/delivery";

/** Bar marca N unidades prontas. Transação: lê o item (escopo estab), valida que
 *  há "preparando" suficiente, incrementa qtyReady e grava OrderEvent(READY). */
export async function markItemReady(establishmentId: string, orderItemId: string, qty: number) {
  return prisma.$transaction(async (tx) => {
    const it = await tx.orderItem.findFirst({
      where: { id: orderItemId, order: { establishmentId } },
      select: { id: true, orderId: true, qty: true, qtyReady: true, qtyOutForDelivery: true, qtyDelivered: true },
    });
    if (!it) return { ok: false as const };
    const preparing = it.qty - (it.qtyReady + it.qtyOutForDelivery + it.qtyDelivered);
    if (qty > preparing) return { ok: false as const };
    await tx.orderItem.update({ where: { id: it.id }, data: { qtyReady: { increment: qty } } });
    await tx.orderEvent.create({ data: { orderId: it.orderId, orderItemId: it.id, type: "READY", qty } });
    return { ok: true as const };
  });
}

export async function listReadyItems(establishmentId: string) {
  const rows = await prisma.orderItem.findMany({
    where: { order: { establishmentId }, qtyReady: { gt: 0 } },
    select: {
      id: true, name: true, qtyReady: true,
      order: { select: { id: true, locationLabel: true, customerName: true, createdAt: true } },
    },
    orderBy: { order: { createdAt: "asc" } },
  });
  return rows.map((r) => ({
    orderId: r.order.id, orderItemId: r.id, name: r.name,
    mesa: r.order.locationLabel, cliente: r.order.customerName ?? "", qtyReady: r.qtyReady,
  }));
}

/** Pegar: decremento ATÔMICO guardado (updateMany é um único UPDATE). count===0
 *  → outro garçom já levou. Grava OrderEvent(PICKED). */
export async function pickItem(establishmentId: string, waiterId: string, orderItemId: string, qty: number) {
  const r = await prisma.orderItem.updateMany({
    where: { id: orderItemId, order: { establishmentId }, qtyReady: { gte: qty } },
    data: { qtyReady: { decrement: qty }, qtyOutForDelivery: { increment: qty } },
  });
  if (r.count === 0) return { ok: false as const };
  const it = await prisma.orderItem.findUnique({ where: { id: orderItemId }, select: { orderId: true } });
  if (it) await prisma.orderEvent.create({ data: { orderId: it.orderId, orderItemId, type: "PICKED", qty, waiterId } });
  return { ok: true as const };
}

/** Entregar: valida código (4 últimos do telefone OU fallback do pedido),
 *  decremento atômico de qtyOutForDelivery→qtyDelivered, grava DELIVERED, e
 *  fecha o pedido se todas as linhas foram entregues. */
export async function deliverItem(
  establishmentId: string, waiterId: string, orderItemId: string, qty: number, code: string,
) {
  const it = await prisma.orderItem.findFirst({
    where: { id: orderItemId, order: { establishmentId } },
    select: { id: true, orderId: true, order: { select: { customerPhone: true } } },
  });
  if (!it) return { ok: false as const, error: "notfound" as const };
  // Fallback: se não há telefone, o código foi salvo no evento de criação (ver Task 8).
  const fallback = await pedidoFallbackCode(it.orderId);
  if (code !== deliveryCode(it.order.customerPhone, fallback)) {
    return { ok: false as const, error: "code" as const };
  }
  const r = await prisma.orderItem.updateMany({
    where: { id: orderItemId, qtyOutForDelivery: { gte: qty } },
    data: { qtyOutForDelivery: { decrement: qty }, qtyDelivered: { increment: qty } },
  });
  if (r.count === 0) return { ok: false as const, error: "qty" as const };
  await prisma.orderEvent.create({ data: { orderId: it.orderId, orderItemId, type: "DELIVERED", qty, waiterId } });
  // Completou o pedido?
  const items = await prisma.orderItem.findMany({ where: { orderId: it.orderId }, select: { qty: true, qtyDelivered: true } });
  const done = isOrderFullyDelivered(items);
  if (done) await prisma.order.update({ where: { id: it.orderId }, data: { status: "DELIVERED" } });
  return { ok: true as const, orderDone: done };
}

/** Código de fallback do pedido (só usado quando não há telefone): armazenado
 *  como um OrderEvent leve na criação (ver Task 8) ou derivado de forma estável. */
async function pedidoFallbackCode(orderId: string): Promise<string | null> {
  const o = await prisma.order.findUnique({ where: { id: orderId }, select: { code: true } });
  // Estável e sem telefone: 4 últimos dígitos do "number" do pedido, zero-pad.
  const n = await prisma.order.findUnique({ where: { id: orderId }, select: { number: true } });
  return n ? String(n.number).slice(-4).padStart(4, "0") : (o?.code ?? null);
}
```

> Decisão de implementação registrada: o fallback (pedido sem telefone) usa os **4 últimos dígitos do `Order.number`** (estável, já existe, único) em vez de um aleatório persistido — mais simples e determinístico. O app do cliente exibe esse mesmo código quando não há telefone.

- [ ] **Step 2: Verificar tipos** — Run: `npx tsc --noEmit` → sem erro. Commit.

```bash
git add lib/db/delivery.ts
git commit -m "feat(garcom): operacoes de entrega (marcar pronto/listar/pegar/entregar) com claim atomico"
```

---

## Task 6: Registro de device token (DB)

**Files:**
- Create: `lib/db/devices.ts`

**Interfaces:**
- Produces: `registerDevice({token, userId?, clientId?, establishmentId?}): Promise<void>` — upsert por `token`.

- [ ] **Step 1: Implementar `lib/db/devices.ts`**

```ts
import { prisma } from "./prisma";

export async function registerDevice(input: {
  token: string; userId?: string | null; clientId?: string | null; establishmentId?: string | null;
}) {
  await prisma.deviceToken.upsert({
    where: { token: input.token },
    create: {
      token: input.token,
      userId: input.userId ?? null,
      clientId: input.clientId ?? null,
      establishmentId: input.establishmentId ?? null,
    },
    update: {
      userId: input.userId ?? null,
      clientId: input.clientId ?? null,
      establishmentId: input.establishmentId ?? null,
    },
  });
}
```

- [ ] **Step 2: `npx tsc --noEmit`** → sem erro. Commit.

```bash
git add lib/db/devices.ts
git commit -m "feat(garcom): registro de device token (upsert por token)"
```

---

## Task 7: Rotas do painel (bar marca pronto, CRUD garçom, timeline)

**Files:**
- Create: `app/api/public/panel/order-items/[id]/ready/route.ts`, `app/api/public/panel/waiters/route.ts`, `app/api/public/panel/orders/[id]/timeline/route.ts`

**Interfaces:**
- Consumes: `authEstablishment` (existente), `markItemReady`/`listWaiters`/`upsertWaiter`/`deleteWaiter`/`waiterActivity` (Tasks 4-5), `markReadySchema`/`waiterUpsertSchema` (Task 2), `enqueue push` (deixar TODO comentado ligando pra Plano 5).
- Produces: endpoints REST autenticados por estabelecimento.

> Modelo de rota: copie o cabeçalho de `app/api/public/establishment/menu/route.ts` (CORS, `dynamic="force-dynamic"`, `OPTIONS`, checagem `authEstablishment`).

- [ ] **Step 1: `.../order-items/[id]/ready/route.ts`**

```ts
import { authEstablishment } from "@/lib/auth/bearer";
import { markItemReady } from "@/lib/db/delivery";
import { markReadySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  const { id } = await ctx.params;
  const parsed = markReadySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 422, headers: CORS });
  const r = await markItemReady(s.establishmentId!, id, parsed.data.qty);
  // TODO(Plano 5): push aos garçons do bar quando r.ok.
  return Response.json({ ok: r.ok }, { status: r.ok ? 200 : 409, headers: CORS });
}
```

- [ ] **Step 2: `.../panel/waiters/route.ts`** — GET (listWaiters), POST (upsertWaiter), DELETE (?id=). Mesmo padrão de auth/CORS (métodos: `GET, POST, DELETE, OPTIONS`). Corpo do POST validado por `waiterUpsertSchema`; `establishmentId` sempre do token.

- [ ] **Step 3: `.../panel/orders/[id]/timeline/route.ts`** — GET: retorna `prisma.orderEvent.findMany({ where: { orderId: id, order: { establishmentId } }, orderBy: { at: "asc" }, include: { waiter: { select: { name: true } } } })`. (Escopo por estabelecimento no `where`.)

- [ ] **Step 4: `npx tsc --noEmit`** → sem erro. Commit.

```bash
git add app/api/public/panel
git commit -m "feat(garcom): rotas do painel (marcar pronto, CRUD garcom, timeline)"
```

---

## Task 8: Rotas do garçom (ready / pick / deliver)

**Files:**
- Create: `app/api/public/waiter/ready/route.ts`, `app/api/public/waiter/order-items/[id]/pick/route.ts`, `app/api/public/waiter/order-items/[id]/deliver/route.ts`

**Interfaces:**
- Consumes: `authWaiter` (Task 4); `listReadyItems`/`pickItem`/`deliverItem` (Task 5); `pickItemSchema`/`deliverItemSchema` (Task 2).
- Produces: endpoints REST autenticados por garçom.

- [ ] **Step 1: `waiter/ready/route.ts`** — GET: `authWaiter` → `listReadyItems(establishmentId)` → `{ items }`. CORS `GET, OPTIONS`.

- [ ] **Step 2: `waiter/order-items/[id]/pick/route.ts`** — POST: `authWaiter`; valida `pickItemSchema`; `pickItem(establishmentId, userId, id, qty)`. `r.ok` false → 409 "já retirado". `// TODO(Plano 5): push ao cliente 'a caminho'`.

- [ ] **Step 3: `waiter/order-items/[id]/deliver/route.ts`** — POST: `authWaiter`; valida `deliverItemSchema`; `deliverItem(establishmentId, userId, id, qty, code)`. Mapear erro: `code`→422 `{error:"code"}`; `qty`→409; `notfound`→404. `// TODO(Plano 5): push ao cliente 'entregue'`.

```ts
// deliver/route.ts — corpo do POST (após auth + validação):
const r = await deliverItem(s.establishmentId, s.userId, id, parsed.data.qty, parsed.data.code);
if (!r.ok) {
  const status = r.error === "code" ? 422 : r.error === "notfound" ? 404 : 409;
  return Response.json({ ok: false, error: r.error }, { status, headers: CORS });
}
return Response.json({ ok: true, orderDone: r.orderDone }, { headers: CORS });
```

- [ ] **Step 4: `npx tsc --noEmit`** → sem erro. Commit.

```bash
git add app/api/public/waiter
git commit -m "feat(garcom): rotas do garcom (ready/pick/deliver com codigo)"
```

---

## Task 9: Rota de registro de device

**Files:**
- Create: `app/api/public/devices/route.ts`

**Interfaces:**
- Consumes: `registerDevice` (Task 6); `deviceRegisterSchema` (Task 2); `authWaiter` (opcional — se header presente, vincula garçom).

- [ ] **Step 1: Implementar** — POST: valida `deviceRegisterSchema`. Tenta `authWaiter(req)`; se garçom, `registerDevice({token, userId, establishmentId})`; senão `registerDevice({token, clientId})`. CORS `POST, OPTIONS`. Retorna `{ ok: true }`.

- [ ] **Step 2: `npx tsc --noEmit`** → sem erro. Commit.

```bash
git add app/api/public/devices
git commit -m "feat(garcom): rota de registro de device token"
```

---

## Task 10: Login aceitar role WAITER

**Files:**
- Modify: a action/rota de login (procurar por onde `loginSchema` é usado — provável `lib/actions/*` ou `app/api/public/login/route.ts`)

**Interfaces:**
- Produces: login que autentica `User` com `role === "WAITER"` e retorna `{ role: "WAITER", establishmentId }` no payload/token, do mesmo jeito que ESTABLISHMENT.

- [ ] **Step 1: Ler o fluxo de login atual** e confirmar se ele já autentica qualquer `User` (independente de role) — provavelmente **já funciona** pra WAITER, só é preciso garantir que o token carrega `role` e `establishmentId`. Se já for genérico, esta task é só verificação.

- [ ] **Step 2: Se necessário, ajustar** o retorno pra incluir `role`/`establishmentId` (o app usa `role` pra rotear — Plano 4). Não introduzir lógica específica de WAITER além de deixar o login genérico.

- [ ] **Step 3: `npx tsc --noEmit`** + `npx vitest run` (garantir que nada quebrou). Commit se houve mudança.

```bash
git add -A
git commit -m "feat(garcom): login aceita/retorna role WAITER"
```

---

## Self-Review (cobertura do spec — fatia backend)

- **§4 modelo de dados** → Task 1 (schema), Task 2 (Zod). ✅
- **§5.1 CRUD garçom** → Task 4 + Task 7. ✅
- **§5.2 marcar pronto** → Task 5 (`markItemReady`) + Task 7. ✅
- **§5.3 listar prontos** → Task 5 (`listReadyItems`) + Task 8. ✅
- **§5.4 pegar (claim atômico)** → Task 5 (`pickItem`) + Task 8. ✅
- **§5.5 entregar + código + completude** → Task 3 (helpers) + Task 5 (`deliverItem`) + Task 8. ✅
- **§5.6 device token** → Task 6 + Task 9. ✅
- **§5.7 timeline + atividade do garçom** → Task 4 (`waiterActivity`) + Task 7 (timeline). ✅
- **§7.3 fallback de código** → Task 5 (`pedidoFallbackCode` via `Order.number`). ✅
- **Auth garçom** → Task 4. ✅
- **§8 push** → NÃO neste plano (gatilhos deixados como `TODO(Plano 5)`). Coberto no Plano 5.

**Consistência de tipos:** nomes de funções (`markItemReady`, `pickItem`, `deliverItem`, `listReadyItems`, `registerDevice`, `authWaiter`, `deliveryCode`, `isOrderFullyDelivered`) usados igual nas rotas que os consomem. ✅

**Dependências externas do executor (confirmar no código antes):** nome real do helper de hash de senha; forma exata da sessão que `bearer.ts` decodifica (para `readBearer`/`authWaiter`). Ambos anotados nas tasks.
