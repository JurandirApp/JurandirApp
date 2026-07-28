# Religar a UI ao banco — Sub-projeto B: Painel do Estabelecimento

Segundo dos três sub-projetos de "religar a UI ao banco" (A — App do Cliente
ainda pendente; C — Admin já feito). Faz o Painel do Estabelecimento consumir
dados reais do Postgres/Prisma no lugar dos mocks de `lib/data/panel.ts`,
preservando a UI, com escrita via Server Actions e **isolamento multi-tenant**.

## Contexto

- Backend da Fase 2 pronto (`lib/db/*`, auth por sessão com `establishmentId`,
  Server Actions, Zod). Admin (C) já religado (rollup `MonthlyStat`, adaptadores,
  `scaleFromStats`).
- O painel hoje é um client component (`PanelApp`) que semeia estado local de
  `SEED_ORDERS/SEED_MENU/SEED_QRS/SEED_PROFILE` (via prop `now`) e simula pedidos
  novos com `INCOMING_ORDERS` (setTimeout). 7 seções: Pedidos, Cardápio, QR Codes,
  KPIs, Auditoria, Perfil, Config.

## Decisões (aprovadas)

- **KPIs híbrido:** receita/pedidos/donut de pagamentos vêm do `MonthlyStat` do
  estabelecimento (escala por período, reusa `scaleFromStats`); **top itens +
  donut de categorias** agregados dos `OrderItem` reais (match nome→categoria).
- **Config:** só troca de senha persiste (grava `User`, verifica a atual, bcrypt);
  impressora/notificações continuam UI sem persistir (toast).
- **Notificação de pedido novo:** segue **demo** (client-side `INCOMING_ORDERS`);
  realtime real fica pra Fase 6. Pedidos reais carregam no fetch.
- **Limpeza da DB (consentida):** clear + reseed controlado antes de B (cardápio
  volta a 19 itens, sem duplicatas/órfãos das execuções antigas).

## Escopo

- **Inclui:** todas as 7 seções lendo dados reais scoped por sessão; escritas
  (entregar pedido, CRUD de cardápio, add/del QR, salvar perfil, trocar senha) via
  Server Actions com checagem de tenant.
- **Não inclui:** sub-projeto A; realtime real; CSV import/export; upload de foto;
  persistência de impressora/notificações (Fase 6).

## Limpeza da DB (pré-requisito)

Script `tsx` controlado (evita o guard do Prisma CLI): `deleteMany` em todas as
tabelas em ordem segura de FK e re-executa o seed idempotente → 19 itens de
cardápio, sem duplicatas, sem pedidos órfãos. Consentido pelo usuário.

## Segurança multi-tenant (ponto central)

Todas as leituras recebem `establishmentId` da sessão (`getSession`). **Toda Server
Action valida que o recurso pertence ao estabelecimento da sessão** antes de
mutar — nunca confia em id vindo do cliente:
- `deliverOrderAction(orderId)` → só age se `order.establishmentId === session.establishmentId`.
- `upsert/deleteMenuItemAction`, `create/deleteQrSpotAction`, `saveProfileAction`
  → idem, escopados ao `establishmentId` da sessão.
- `changePasswordAction` → age só sobre o `User` da sessão (por `session.sub`).
Actions sem sessão de ESTABLISHMENT válida lançam/retornam erro antes de qualquer
escrita.

## Fetch-once + wiring

`app/[locale]/painel/page.tsx` (server): valida sessão ESTABLISHMENT, pega
`establishmentId`, e faz `Promise.all` de: estabelecimento (perfil), seus Orders
(com items/payment/splitShares), MenuItems, QrSpots, e MonthlyStat. Mapeia via
adaptadores e passa ao `PanelApp`. O `PanelApp` mantém o compute/interatividade
client-side; troca a fonte (`SEED_*` → props) e roteia mutações pelas Server
Actions (`startTransition` + `revalidatePath("/painel")`). A demo de pedido novo
(`INCOMING_ORDERS`) continua client-side.

## Camada nova

- `lib/db/panel.ts` — leituras scoped: `getEstablishmentForPanel(id)`,
  `listOrders(id)` (reusa `lib/db/orders.ts`), `listMenu(id)` (reusa
  `lib/db/menu.ts`), `listQrSpots(id)`, `listMonthlyStats(id)`.
- `lib/db/qr.ts` — `createQrSpot`/`deleteQrSpot` (scoped).
- `lib/actions/panel.ts` — Server Actions acima, todas com checagem de tenant +
  Zod. Reusa `deliverOrder` de `lib/db/orders.ts`, `upsert/deleteMenuItem` de
  `lib/db/menu.ts`, `hashPassword`/`verifyPassword`.
- `lib/panel/adapters.ts` — DB→view-model: `toPanelOrder` (Order+items+payment+
  splits → `Order`/`OrderLine`/`Split`), `toPanelMenuItem`, `toPanelQr`,
  `toProfileForm`, e agregação pura de KPIs (top itens/categorias dos OrderItems).
- `lib/validation.ts` — adicionar `profileSaveSchema` e `passwordChangeSchema`.

## KPIs híbrido (detalhe)

- Receita/pedidos/pagamentos por período: `scaleFromStats([est], statsDoEst,
  period, month)` → `pRevenue/pOrders/pByPay`.
- Top itens + donut de categorias: função pura agregando os `OrderItem` do
  estabelecimento (soma qty/receita por nome; categoria via match nome→
  `MenuItem.category`, fallback "Outros"). Reflete pedidos reais (poucos por ora).

## Verificação

- Unit (Vitest): adaptadores (`toPanelOrder` método/split/itens; `toProfileForm`)
  e a agregação pura de KPIs (top itens/categorias).
- Script (`tsx`): **scoping** — um tenant não lê nem edita dados de outro
  (deliver/menu/qr de um id de outro estabelecimento é rejeitado).
- Playwright E2E (login Quiosque do Mar): Pedidos (entregar muda status),
  Cardápio (criar/editar/excluir item reflete), QR (add/del), Perfil (salvar),
  Config (trocar senha com senha atual correta funciona / errada falha). Zero
  erros de página.
- `npm test` + `npm run build` + `npm run lint` limpos.

## Fora de escopo (próximo sub-projeto)

- A — App do Cliente → banco (criação de pedido/split que alimenta este painel).
- Realtime real, CSV, upload de foto, settings de impressora/notificações.
