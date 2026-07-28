# Religar a UI ao banco — Sub-projeto A: App do Cliente

Terceiro e último sub-projeto de "religar a UI ao banco" (C — Admin e B — Painel
do Estabelecimento já feitos). Faz o App do Cliente ler o estabelecimento+cardápio
do banco e **persistir pedidos reais** (via Server Actions públicas), que passam a
fluir para o Painel do Estabelecimento e o Admin.

## Contexto

- Backend da Fase 2 pronto: `createOrder` e `payShare` em `lib/db/orders.ts` já
  calculam taxas (8% plataforma + 10% serviço), geram code `PED-XXXXXXXX`, criam
  `Payment` (full, com parcelas/cartão mascarado) ou `SplitShare[]` (dividido), e
  definem o status — **pedido só vira `IN_PRODUCTION` quando 100% pago**.
  `orderCreateSchema` (Zod) já modela full/split. `Order.number` (autoincrement)
  existe (sub-projeto B).
- O App do Cliente (Fase 4) é client-side: lê `APP_EST`/`APP_MENU` (mock), cria o
  pedido só em memória (`ClientApp.finish`), e "Meus pedidos" é estado local.

## Decisões (aprovadas)

- **Server Actions públicas** (cliente anônimo via QR): `createOrder`/`payShare`
  não exigem sessão. Ids de pedido são cuid (não-adivinháveis) → pagar a parte de
  um amigo pelo link é aceitável para o fluxo.
- **"Meus pedidos" via localStorage + fetch do DB:** ao criar, guarda o id em
  `localStorage["jur_orders_<slug>"]`; a aba busca esses pedidos do banco →
  sobrevive a reload e reflete o status real (ex.: Entregue pelo estabelecimento).

## Escopo

- **Inclui:** leitura de estabelecimento+cardápio por slug; criação de pedido
  (full/split/parcelas) persistindo no banco; pagamento de shares; "Meus pedidos"
  do banco.
- **Não inclui:** gateway de pagamento real, realtime, "buscar em quiosques perto"
  (segue toast). Sem mudança de schema.

## Leituras (server component)

`app/[locale]/[slug]/page.tsx`:
- `getEstablishmentBySlug(slug)` → `notFound()` (404) se não existir.
- `listMenu(est.id)` → itens do cardápio.
- Adaptadores DB→view-model do app (`lib/app/adapters.ts`):
  - Estabelecimento → `{ slug, name, tagline, cover (fallback COVER_IMG), address,
    hours, posto, whatsapp, instagram, phone, website }` (o formato de `APP_EST`).
  - Item → `MenuItem` com **`id = sortOrder`** (único por estabelecimento, mantém o
    carrinho por id numérico sem alteração); `Decimal`→number.
  - `beach = BEACH_TYPES.includes(est.type)`.
- Passa `est`, `menu`, `beach`, `loc` (de `searchParams.local`) ao `ClientApp`,
  substituindo os mocks.

## Server Actions públicas (`lib/actions/app.ts`)

- `createOrderAction(input): { ok; order?; error? }` — valida `orderCreateSchema`,
  chama `createOrder`, retorna `{ ok, order: toClientOrder(created) }` (code,
  number, status para a confirmação + o id para o localStorage). Sem auth.
- `payShareAction(orderId, personIndex, method): { ok; order? }` — chama `payShare`,
  retorna o pedido atualizado (`toClientOrder`).
- `getMyOrdersAction(ids: string[]): ClientOrder[]` — busca `Order` por esses ids
  (com items/payment/splitShares), mapeia via `toClientOrder`. Retorna só os
  pedidos cujos ids o cliente passou.

## Adaptador `toClientOrder(dbOrder)`

DB `Order` (com items/payment/splitShares) → o `ClientOrder` do app
(`lib/app/helpers.ts`): `id = number`, `code`, `ts = createdAt`, `items =
[{name, qty, price}]`, `total = subtotal`, `fee = platformFee`, `est = serviceFee`,
`note`, `name = customerName`, `status`, `pay = payment ? { id: methodToKey(method),
parc: installments } : null`, `splits = splitShares ? [{ m, amount }] : null`.
`dbId = order.id` (cuid, para `payShareAction` e o localStorage).

## Wiring do `ClientApp`

- `finish(sharesArg)` → monta o input do `orderCreateSchema` (cart→itens
  `{name, qty, unitPrice}`; full `{ kind:"full", method: appToEnum(selPay),
  installments: parc, cardMask?: undefined }` ou split `{ kind:"split", shares:
  paid.map(m => ({ method: m ? appToEnum(m) : null })) }`; `establishmentId`,
  `locationLabel = loc`, `posto` (se beach), `customerName`, `note`). Chama
  `createOrderAction`; no sucesso: adiciona o `order.dbId` ao localStorage, seta
  `lastOrder = order` (code/number reais), vai para "done". Falha → toast.
  Mantém o "Processando pagamento…" (o setTimeout vira o await da action).
- `myOrders` — carregado no mount (e após criar) via `getMyOrdersAction(ids do
  localStorage)`; reflete o status real do DB.
- `payShare(dbId, personIndex, method)` → `payShareAction`; no sucesso re-busca
  (getMyOrdersAction) para atualizar a barra de progresso/status.
- `appToEnum`: credito→CREDIT, debito→DEBIT, pix→PIX, usdc→USDC.

## Verificação (o payoff)

- Unit (Vitest): `toClientOrder` (full/split, taxas, status) e `appToEnum`.
- Playwright E2E: no app (`/quiosque-do-mar`) criar um pedido full → confirmação
  com code real → "Meus pedidos" (do DB) mostra o pedido → **logar no Painel do
  Estabelecimento (Quiosque do Mar) e ver o pedido novo em Pedidos** → e no backlog
  do Admin. Split: criar dividido, pagar as partes → status vira `IN_PRODUCTION`.
  Reload do app preserva "Meus pedidos" (localStorage).
- `npm test` + `npm run build` + `npm run lint` limpos.

## Fora de escopo

- Gateway de pagamento real (Pix/cartão/USDC), webhooks, realtime, rate-limiting
  de criação anônima de pedidos (Fase 6).
