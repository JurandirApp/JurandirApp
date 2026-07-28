# Religar a Landing ao banco — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o ranking da landing vir do Postgres/Prisma (ISR), e as buscas + leads dos visitantes gravarem no banco (buscas alimentam a seção "Buscas" do Admin).

**Architecture:** `Establishment` ganha campos de descoberta (cuisine/rating/rankingOrders/weeklyHours) e `Lead` ganha owner/type; o seed popula os campos de ranking a partir do mock. `app/[locale]/page.tsx` (ISR 300s) busca os estabelecimentos do ranking e passa como prop ao `RankingHypados` (client). O lead modal e o provider de filtros do ranking chamam Server Actions públicas (`createLead`, `recordSearchEvent` com debounce).

**Tech Stack:** Next 16 (App Router, ISR) · Prisma/Postgres (Neon) · zod · Vitest · Playwright.

## Global Constraints

- **Sem mock em runtime:** a landing não lê mais `lib/data/establishments.ts` como DADOS (esse vira só fonte do seed + helpers `isOpenAt`/`uniqueSorted` + o `type Establishment`/`WeekSchedule`).
- Dinheiro/decimais na borda via `Number()`. `rating` é `Decimal(2,1)`.
- **Public/anônimo:** `createLeadAction`/`recordSearchEventAction` sem sessão.
- ISR na landing (`export const revalidate = 300`) — segue SSG+ISR (Lighthouse alto). Filtro + "aberto agora" client-side (hora do visitante).
- **Next.js modificado** (`AGENTS.md`): ler `node_modules/next/dist/docs/` antes de código específico de Next.
- **Neon configurado**; establishments já seedados. **Git:** repo não é git; commits opcionais (pular).

---

## Estrutura de arquivos

**Modificar:**
- `prisma/schema.prisma` — `Establishment` += cuisine/rating/rankingOrders/weeklyHours; `Lead` += owner/type.
- `prisma/seed.ts` — popular os campos de ranking no upsert de estabelecimento (create+update).
- `lib/validation.ts` — `leadCreateSchema` += owner/type.
- `app/[locale]/page.tsx` — ISR + fetch do ranking + passar ao `RankingHypados`.
- `components/site/RankingHypados.tsx` — receber `establishments` por prop (não importar o mock).
- `components/site/ranking-filters.tsx` — gravar `SearchEvent` (debounce) ao mudar filtro.
- `components/site/lead-modal.tsx` — `submit` chama `createLeadAction`.

**Criar:**
- `lib/db/ranking.ts` — `getRankingEstablishments()`.
- `lib/site/adapters.ts` — `toRankingEstablishment(dbEst)`.
- `lib/actions/site.ts` — `createLeadAction`, `recordSearchEventAction`.
- `tests/site/adapters.test.ts`.

---

## Task 1: Schema (ranking fields + Lead) + seed

**Files:** Modify `prisma/schema.prisma`, `prisma/seed.ts`

**Interfaces:** Produces `Establishment.cuisine/rating/rankingOrders/weeklyHours`; `Lead.owner/type`; seeded ranking data on existing establishments.

- [ ] **Step 1: `Establishment` fields** — in `model Establishment`, after `serviceFeePct ...` (near the discovery/profile fields):
```prisma
  cuisine        String?
  rating         Decimal?            @db.Decimal(2, 1)
  rankingOrders  Int                 @default(0)
  weeklyHours    Json?
```

- [ ] **Step 2: `Lead` fields** — in `model Lead`, after `establishmentName`:
```prisma
  owner             String?
  type              String?
```

- [ ] **Step 3: Migrate**

Run: `npm run db:migrate -- --name landing_ranking`
Expected: migration applied (all additive nullable/default columns → non-interactive). If Prisma prompts for a TTY confirm, fall back to: `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma` is NOT needed for additive changes; instead re-run with the DB reachable — additive columns don't need data-loss confirmation. If it still blocks, generate the SQL via `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<ts>_landing_ranking/migration.sql` then `npx prisma migrate deploy` + `npx prisma generate`.

- [ ] **Step 4: Seed the ranking fields** — in `prisma/seed.ts`:

Add the import (merge with existing imports):
```ts
import { Prisma } from "@prisma/client";
import { establishments as RANKING } from "../lib/data/establishments";
```
Inside the `for (const e of SEED_ESTS)` loop, before the `prisma.establishment.upsert(...)` call, compute:
```ts
    const rank = RANKING.find((r) => r.id === e.id);
    const rankingFields = {
      cuisine: rank?.cuisine ?? null,
      rating: rank ? new Prisma.Decimal(rank.rating) : null,
      rankingOrders: rank?.orders ?? 0,
      weeklyHours: rank ? (rank.hours as Prisma.InputJsonValue) : Prisma.DbNull,
    };
```
Then, in the upsert, set them in BOTH `create` and `update` (change `update: {}` to include them):
```ts
      update: { ...rankingFields },
      create: {
        slug,
        // ...all existing create fields...
        ...rankingFields,
      },
```

- [ ] **Step 5: Re-seed + generate**

Run: `npm run db:generate` then `npm run db:seed`
Expected: `seed OK {...}` no error. Ranking fields now populated on existing rows (upsert `update` sets them).

- [ ] **Step 6: Verify** — Run:
```bash
npx tsx -e "import('@prisma/client').then(async({PrismaClient})=>{const p=new PrismaClient();const r=await p.establishment.findMany({where:{rating:{not:null}},select:{name:true,cuisine:true,rating:true,rankingOrders:true}});console.log('ranked',r.length,r[0]);await p.\$disconnect();})"
```
Expected: `ranked 12` (the mock's 12), first row has cuisine/rating/rankingOrders.

- [ ] **Step 7: Build** — `npm run build` → passes (new fields in client).

- [ ] **Step 8: Commit (opcional)** — skip.

---

## Task 2: Ranking read + adapter (TDD)

**Files:** Create `lib/db/ranking.ts`, `lib/site/adapters.ts`, `tests/site/adapters.test.ts`; Modify `lib/validation.ts`

**Interfaces:**
- Produces: `getRankingEstablishments()`; `toRankingEstablishment(dbEst)` → the landing `Establishment` type; `leadCreateSchema` gains `owner?`/`type?`.

- [ ] **Step 1: `lib/validation.ts` — extend `leadCreateSchema`**

In the existing `leadCreateSchema` object, add:
```ts
  owner: z.string().optional(),
  type: z.string().optional(),
```

- [ ] **Step 2: `lib/db/ranking.ts`**
```ts
import { prisma } from "./prisma";

export function getRankingEstablishments() {
  return prisma.establishment.findMany({
    where: { status: "ACTIVE", rating: { not: null } },
    orderBy: { name: "asc" },
  });
}
```

- [ ] **Step 3: Write failing test** — `tests/site/adapters.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { toRankingEstablishment } from "@/lib/site/adapters";

describe("toRankingEstablishment", () => {
  it("maps DB establishment → landing ranking shape", () => {
    const r = toRankingEstablishment({
      id: "cuid1", name: "Bar do Zé", city: "Florianópolis/SC", neighborhood: "Jurerê",
      type: "Bar", cuisine: "Boteco", rating: 4.5, rankingOrders: 412,
      weeklyHours: [null, { o: "18:00", c: "23:00" }, null, null, null, null, null],
    } as never);
    expect(r.id).toBe("cuid1");
    expect(r.neigh).toBe("Jurerê");
    expect(r.tipo).toBe("Bar");
    expect(r.cuisine).toBe("Boteco");
    expect(r.rating).toBe(4.5);
    expect(r.orders).toBe(412);
    expect(r.hours).toHaveLength(7);
    expect(r.hours[1]).toEqual({ o: "18:00", c: "23:00" });
  });
  it("handles null cuisine/hours safely", () => {
    const r = toRankingEstablishment({
      id: "c2", name: "X", city: "C", neighborhood: null, type: "Bar",
      cuisine: null, rating: 4, rankingOrders: 0, weeklyHours: null,
    } as never);
    expect(r.neigh).toBe("");
    expect(r.cuisine).toBe("");
    expect(r.hours).toHaveLength(7);
    expect(r.hours.every((h) => h === null)).toBe(true);
  });
});
```

- [ ] **Step 4: Run → fail** — `npx vitest run tests/site/adapters.test.ts` → FAIL.

- [ ] **Step 5: Implement `lib/site/adapters.ts`**
```ts
import type { Establishment, WeekSchedule } from "@/lib/data/establishments";

const EMPTY_WEEK: WeekSchedule = [null, null, null, null, null, null, null];

type DbEst = {
  id: string; name: string; city: string; neighborhood: string | null;
  type: string; cuisine: string | null; rating: unknown; rankingOrders: number;
  weeklyHours: unknown;
};

export function toRankingEstablishment(e: DbEst): Establishment {
  const hours = Array.isArray(e.weeklyHours)
    ? (e.weeklyHours as WeekSchedule)
    : EMPTY_WEEK;
  return {
    id: e.id,
    name: e.name,
    city: e.city,
    neigh: e.neighborhood ?? "",
    tipo: e.type,
    cuisine: e.cuisine ?? "",
    orders: e.rankingOrders,
    rating: Number(e.rating ?? 0),
    hours: hours.length === 7 ? hours : EMPTY_WEEK,
  };
}
```

- [ ] **Step 6: Run → pass** — `npx vitest run tests/site/adapters.test.ts` → PASS. Then `npm test` + `npm run lint`.

- [ ] **Step 7: Commit (opcional)** — skip.

---

## Task 3: Wire landing page (ISR) + RankingHypados prop

**Files:** Modify `app/[locale]/page.tsx`, `components/site/RankingHypados.tsx`

**Interfaces:** Consumes `getRankingEstablishments`, `toRankingEstablishment`.

- [ ] **Step 1: `RankingHypados` — take `establishments` as a prop**

In `components/site/RankingHypados.tsx`:
- Change the import `import { establishments, isOpenAt, uniqueSorted } from "@/lib/data/establishments";` to `import { isOpenAt, uniqueSorted, type Establishment } from "@/lib/data/establishments";` (drop the `establishments` DATA import; keep the helpers + type).
- Change the component signature from `export function RankingHypados() {` to:
```tsx
export function RankingHypados({ establishments }: { establishments: Establishment[] }) {
```
- Everything else stays — the component already references the local `establishments` variable, which is now the prop.

- [ ] **Step 2: `app/[locale]/page.tsx` — ISR + fetch + pass**

Add at the top (after imports): `export const revalidate = 300;`
Add imports:
```tsx
import { getRankingEstablishments } from "@/lib/db/ranking";
import { toRankingEstablishment } from "@/lib/site/adapters";
```
In `SitePage`, after `setRequestLocale(locale);`:
```tsx
  const ranking = (await getRankingEstablishments()).map(toRankingEstablishment);
```
Change `<RankingHypados />` to `<RankingHypados establishments={ranking} />`.

- [ ] **Step 3: Build + lint + tests** — `npm run build` (confirm `/[locale]` is still ● SSG/ISR, not ƒ), `npm run lint`, `npm test` → all clean.

- [ ] **Step 4: Commit (opcional)** — skip.

---

## Task 4: Writes — leads + search events

**Files:** Create `lib/actions/site.ts`; Modify `components/site/lead-modal.tsx`, `components/site/ranking-filters.tsx`; `messages/pt.json` + `messages/en.json`

**Interfaces:** Produces `createLeadAction(input)`, `recordSearchEventAction(filters)`.

- [ ] **Step 1: `lib/actions/site.ts`**
```ts
"use server";

import { createLead } from "@/lib/db/leads";
import { recordSearchEvent } from "@/lib/db/search";
import { leadCreateSchema, searchEventSchema } from "@/lib/validation";

export async function createLeadAction(input: {
  name: string; owner: string; city: string; whatsapp: string; email: string;
  type: string; message: string;
}): Promise<{ ok: boolean }> {
  const parsed = leadCreateSchema.safeParse({
    name: input.owner || input.name,
    establishmentName: input.name,
    owner: input.owner,
    city: input.city || undefined,
    phone: input.whatsapp || undefined,
    email: input.email || undefined,
    type: input.type || undefined,
    message: input.message || undefined,
  });
  if (!parsed.success) return { ok: false };
  try {
    await createLead(parsed.data);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function recordSearchEventAction(filters: {
  city?: string; neighborhood?: string; cuisine?: string; type?: string; openNow?: boolean;
}): Promise<void> {
  const parsed = searchEventSchema.safeParse({
    city: filters.city || undefined,
    neighborhood: filters.neighborhood || undefined,
    cuisine: filters.cuisine || undefined,
    type: filters.type || undefined,
    openNow: filters.openNow || undefined,
  });
  if (!parsed.success) return;
  // Ignore empty searches (no dimension set).
  if (!parsed.data.city && !parsed.data.neighborhood && !parsed.data.cuisine && !parsed.data.type && !parsed.data.openNow) return;
  try {
    await recordSearchEvent(parsed.data);
  } catch {
    /* fire-and-forget analytics */
  }
}
```
Note: `createLead`/`recordSearchEvent` (in `lib/db/{leads,search}.ts`) `.parse` their input again — passing already-validated data is fine. `leadCreateSchema` now includes `owner`/`type`; `createLead` writes them (the `Lead` model has the columns from Task 1). Confirm `lib/db/leads.ts` `createLead` passes the whole parsed object to `prisma.lead.create({ data })` — it does, so `owner`/`type` flow through.

- [ ] **Step 2: Extend `searchEventSchema` if needed** — it already has `city/neighborhood/cuisine/type/openNow` (from sub-project C). No change. (Verify by reading `lib/validation.ts`; if `neighborhood`/`type` are missing, add them — but C added them.)

- [ ] **Step 3: Wire the lead modal** — in `components/site/lead-modal.tsx`, replace the mock `submit`:
```tsx
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const submit = () => {
    if (!valid || sending) return;
    setSending(true);
    setError(false);
    startTransition(async () => {
      const r = await createLeadAction(form);
      setSending(false);
      if (r.ok) setSent(true);
      else setError(true);
    });
  };
```
Add `import { useTransition } from "react";` and `import { createLeadAction } from "@/lib/actions/site";`, and `const [, startTransition] = useTransition();` in the component. Render an error line when `error` is true (below the send button): `{error && <p className="m-0 text-center text-xs text-[#e11d48]">{t("sendError")}</p>}`. Add `leadModal.sendError` to `messages/pt.json` + `messages/en.json` (PT "Não foi possível enviar. Tente de novo." / EN "Could not send. Please try again."). Disable the button while `sending`.

- [ ] **Step 4: Record search events (debounced) in the filters provider** — in `components/site/ranking-filters.tsx`, inside `RankingFiltersProvider`, add a debounced effect that records a SearchEvent when the filter state changes:
```tsx
  const skipFirst = useRef(true);
  useEffect(() => {
    if (skipFirst.current) { skipFirst.current = false; return; }
    const id = setTimeout(() => {
      void recordSearchEventAction({
        city: state.city, neighborhood: state.bairro, cuisine: state.cuisine,
        type: state.tipo, openNow: state.openNow,
      });
    }, 800);
    return () => clearTimeout(id);
  }, [state]);
```
Add imports: `useEffect`, `useRef` from "react"; `recordSearchEventAction` from "@/lib/actions/site". (The action itself ignores the all-empty case, so a `clear()` back to empty records nothing.)

- [ ] **Step 5: Build + lint + tests + JSON** — `npm run build`, `npm run lint`, `npm test`, `node -e "require('./messages/pt.json');require('./messages/en.json');console.log('json ok')"` → all clean.

- [ ] **Step 6: Commit (opcional)** — skip.

---

## Task 5: Verification (Playwright + admin cross-check)

**Files:** none (scratchpad)

- [ ] **Step 1: Build + start** — `npm run build`, then `PORT=<free> npm run start` (background, poll ready).

- [ ] **Step 2: Playwright E2E**
Write a script (scratchpad with `playwright`):
1. **Ranking from DB:** goto `/` (pt); scroll to `#mais-hypados`; assert real establishment names render (e.g. "Quiosque do Mar", "Bar do Zé"); assert the list has ~12 items.
2. **Search event:** pick a city in the first ranking filter dropdown (e.g. "Itajaí/SC"); wait ~1200ms (debounce + write). Then query the DB (a small `tsx` snippet OR a second admin check) to confirm a new `SearchEvent` with that city exists. Simplest: before the click, capture `count = SearchEvent.count()` via `npx tsx`; after, assert it grew — but the E2E is a browser; do the DB count via a separate `npx tsx -e` before/after the browser step. Alternatively: login to `/admin` as ADMIN, open "Buscas", confirm the city appears (it aggregates SearchEvents).
3. **Lead:** open the lead modal (the CTA/"quero o Jurandir" button — find it), fill name/owner/whatsapp/email, submit; assert the success state ("enviado") shows. Then confirm a new `Lead` exists via `npx tsx -e` count before/after.
4. Collect `pageerror` → none. Screenshots. Stop the server.

- [ ] **Step 3: DB assertions** (outside Playwright) — `npx tsx -e` before/after counts for `searchEvent` and `lead`, OR one script that runs the counts. Expected: both grew by ≥1.

- [ ] **Step 4: Final gates** — `npm test` + `npm run build` + `npm run lint` clean.

- [ ] **Step 5: Commit (opcional)** — skip.

---

## Self-review (autor)

- **Spec coverage:** schema (Establishment ranking + Lead) + seed (T1) · ranking read + adapter + leadCreateSchema (T2) · landing ISR + fetch + RankingHypados prop (T3) · createLead + recordSearchEvent + lead modal + filters debounce (T4) · verification incl. admin Buscas cross-check (T5). Ranking from DB (no runtime mock); ISR keeps SSG; search debounced 800ms; leads capture owner+type.
- **Placeholders:** nenhum — código real; edições descritas com os trechos exatos.
- **Consistência de tipos:** landing `Establishment`/`WeekSchedule` (de `lib/data/establishments`), `toRankingEstablishment`, `getRankingEstablishments`, `createLeadAction`/`recordSearchEventAction`, `leadCreateSchema` (com owner/type) — usados igualmente entre T1–T4.
- **Fora de escopo:** foto/reviews reais; inbox de leads no admin; features com dep externa (Resend/realtime/Twilio/storage) — adiadas.
