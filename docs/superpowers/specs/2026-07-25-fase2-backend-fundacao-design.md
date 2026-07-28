# Fase 2 — Backend fundação

Estabelece a fundação de backend do Jurandir: banco PostgreSQL via Prisma, seed
com os dados dos protótipos, autenticação real (JWT-cookie + bcrypt), camada de
acesso a dados com validação Zod e regras de negócio críticas, e proteção de
rotas por sessão. **Só o login passa a usar o banco nesta fase**; painel, admin e
app do cliente continuam lendo os mocks de `lib/data/*` — a religação da UI aos
dados reais é uma fase posterior.

## Decisões (aprovadas)

- **Banco:** PostgreSQL (Supabase ou Neon). Schema com enums nativos.
- **Auth:** JWT em cookie httpOnly (`jose`) + `bcryptjs`, verificado contra a
  tabela `User`. **Não** usar Auth.js/NextAuth (evita conflito com o middleware
  do next-intl em `proxy.ts` e o risco de beta no Next 16 modificado).
- **Escopo:** Fundação + login real. API/ações e camada de dados são construídas
  e verificadas por script, mas ainda não consumidas pela UI (exceto login).
- **Dinheiro:** `Decimal(10,2)` (tipo semântico correto p/ moeda). Conversão para
  `number` só na borda de leitura (quando a UI for religada).

## Dependência externa (bloqueio parcial)

Todo o código é escrito nesta fase, mas **`prisma migrate`, `prisma db seed` e a
verificação em runtime exigem a `DATABASE_URL`** de um projeto Supabase/Neon que
só o usuário cria. `prisma generate` (que gera o client e destrava o build/tipos)
**não** precisa de conexão — roda com a env presente. Portanto:

- Escrevo schema + client + auth + repos + Zod + seed + scripts agora.
- `npm run build` e `lint` passam sem banco (páginas que tocam Prisma são
  dinâmicas; landing prerender não toca Prisma).
- Migrations/seed/verificação rodam quando a `DATABASE_URL` chegar.

## Dependências & ambiente

- Adicionar: `prisma` + `@prisma/client`, `zod`, `bcryptjs` (+ `@types/bcryptjs`),
  `jose`, `tsx` (executar o seed/scripts em TS).
- `.env` (local, com placeholders) + `.env.example` (versionável):
  - `DATABASE_URL` — conexão *pooled* (Supabase porta 6543, `?pgbouncer=true`).
  - `DIRECT_URL` — conexão direta (porta 5432); Prisma usa em migrations.
  - `AUTH_SECRET` — chave HS256 para assinar o JWT (gerar valor aleatório).
- `package.json`: scripts `db:generate`, `db:migrate`, `db:seed`, `db:studio`;
  bloco `"prisma": { "seed": "tsx prisma/seed.ts" }`.

## Prisma schema (`prisma/schema.prisma`)

`datasource db { provider = "postgresql"; url = env("DATABASE_URL"); directUrl = env("DIRECT_URL") }`

### Enums
- `Role { ADMIN, ESTABLISHMENT }`
- `OrderStatus { AWAITING_PAYMENT, IN_PRODUCTION, DELIVERED }`
- `PaymentMethod { CREDIT, DEBIT, PIX, USDC }`
- `EstablishmentStatus { ACTIVE, PAUSED }`

### Models
- **Establishment** — `id` (cuid), `slug` (unique), `name`, `owner`, `type`
  (String — lista gerida pelo admin), `city`, `neighborhood?`, `posto?`,
  `radiusM Int?`, `plan` (String), `platformFeePct Int @default(8)`,
  `serviceFeePct Int @default(10)` (taxas distintas: 8% plataforma/admin, 10%
  serviço do estabelecimento), `status EstablishmentStatus @default(ACTIVE)`,
  `tagline?`, `description?`, `address?`, `hours?`, `coverImg?`, `phone?`,
  `email?`, `website?`, `whatsapp?`, `instagram?`, timestamps. Relações: `users`,
  `menuItems`, `qrSpots`, `orders`, `searchEvents`.
- **User** — `id`, `email` (unique), `passwordHash`, `name`, `role Role`,
  `establishmentId?` (admin não tem), relação `establishment?`
  (`onDelete: Cascade`), timestamps.
- **MenuItem** — `id`, `establishmentId`, `name`, `description?`,
  `price Decimal(10,2)`, `oldPrice Decimal(10,2)?`, `photo?`, `measure Int?`,
  `unit?`, `category`, `subcategory`, `active Bool @default(true)`,
  `sortOrder Int @default(0)`, timestamps. `@@index([establishmentId])`.
- **QrSpot** — `id`, `establishmentId`, `label`, `createdAt`.
  `@@unique([establishmentId, label])`.
- **Order** — `id`, `establishmentId`, `code` (unique, `PED-XXXXXXXX`),
  `status OrderStatus @default(AWAITING_PAYMENT)`, `locationLabel`
  ("Guarda-sol nº 14"), `posto?`, `customerName?`, `note?`,
  `subtotal/platformFee/serviceFee/total Decimal(10,2)`, timestamps. Relações:
  `items`, `payment?`, `splitShares`. `@@index([establishmentId, status])`.
- **OrderItem** — `id`, `orderId` (`onDelete: Cascade`), `menuItemId?` (ref
  opcional), `name` (snapshot), `qty Int`, `unitPrice Decimal(10,2)` (snapshot).
- **Payment** (pagamento total) — `id`, `orderId` (unique, `onDelete: Cascade`),
  `method PaymentMethod`, `installments Int @default(1)`,
  `gatewayFeePct Decimal(5,2)` (snapshot), `cardMask?` (bandeira + 4 últimos),
  `createdAt`.
- **SplitShare** (conta dividida) — `id`, `orderId` (`onDelete: Cascade`),
  `personIndex Int`, `amount Decimal(10,2)`, `method PaymentMethod?` (null até
  pagar), `paid Bool @default(false)`, `paidAt?`. `@@unique([orderId, personIndex])`.
- **Lead** — `id`, `name`, `establishmentName`, `city?`, `phone?`, `email?`,
  `message?`, `createdAt`.
- **SearchEvent** — `id`, `query?`, `city?`, `cuisine?`, `category?`,
  `openNow Bool?`, `establishmentId?` (relação opcional), `createdAt`.

## Domínio & regras de negócio

`lib/domain/pricing.ts` (puro, testável):
- `computeTotals(subtotal, platformFeePct, serviceFeePct)` → `{ platformFee,
  serviceFee, total }` (arredondado a 2 casas).
- `GATEWAY_FEE_PCT: Record<PaymentMethod, number>` = CREDIT 3,49 · DEBIT 1,99 ·
  PIX 0,99 · USDC 1,0.
- `makeOrderCode()` → `PED-` + 8 hex.
- Regra crítica (no módulo de orders): **pedido só vira `IN_PRODUCTION` quando
  100% pago** — total no `Payment`, ou todos os `SplitShare.paid = true`.
- Cartão sempre mascarado (`cardMask`), nunca número completo.

## Camada de dados + validação

- `lib/db/prisma.ts` — singleton do `PrismaClient` (guarda `globalThis` p/ evitar
  múltiplas instâncias no dev/HMR).
- `lib/validation/*` (Zod): `loginSchema`, `leadCreateSchema`, `orderCreateSchema`,
  `menuItemUpsertSchema`, `qrSpotCreateSchema`, `searchEventSchema`.
- `lib/db/establishments.ts` — `getBySlug`, `getById`, `list`, `updateFee`,
  `upsert` (CRUD admin).
- `lib/db/menu.ts` — `listByEstablishment`, `upsertItem`, `deleteItem`.
- `lib/db/orders.ts` — `createOrder` (calcula taxas a partir do estabelecimento,
  gera code, cria items + payment|splitShares, define status), `payShare`
  (marca share; se todos pagos → `IN_PRODUCTION`), `deliverOrder`, `listOrders`
  (filtrado por `establishmentId`).
- `lib/db/leads.ts` — `createLead`, `listLeads`.
- `lib/db/search.ts` — `recordSearchEvent`, `aggregate`.
- Toda consulta de tenant recebe `establishmentId` (da sessão) — isolamento
  multi-tenant garantido na camada de dados; admin não é filtrado.

## Autenticação

- `lib/auth/session.ts`:
  - `type SessionPayload = { sub: string; role: Role; establishmentId: string | null; name: string }`.
  - `createSession(payload, remember)` — `jose` `SignJWT` HS256, `exp` 30d se
    "continuar conectado" (senão cookie de sessão), grava cookie httpOnly
    `jur_session`.
  - `getSession()` — lê + `jwtVerify` com `AUTH_SECRET`; retorna payload | null.
  - `destroySession()` — apaga o cookie.
  - `destForRole(role)` (movido de `mock.ts`).
- `lib/auth/actions.ts` — `login(email, password, remember)`: busca `User` por
  email (Prisma), `bcrypt.compare`, cria sessão, retorna `{ ok, dest }` por role;
  senão `{ ok: false, error: "invalidCredentials" }`. `logout(locale)`. **Mesma
  assinatura/erro de hoje — o `LoginScreen` não muda.**
- Remover `lib/auth/mock.ts`; `Role` passa a vir de `@prisma/client`. As credenciais
  demo ficam documentadas no seed.

## Proteção de rotas

Mantida no **server component** (padrão atual), trocando a leitura crua do cookie
por `getSession()`:
- `app/[locale]/painel/page.tsx` — `if (session?.role !== "ESTABLISHMENT") redirect("/login")`.
- `app/[locale]/admin/page.tsx` — `if (session?.role !== "ADMIN") redirect("/login")`.
- Desvio consciente do README (middleware → guard na página) para não colidir com
  o middleware do next-intl. Mesmo efeito de proteção.

## Seed (`prisma/seed.ts`)

Reusa `lib/data/*` (sem duplicar dados):
- 13 estabelecimentos (de `lib/data/admin` `SEED_ESTS`), mapeando campos
  (tipo, cidade, plano, fee → `platformFeePct`, etc.).
- Quiosque do Mar recebe: cardápio (`SEED_MENU`), QR spots (`SEED_QRS`), pedidos
  de exemplo (`SEED_ORDERS`), e o perfil (`SEED_PROFILE`).
- 2 usuários com senha bcrypt: `contato@quiosquedomar.com.br` / `demo1234`
  (ESTABLISHMENT → Quiosque do Mar) e `admin@jurandir.app` / `admin1234` (ADMIN).
- Idempotente onde possível (`upsert` por `slug`/`email`).

## Verificação

- `prisma generate` → client gerado; `npm run build` + `npm run lint` limpos
  (sem banco).
- Após a `DATABASE_URL`: `npm run db:migrate` + `npm run db:seed`.
- `scripts/verify-db.ts` (via `tsx`) exercita a fundação:
  1. `login` das 2 contas (bcrypt compare OK; credencial errada falha).
  2. `createOrder` com split de 2 pessoas → `AWAITING_PAYMENT`; `payShare` nas 2
     → status vira `IN_PRODUCTION`.
  3. `createOrder` pagamento total (crédito 3x, cartão mascarado) → `IN_PRODUCTION`
     e `gatewayFeePct` snapshot = 3,49.
  4. `createLead` e `recordSearchEvent` gravam.
  5. `count(Establishment) === 13`.

## Fora de escopo (fases seguintes)

- Religar painel/admin/app do cliente ao banco (CRUD real, revalidação,
  loading/error states, realtime).
- Fase 6: gateway de pagamento real, USDC (flag), impressão ESC/POS, WhatsApp/
  e-mail, analytics de busca gravando `SearchEvent` a partir da landing.
