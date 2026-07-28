# Religar a Landing ao banco

Fecha a religação da UI ao banco: o ranking "Mais Hypados" passa a vir do
Postgres/Prisma, a captação de **leads** grava no banco, e as **buscas** dos
visitantes viram `SearchEvent` reais que alimentam a seção "Buscas" do Admin.
Alinhado à diretriz "sem mock — só integrações reais": a landing em runtime não
usa mais `lib/data/establishments.ts` (esse vira só fonte do seed).

## Contexto

- Backend Fase 2 + religação A/B/C prontos. `createLead`/`recordSearchEvent`
  existem em `lib/db/{leads,search}.ts`. `SearchEvent` tem `city/neighborhood/
  cuisine/type/openNow`.
- A landing hoje: `RankingHypados` lê o mock `lib/data/establishments.ts` (12
  estabelecimentos com `cuisine/rating/orders(hype)/weeklyHours` estruturado p/
  "aberto agora" via `isOpenAt`). O lead modal faz `setSent` mock (não grava). Os
  filtros do ranking não registram busca.

## Decisões (aprovadas)

- **Ranking do banco** (não mock): estender o schema com os campos de descoberta +
  seed + ler do DB.
- **SearchEvent a cada filtro** do ranking (city/bairro/culinária/tipo), com
  **debounce ~800ms**.

## Schema (migration)

- `Establishment` += `cuisine String?`, `rating Decimal? @db.Decimal(2,1)`,
  `rankingOrders Int @default(0)` (contagem de "hype" curada — os pedidos reais
  são esparsos demais p/ ranquear), `weeklyHours Json?` (o `WeekSchedule`: array
  de 7 `{o,c}|null`, índice 0 = domingo).
- `Lead` += `owner String?`, `type String?` (o form captura os dois; o model não).

## Seed

Popula os campos de ranking nos estabelecimentos existentes (match por slug), a
partir do mock `lib/data/establishments.ts` (cuisine/rating/rankingOrders/
weeklyHours). O e6 "pendente" (ausente no mock do ranking) fica sem dados de
ranking → não aparece.

## Ranking do banco (leitura)

- `lib/db/ranking.ts` → `getRankingEstablishments()`: `Establishment` com
  `status = ACTIVE` **e** `rating != null`, ordenados por nome.
- `lib/site/adapters.ts` → `toRankingEstablishment(dbEst)`: DB → o tipo
  `Establishment` da landing (`{id, name, city, neigh, tipo, cuisine, orders:
  rankingOrders, rating, hours: weeklyHours as WeekSchedule}`).
- `app/[locale]/page.tsx`: **ISR** (`export const revalidate = 300`) — busca os
  estabelecimentos do ranking no servidor e passa ao `RankingHypados` (hoje um
  client component que semeia do mock; passa a receber via prop/provider). A
  landing continua servida estática (SSG+ISR) → Lighthouse alto. A **filtragem**
  (cidade/culinária) e o **"aberto agora"** (`isOpenAt`, hora do visitante)
  seguem **client-side**.

## Writes (Server Actions públicas)

- `lib/actions/site.ts`:
  - `createLeadAction(input)` — o lead modal (`name→establishmentName, owner,
    city, whatsapp→phone, email, type, message`) grava no `Lead` via
    `createLead`. O modal mostra "enviado" só quando a action retorna `{ok}`;
    falha → mensagem de erro.
  - `recordSearchEventAction(filters)` — grava um `SearchEvent`
    (`city/neighborhood/cuisine/type/openNow`). Chamada pelo provider de filtros
    do ranking com **debounce 800ms** ao mudar um filtro (ignora estado vazio).
    É o payoff: buscas reais → seção "Buscas" do Admin.

## Validação

- `lib/validation.ts`: estender `leadCreateSchema` com `owner?`, `type?`;
  `searchEventSchema` já cobre os campos.

## Verificação

- Unit (Vitest): `toRankingEstablishment` (incl. `weeklyHours` JSON →
  `WeekSchedule`); `isOpenAt` já é testável (adicionar casos se faltar).
- Playwright E2E: a landing renderiza o ranking **do banco** (nomes reais);
  mudar um filtro → após o debounce, um `SearchEvent` novo existe no banco **e**
  aparece na seção "Buscas" do Admin; enviar um lead pelo modal → um `Lead` novo
  existe no banco. Landing continua ● (SSG+ISR).
- `npm test` + `npm run build` + `npm run lint` limpos.

## Fora de escopo

- Foto/reviews reais por estabelecimento (rating/cuisine seedados bastam).
- UI de "inbox de leads" no admin (leads gravam; visualização depois).
- Itens que dependem de serviço externo (Resend, realtime, Twilio, storage) —
  adiados junto de pagamentos/impressora até haver chaves.
