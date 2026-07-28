# Religar a UI ao banco — Sub-projeto C: Painel Admin

Primeiro dos três sub-projetos de "religar a UI ao banco" (os outros: B — Painel
do Estabelecimento; A — App do Cliente). Faz o Painel Admin consumir dados reais
do Postgres/Prisma no lugar dos mocks de `lib/data/admin.ts`, preservando a UI e
o comportamento atuais.

## Contexto

- Backend da Fase 2 pronto: `lib/db/*`, auth por sessão, `prisma`.
- O admin hoje é um client component (`AdminApp`) que computa tudo no cliente a
  partir de `SEED_ESTS` (baselines mensais por estabelecimento: `orders`,
  `revenue`, `byPay`) × `SEASON` (sazonalidade), via `lib/admin/scale.ts`
  (`scaleEsts`/`factorFor`/`monthOptions`). Backlog e Buscas usam `SEED_ORDERS`
  e `SEED_EVENTS`.

## Decisão-chave (aprovada)

Os agregados (GMV, receita, por tipo, top 5, por método) vêm de uma **tabela de
rollup** (`MonthlyStat`), seedada a partir das baselines × sazonalidade atuais —
não de `Order` crus. É o padrão de analytics (rollup); em produção seria populada
por um job a partir dos pedidos (futuro). Assim os números batem com a UI de hoje
e o seed fica leve (~156 linhas).

## Escopo

- **Inclui:** dashboard, faturamento, buscas, backlog (leituras) + Cadastros
  (CRUD de tenant) e Taxas (fee %) como escritas via Server Actions.
- **Não inclui:** sub-projetos B e A; realtime; rollup automático a partir de
  `Order`.

## Schema (nova migration)

- **`MonthlyStat`** (novo): `id`, `establishmentId` (FK, cascade), `year Int`,
  `month Int` (1–12), `orders Int`, `gmv Decimal(12,2)`, `byCredit/byDebit/byPix/
  byUsdc Decimal(12,2)`, `@@unique([establishmentId, year, month])`. `gmv` = GMV
  bruto do mês; receita de fee = `gmv × platformFeePct/100` (derivada). `byPay` =
  GMV do mês por método.
- **`SearchEvent`** estendido: adicionar `neighborhood String?` e `type String?`
  (as Buscas agregam por cidade/bairro/culinária/tipo). Mantém `query`, `city`,
  `cuisine`, `openNow`.
- **`Establishment`**: adicionar `isLive Boolean @default(false)` (o badge "AO
  VIVO" hoje testa `id === "live"`; com cuid isso quebra — passa a testar `isLive`).

## Seed (adições, reusando `lib/data/admin.ts`)

- `MonthlyStat`: para cada estabelecimento e cada um dos 12 meses **a partir do
  seu `since`**, gerar `gmv = revenue_baseline × SEASON[mês]`, `orders =
  round(orders_baseline × SEASON[mês])`, `byPay` proporcional. Meses anteriores
  ao `since` não recebem linha (→ tratados como 0).
- `SearchEvent`: materializar `SEED_EVENTS` — cada `{field, value}` vira um
  `SearchEvent` com a coluna correspondente preenchida (`city`/`neighborhood`/
  `cuisine`/`type`) e `createdAt` derivado do `day`.
- `Order` de backlog: materializar `admin.ts` `SEED_ORDERS` (12 pedidos cross-
  establishment) como `Order` reais, pra o backlog não ficar só com o Quiosque do
  Mar. Os itens (string tipo "1× Filé com Fritas, 2× Heineken Long Neck") são
  parseados em `OrderItem` (qty + nome; `unitPrice = 0`, pois o mock não tem preço
  por item) e `total` vem do próprio seed. `Establishment` "Quiosque do Mar"
  recebe `isLive = true`.

## Camada de dados (`lib/db/admin.ts`)

- Leituras: `listMonthlyStats()`, `listAllOrders()` (todos os tenants, backlog),
  `listSearchEvents()`. `listEstablishments` já existe. A agregação das Buscas
  continua **client-side** (a `BuscasSection` de hoje agrega `SearchEvent[]` no
  formato `{field, value, day}`); o servidor mapeia cada `SearchEvent` do DB em
  seus pares de dimensão nesse formato, então a seção não muda.
- Escritas (Server Actions, com Zod + `revalidatePath`): `updateEstablishmentFee`
  (existe) · `createEstablishment` (cria `Establishment` + `User` com senha
  bcrypt) · `updateEstablishment` · `deleteEstablishment` (cascade).

## Adaptação da UI (contida, mas não trivial)

O objetivo é preservar as seções (`Dashboard/Faturamento/Buscas/Cadastros/Taxas/
Backlog`) e os tipos que elas consomem (`ScaledEst`, `AdminOrder`, `SearchEvent`).

1. **View-model:** um adaptador mapeia `Establishment` (DB) → o formato de perfil
   que as seções leem hoje (`name`, `owner`, `city`, `neigh←neighborhood`,
   `tipo←type`, `plan`, `status←enum`, `since←createdAt`, `fee←String(platformFeePct)`,
   contatos, `posto`, `radius←radiusM`, `user←User.email`). A baseline
   (`orders/revenue/byPay`) **sai** do perfil e passa a vir do `MonthlyStat`.
2. **`scale.ts`:** nova `scaleFromStats(ests, stats, period, month, now):
   ScaledEst[]` — junta cada est com seu `MonthlyStat[month]` (0 se não houver) e
   aplica a fração do período (`dia/semana/quinzena` = fração; `mes` = mês cheio).
   Mesma saída `ScaledEst` (`pOrders/pRevenue/pByPay`), então as seções não mudam.
3. **`admin/page.tsx` (server):** **fetch-once** de ests + monthlyStats + orders +
   events; passa ao `AdminApp`. São ~156 stats + dezenas de pedidos → compute
   client-side por clique continua instantâneo (sem re-fetch).
4. **`AdminApp`:** troca a fonte (`SEED_*` → props do servidor); `allScaled/
   scopedScaled` passam a usar `scaleFromStats`. Badge "AO VIVO" via `isLive`.
5. **Escritas:** Cadastros/Taxas chamam as Server Actions → `revalidate` → a page
   re-renderiza com dados frescos. No editor, em **edição** o campo de senha fica
   "deixe em branco para manter" (o hash não é exibível); em **criação** é
   obrigatório.

## Verificação

- Unitário (Vitest): matemática do rollup no seed e de `scaleFromStats` (frações
  de período, mês ausente → 0, ratio de sazonalidade).
- Script (`tsx`): confere agregados contra o esperado (Σ GMV do mês, receita =
  GMV×fee, top 5, soma por método) e um CRUD de estabelecimento ponta a ponta
  (create → aparece na lista → updateFee → delete).
- Playwright: dashboard renderizando números reais (não-zero) e o CRUD de tenant
  refletindo após `revalidate`.
- `npm test` + `npm run build` + `npm run lint` limpos; migration aplicada +
  seed rodando no Neon.

## Fora de escopo (próximos sub-projetos)

- B — Painel do Estabelecimento → banco (leituras/mutations scoped por sessão).
- A — App do Cliente → banco (criação de pedido/split via Server Actions).
- Realtime; rollup automático a partir de `Order`.
