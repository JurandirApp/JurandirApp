# Módulo do Garçom — Plano 2: Painel do dono (marcar pronto + garçons + timeline)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Dar ao dono/bar as ferramentas do fluxo de entrega: marcar itens como prontos (nas **duas** superfícies — painel web e app do estabelecimento), cadastrar/gerenciar garçons, e ver a timeline/rastreio de cada pedido.

**Architecture:** O **painel web** (Next.js, `components/panel/*`) usa **server actions** (`lib/actions/panel.ts`, sessão via `requireEst`) que chamam direto as funções `lib/db/*` do Plano 1. O **app do estabelecimento** (Flutter, `jurandir-app`) usa as **rotas públicas** (bearer) do Plano 1. Ambos convergem nas mesmas funções de DB.

**Tech Stack:** Next.js 16, React, Prisma, Tailwind, next-intl; Flutter/Riverpod (estab app).

**Spec:** `docs/superpowers/specs/2026-09-09-modulo-garcom-entrega-design.md`
**Depende de:** Plano 1 (funções `markItemReady`, `listWaiters`, `upsertWaiter`, `deleteWaiter`, `waiterActivity` em `lib/db/*`; rota `POST /panel/order-items/[id]/ready`).

## Global Constraints
- Herda as constraints do Plano 1 (Next.js "not the one you know" → ler `node_modules/next/dist/docs/`; escopo por `establishmentId`; sem mocks).
- Painel web: seguir o padrão de `lib/actions/panel.ts` (`requireEst()` + `revalidatePath("/painel")`) e dos componentes em `components/panel/`. i18n: adicionar chaves em `messages/pt.json` e `messages/en.json`.
- Estab app: seguir o padrão de `jurandir-app/lib/features/estab/` e `public_api.dart` (bearer). Verificar com `flutter analyze`.

---

## File Structure
**Modificar (web):** `lib/actions/panel.ts` (actions novas), `components/panel/sections/PedidosSection.tsx` (botão marcar pronto), `components/panel/PanelApp.tsx` + `components/panel/context.tsx` (estado/handlers + nav), `messages/pt.json`/`en.json`.
**Criar (web):** `components/panel/sections/GarconsSection.tsx`, `components/panel/modals/WaiterEditorModal.tsx`, `components/panel/modals/TimelineModal.tsx`.
**Modificar (estab app):** `jurandir-app/lib/features/estab/presentation/estab_pedidos_screen.dart` (marcar pronto), `jurandir-app/lib/core/data/public_api.dart` (chamada da rota).

---

## Task 1: Server actions do painel (marcar pronto, garçons, timeline)

**Files:** Modify: `lib/actions/panel.ts`

**Interfaces:**
- Consumes: `requireEst()` (existente), `markItemReady`, `listWaiters`, `upsertWaiter`, `deleteWaiter`, `waiterActivity` (Plano 1), `prisma.orderEvent` (timeline).
- Produces: `markItemReadyAction(orderItemId, qty)`, `upsertWaiterAction(input)`, `deleteWaiterAction(id)`, `orderTimelineAction(orderId)`.

- [ ] **Step 1: Adicionar as actions** (seguindo o padrão de `upsertMenuItemAction`)

```ts
export async function markItemReadyAction(orderItemId: string, qty: number): Promise<{ ok: boolean }> {
  const s = await requireEst();
  const r = await markItemReady(s.establishmentId!, orderItemId, qty);
  if (r.ok) revalidatePath("/painel");
  return { ok: r.ok };
}

export async function upsertWaiterAction(input: Omit<WaiterUpsertInput, never>): Promise<{ ok: boolean; waiter?: { id: string; name: string; user: string } }> {
  const s = await requireEst();
  const w = await upsertWaiter(s.establishmentId!, input);
  if (!w) return { ok: false };
  revalidatePath("/painel");
  return { ok: true, waiter: w };
}

export async function deleteWaiterAction(id: string): Promise<void> {
  const s = await requireEst();
  await deleteWaiter(id, s.establishmentId!);
  revalidatePath("/painel");
}

export async function orderTimelineAction(orderId: string) {
  const s = await requireEst();
  return prisma.orderEvent.findMany({
    where: { orderId, order: { establishmentId: s.establishmentId! } },
    orderBy: { at: "asc" },
    include: { waiter: { select: { name: true } } },
  });
}
```

- [ ] **Step 2: Imports** — adicionar os imports de `@/lib/db/delivery`, `@/lib/db/waiters`, `WaiterUpsertInput`. Run `npx tsc --noEmit` → sem erro. Commit.

```bash
git add lib/actions/panel.ts
git commit -m "feat(garcom): server actions do painel (marcar pronto, garcom, timeline)"
```

---

## Task 2: Marcar pronto por item na tela de Pedidos (web)

**Files:** Modify: `components/panel/sections/PedidosSection.tsx`, `components/panel/context.tsx` (expor `markItemReady` handler), `components/panel/PanelApp.tsx` (implementar o handler chamando a action), `messages/pt.json`+`en.json`.

**Interfaces:**
- Consumes: `markItemReadyAction` (Task 1). O `Order` do painel precisa expor, por item, os contadores. **Pré-passo:** estender `toPanelOrder`/`Order` (`lib/panel/adapters.ts`, `lib/data/panel.ts`) pra incluir por item `{ orderItemId, qty, qtyReady, qtyOutForDelivery, qtyDelivered }`.

- [ ] **Step 1: Estender o adapter do painel** — em `lib/panel/adapters.ts`, no `toPanelOrder`, além de `items`/`itemOpts`, montar `itemStates: { id, qty, ready, out, delivered }[]` a partir de `o.items`. Adicionar `itemStates?` ao type `Order` em `lib/data/panel.ts`. `DbOrder.items` do adapter precisa selecionar `id, qtyReady, qtyOutForDelivery, qtyDelivered` (garantir no `ORDER_INCLUDE`/select de `listOrders`).

- [ ] **Step 2: UI de marcar pronto** — em `PedidosSection.tsx`, para cada item com `preparando = qty - (ready+out+delivered) > 0`, renderizar um controle "Pronto" com stepper (default = todo o preparando; permite menos) que chama `markItemReady(orderItemId, n)`. Mostrar também o breakdown ("3 prontas · 2 preparando · 1 entregue") pra clareza do bar.

```tsx
{o.itemStates?.map((it) => {
  const preparing = it.qty - (it.ready + it.out + it.delivered);
  if (preparing <= 0) return null;
  return (
    <div key={it.id} className="flex items-center justify-between gap-2 text-xs">
      <span>{it.qty}× (falta preparar {preparing})</span>
      <button type="button" onClick={() => markItemReady(it.id, preparing)}
        className="rounded-lg bg-ink px-2 py-1 font-bold text-sand">
        marcar {preparing} pronto
      </button>
    </div>
  );
})}
```

- [ ] **Step 3: Wire handler** — em `PanelApp.tsx`, `markItemReady = (id, qty) => startTransition(async () => { const r = await markItemReadyAction(id, qty); if (r.ok) { setMenu/refetch orders } else toast(erro) })`. Expor no context. i18n das strings.

- [ ] **Step 4:** `npx tsc --noEmit` → sem erro. Commit.

```bash
git add components/panel lib/panel/adapters.ts lib/data/panel.ts messages
git commit -m "feat(garcom): marcar item pronto na tela de Pedidos (web)"
```

---

## Task 3: Seção "Garçons" no painel (CRUD)

**Files:** Create: `components/panel/sections/GarconsSection.tsx`, `components/panel/modals/WaiterEditorModal.tsx`. Modify: `components/panel/PanelApp.tsx` (nav + estado `waiters`), `components/panel/context.tsx`, `messages/*`. Carregar `waiters` no server-side que monta o painel (onde os outros dados do estabelecimento são carregados) via `listWaiters`.

**Interfaces:** Consumes: `upsertWaiterAction`, `deleteWaiterAction` (Task 1); `listWaiters` (Plano 1, no loader do painel).

- [ ] **Step 1: Loader** — onde o painel carrega dados do estabelecimento (server component/página `/painel`), adicionar `listWaiters(establishmentId)` e passar `waiters` pro `PanelApp`.
- [ ] **Step 2: `GarconsSection.tsx`** — lista de garçons (nome + login) com botões editar/excluir + botão "Novo garçom" (abre `WaiterEditorModal`). Copiar o layout de `CardapioSection.tsx`.
- [ ] **Step 3: `WaiterEditorModal.tsx`** — form: Nome, Usuário (login), Senha (obrigatória no novo; "deixe em branco para manter" na edição). Copiar a estrutura de `ItemEditorModal.tsx`. Salvar via `upsertWaiterAction`.
- [ ] **Step 4: Nav** — adicionar "Garçons" ao menu lateral do `PanelApp.tsx` (perto de "Cardápio"/"Pedidos"). i18n.
- [ ] **Step 5:** `npx tsc --noEmit` → sem erro. Commit.

```bash
git add components/panel messages
git commit -m "feat(garcom): secao Garcons no painel (CRUD)"
```

---

## Task 4: Timeline/rastreio por pedido (web)

**Files:** Create: `components/panel/modals/TimelineModal.tsx`. Modify: `PedidosSection.tsx` (botão "Ver histórico"), `context.tsx`/`PanelApp.tsx` (abrir modal + chamar `orderTimelineAction`), `messages/*`.

**Interfaces:** Consumes: `orderTimelineAction` (Task 1).

- [ ] **Step 1: Botão** — em cada card de pedido, um "Ver histórico" que carrega `orderTimelineAction(order.dbId)` e abre o `TimelineModal`.
- [ ] **Step 2: `TimelineModal.tsx`** — renderiza os eventos em ordem, formatando `type` + `qty` + nome do garçom + hora. Ex.: "20:39 · Retirado 3× por Garçom João", "20:41 · Entregue 3×". Mapear `OrderEventType` → rótulo pt/en.
- [ ] **Step 3:** `npx tsc --noEmit` → sem erro. Commit.

```bash
git add components/panel messages
git commit -m "feat(garcom): timeline/rastreio por pedido (web)"
```

---

## Task 5: Marcar pronto no app do estabelecimento (Flutter)

**Files:** Modify: `jurandir-app/lib/core/data/public_api.dart` (chamada da rota), `jurandir-app/lib/features/estab/presentation/estab_pedidos_screen.dart` (UI), `jurandir-app/lib/core/data/models.dart` (expor contadores por item no `PanelOrder`).

**Interfaces:** Consumes: rota `POST /panel/order-items/:id/ready` (Plano 1, bearer). O `toPanelOrder` (web) já passa a expor os contadores (Task 2 Step 1) — garantir que o JSON de `/establishment/orders` inclua `itemStates` por item.

- [ ] **Step 1: Backend** — confirmar que a rota `/establishment/orders` (que serve o app estab) usa `toPanelOrder` e portanto já manda `itemStates`. Se o app usa outro shape, incluir os contadores no payload.
- [ ] **Step 2: Modelo** — em `PanelOrder.fromJson`, parsear `itemStates` (id, qty, ready, out, delivered) por item (alinhado por índice como `itemOpts`).
- [ ] **Step 3: public_api** — `Future<bool> markItemReady(String token, String orderItemId, int qty)` → `POST /panel/order-items/$orderItemId/ready` com bearer + `{qty}`.
- [ ] **Step 4: UI** — em `estab_pedidos_screen.dart`, para cada item com preparando>0, um botão "marcar N pronto" (stepper) chamando `markItemReady` e dando refresh na lista.
- [ ] **Step 5:** `flutter analyze lib/features/estab lib/core/data` → No issues. Commit.

```bash
cd ../jurandir-app && git add lib/features/estab lib/core/data/public_api.dart lib/core/data/models.dart
git commit -m "feat(garcom): marcar item pronto no app do estabelecimento"
```

---

## Self-Review (cobertura — fatia painel/dono)
- **§5.2 marcar pronto (nos 2)** → Task 2 (web) + Task 5 (estab app). ✅
- **§5.1/§7 CRUD garçom** → Task 1 + Task 3. ✅
- **§5.7 timeline + rastreio** → Task 1 (`orderTimelineAction`) + Task 4. ✅
- **Contadores por item expostos ao painel** → Task 2 Step 1. ✅
- **Consistência:** `markItemReadyAction`/`markItemReady` batem; `itemStates` usado igual no adapter, na UI web e no `PanelOrder`. ✅
- **Dependência do executor:** localizar o loader server-side do `/painel` (onde os dados do estabelecimento são buscados) pra injetar `listWaiters`. Anotado na Task 3.
