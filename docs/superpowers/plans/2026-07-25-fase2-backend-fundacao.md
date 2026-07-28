# Fase 2 — Backend fundação · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estabelecer a fundação de backend do Jurandir (Postgres/Prisma, auth real JWT-cookie + bcrypt, camada de dados com Zod, regras de negócio, seed) com o **login** já usando o banco; painel/admin/app seguem em mock.

**Architecture:** Prisma sobre PostgreSQL (Supabase/Neon). Lógica pura (preços, código de pedido, hash de senha, assinatura JWT, validação Zod) isolada em módulos testáveis por unidade (Vitest). Acesso a dados em `lib/db/*` com isolamento multi-tenant por `establishmentId`. Auth por cookie httpOnly assinado (jose); proteção de rota em server components (não em middleware, para não colidir com o next-intl em `proxy.ts`).

**Tech Stack:** Next.js 16.2.11 (modificado) · React 19 · TypeScript · Prisma + @prisma/client · PostgreSQL · zod · bcryptjs · jose · tsx · vitest.

## Global Constraints

- **Next.js é modificado** (`AGENTS.md`): antes de escrever código específico de Next, ler o guia relevante em `node_modules/next/dist/docs/`. Respeitar avisos de depreciação.
- **Banco:** PostgreSQL; schema com enums nativos. Dinheiro em `Decimal(10,2)`; converter para `number` só na borda de leitura.
- **Auth:** JWT-cookie (`jose`, HS256) + `bcryptjs`. Cookie `jur_session`. **Não** usar Auth.js/NextAuth. Erro de login = chave `invalidCredentials` (o `LoginScreen` traduz). `login`/`logout` mantêm a assinatura atual.
- **Proteção de rota** em server component via `getSession()`, não em middleware.
- **Escopo:** só o login consome o banco; UI dos painéis/app continua lendo `lib/data/*`.
- **Dependência externa:** `prisma migrate`/`db seed`/verificação em runtime exigem `DATABASE_URL` (Supabase/Neon), fornecida pelo usuário. `prisma generate`, `npm run build` e `npm run lint` funcionam sem banco.
- **Git:** o diretório **não** é um repositório git. Os passos de commit são **opcionais** — só executar se o repo estiver sob git **e** o usuário autorizar; caso contrário, pular.
- Comentários de código em inglês (padrão do repositório). Números pt-BR na UI (não afeta esta fase).

---

## Estrutura de arquivos

**Criar:**
- `prisma/schema.prisma` — datasource, generator, enums, models.
- `prisma/seed.ts` — seed reusando `lib/data/*`.
- `lib/db/prisma.ts` — singleton do PrismaClient.
- `lib/db/establishments.ts`, `lib/db/menu.ts`, `lib/db/orders.ts`, `lib/db/leads.ts`, `lib/db/search.ts` — acesso a dados.
- `lib/domain/pricing.ts` — cálculos puros (taxas, código, split).
- `lib/auth/password.ts` — hash/verify de senha.
- `lib/auth/session.ts` — assinatura/verificação JWT + wrappers de cookie.
- `lib/validation.ts` — schemas Zod.
- `scripts/verify-db.ts` — verificação da fundação (pós-URL).
- `vitest.config.ts` — resolução do alias `@` para testes.
- `.env`, `.env.example` — variáveis.
- `tests/domain/pricing.test.ts`, `tests/auth/password.test.ts`, `tests/auth/session.test.ts`, `tests/validation.test.ts`.

**Modificar:**
- `package.json` — deps + scripts + bloco `prisma.seed`.
- `app/[locale]/painel/page.tsx` — guard via `getSession()`.
- `app/[locale]/admin/page.tsx` — guard via `getSession()`.
- `lib/auth/actions.ts` — login/logout via DB + sessão.

**Remover:**
- `lib/auth/mock.ts` (substituído por `session.ts` + seed).

---

## Task 1: Tooling, dependências e ambiente

**Files:**
- Modify: `package.json`
- Create: `.env`, `.env.example`, `vitest.config.ts`, `tests/smoke.test.ts`

**Interfaces:**
- Produces: script `npm test` (vitest), alias `@` resolvido nos testes, env vars `DATABASE_URL`/`DIRECT_URL`/`AUTH_SECRET`.

- [ ] **Step 1: Instalar dependências**

Run:
```bash
npm install @prisma/client zod bcryptjs jose
npm install -D prisma @types/bcryptjs tsx vitest
```
Expected: instala sem erro; `package.json` atualizado.

- [ ] **Step 2: Adicionar scripts e bloco prisma ao `package.json`**

No `package.json`, dentro de `"scripts"`, adicionar:
```json
"test": "vitest run",
"test:watch": "vitest",
"db:generate": "prisma generate",
"db:migrate": "prisma migrate dev",
"db:seed": "prisma db seed",
"db:studio": "prisma studio"
```
E no topo do objeto raiz, adicionar:
```json
"prisma": { "seed": "tsx prisma/seed.ts" }
```

- [ ] **Step 3: Criar `vitest.config.ts` (resolver o alias `@`)**

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: { environment: "node" },
});
```

- [ ] **Step 4: Criar `.env.example` e `.env`**

`.env.example` (versionável):
```bash
# Supabase/Neon — conexão pooled (pgBouncer, porta 6543)
DATABASE_URL="postgresql://USER:PASSWORD@HOST:6543/postgres?pgbouncer=true"
# Conexão direta (porta 5432) — Prisma usa em migrations
DIRECT_URL="postgresql://USER:PASSWORD@HOST:5432/postgres"
# Chave HS256 para assinar o JWT de sessão
AUTH_SECRET="troque-por-uma-chave-aleatoria-de-32+-bytes"
```
`.env` (local; usar placeholders — `prisma generate` não valida a URL). Gerar um `AUTH_SECRET` real:
```bash
node -e "console.log('AUTH_SECRET='+require('crypto').randomBytes(48).toString('base64url'))"
```
Copiar as 3 linhas do `.env.example` para o `.env`, substituindo `AUTH_SECRET` pelo valor gerado. Confirmar que `.env` está no `.gitignore` (o create-next-app já inclui `.env*`).

- [ ] **Step 5: Escrever teste smoke**

`tests/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("tooling", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Rodar o teste**

Run: `npm test`
Expected: PASS (1 teste). Confirma que o vitest + TS estão funcionando.

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: sem erros. (Se o ESLint tentar lintar `tests/`, tudo bem — o arquivo é válido.)

- [ ] **Step 8: Commit (opcional)**

```bash
git add package.json package-lock.json vitest.config.ts .env.example tests/smoke.test.ts
git commit -m "chore(fase2): tooling, deps e ambiente de teste"
```

---

## Task 2: Prisma schema + client singleton

**Files:**
- Create: `prisma/schema.prisma`, `lib/db/prisma.ts`

**Interfaces:**
- Produces: enums `Role`, `OrderStatus`, `PaymentMethod`, `EstablishmentStatus` e models via `@prisma/client`; `prisma` (instância singleton) de `@/lib/db/prisma`.

- [ ] **Step 1: Escrever `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

enum Role {
  ADMIN
  ESTABLISHMENT
}

enum OrderStatus {
  AWAITING_PAYMENT
  IN_PRODUCTION
  DELIVERED
}

enum PaymentMethod {
  CREDIT
  DEBIT
  PIX
  USDC
}

enum EstablishmentStatus {
  ACTIVE
  PAUSED
}

model Establishment {
  id             String              @id @default(cuid())
  slug           String              @unique
  name           String
  owner          String
  type           String
  city           String
  neighborhood   String?
  posto          String?
  radiusM        Int?
  plan           String
  platformFeePct Int                 @default(8)
  serviceFeePct  Int                 @default(10)
  status         EstablishmentStatus @default(ACTIVE)
  tagline        String?
  description    String?
  address        String?
  hours          String?
  coverImg       String?
  phone          String?
  email          String?
  website        String?
  whatsapp       String?
  instagram      String?
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt

  users        User[]
  menuItems    MenuItem[]
  qrSpots      QrSpot[]
  orders       Order[]
  searchEvents SearchEvent[]
}

model User {
  id              String         @id @default(cuid())
  email           String         @unique
  passwordHash    String
  name            String
  role            Role
  establishmentId String?
  establishment   Establishment? @relation(fields: [establishmentId], references: [id], onDelete: Cascade)
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
}

model MenuItem {
  id              String        @id @default(cuid())
  establishmentId String
  establishment   Establishment @relation(fields: [establishmentId], references: [id], onDelete: Cascade)
  name            String
  description     String?
  price           Decimal       @db.Decimal(10, 2)
  oldPrice        Decimal?      @db.Decimal(10, 2)
  photo           String?
  measure         Int?
  unit            String?
  category        String
  subcategory     String
  active          Boolean       @default(true)
  sortOrder       Int           @default(0)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  @@index([establishmentId])
}

model QrSpot {
  id              String        @id @default(cuid())
  establishmentId String
  establishment   Establishment @relation(fields: [establishmentId], references: [id], onDelete: Cascade)
  label           String
  createdAt       DateTime      @default(now())

  @@unique([establishmentId, label])
}

model Order {
  id              String        @id @default(cuid())
  establishmentId String
  establishment   Establishment @relation(fields: [establishmentId], references: [id], onDelete: Cascade)
  code            String        @unique
  status          OrderStatus   @default(AWAITING_PAYMENT)
  locationLabel   String
  posto           String?
  customerName    String?
  note            String?
  subtotal        Decimal       @db.Decimal(10, 2)
  platformFee     Decimal       @db.Decimal(10, 2)
  serviceFee      Decimal       @db.Decimal(10, 2)
  total           Decimal       @db.Decimal(10, 2)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  items       OrderItem[]
  payment     Payment?
  splitShares SplitShare[]

  @@index([establishmentId, status])
}

model OrderItem {
  id         String  @id @default(cuid())
  orderId    String
  order      Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)
  menuItemId String?
  name       String
  qty        Int
  unitPrice  Decimal @db.Decimal(10, 2)
}

model Payment {
  id            String        @id @default(cuid())
  orderId       String        @unique
  order         Order         @relation(fields: [orderId], references: [id], onDelete: Cascade)
  method        PaymentMethod
  installments  Int           @default(1)
  gatewayFeePct Decimal       @db.Decimal(5, 2)
  cardMask      String?
  createdAt     DateTime      @default(now())
}

model SplitShare {
  id          String         @id @default(cuid())
  orderId     String
  order       Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)
  personIndex Int
  amount      Decimal        @db.Decimal(10, 2)
  method      PaymentMethod?
  paid        Boolean        @default(false)
  paidAt      DateTime?

  @@unique([orderId, personIndex])
}

model Lead {
  id                String   @id @default(cuid())
  name              String
  establishmentName String
  city              String?
  phone             String?
  email             String?
  message           String?
  createdAt         DateTime @default(now())
}

model SearchEvent {
  id              String         @id @default(cuid())
  query           String?
  city            String?
  cuisine         String?
  category        String?
  openNow         Boolean?
  establishmentId String?
  establishment   Establishment? @relation(fields: [establishmentId], references: [id], onDelete: SetNull)
  createdAt       DateTime       @default(now())
}
```

- [ ] **Step 2: Validar o schema (sem banco)**

Run: `npx prisma validate`
Expected: "The schema at prisma/schema.prisma is valid 🚀".

- [ ] **Step 3: Gerar o client (sem banco)**

Run: `npm run db:generate`
Expected: "Generated Prisma Client". (Não conecta ao banco.)

- [ ] **Step 4: Criar `lib/db/prisma.ts` (singleton)**

```ts
import { PrismaClient } from "@prisma/client";

// Reuse a single client across HMR reloads in dev to avoid exhausting
// database connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: sem erros.
Run: `npm run build`
Expected: build passa (as páginas que usam Prisma são dinâmicas; nada conecta no build).

- [ ] **Step 6: Commit (opcional)**

```bash
git add prisma/schema.prisma lib/db/prisma.ts
git commit -m "feat(fase2): schema Prisma + client singleton"
```

---

## Task 3: Domínio — precificação, código e split (TDD)

**Files:**
- Create: `lib/domain/pricing.ts`, `tests/domain/pricing.test.ts`

**Interfaces:**
- Consumes: `PaymentMethod` de `@prisma/client`.
- Produces:
  - `GATEWAY_FEE_PCT: Record<PaymentMethod, number>`
  - `computeTotals(subtotal: number, platformFeePct: number, serviceFeePct: number): { platformFee: number; serviceFee: number; total: number }`
  - `splitShares(grand: number, n: number): number[]`
  - `makeOrderCode(): string`

- [ ] **Step 1: Escrever os testes (falhando)**

`tests/domain/pricing.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  GATEWAY_FEE_PCT,
  computeTotals,
  splitShares,
  makeOrderCode,
} from "@/lib/domain/pricing";

describe("computeTotals", () => {
  it("aplica taxas de plataforma e serviço e soma o total", () => {
    const t = computeTotals(121, 8, 10);
    expect(t.platformFee).toBe(9.68);
    expect(t.serviceFee).toBe(12.1);
    expect(t.total).toBe(142.78);
  });

  it("arredonda para 2 casas", () => {
    const t = computeTotals(33.33, 8, 10);
    expect(t.platformFee).toBe(2.67);
    expect(t.serviceFee).toBe(3.33);
    expect(t.total).toBe(39.33);
  });
});

describe("splitShares", () => {
  it("divide igualmente com a última parcela absorvendo o resto", () => {
    const s = splitShares(142.78, 2);
    expect(s).toEqual([71.39, 71.39]);
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(142.78, 2);
  });

  it("mantém a soma exata em divisões não exatas", () => {
    const s = splitShares(100, 3);
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2);
    expect(s).toHaveLength(3);
  });
});

describe("GATEWAY_FEE_PCT", () => {
  it("tem as taxas por método", () => {
    expect(GATEWAY_FEE_PCT).toEqual({ CREDIT: 3.49, DEBIT: 1.99, PIX: 0.99, USDC: 1.0 });
  });
});

describe("makeOrderCode", () => {
  it("gera código PED- com 8 hex", () => {
    expect(makeOrderCode()).toMatch(/^PED-[0-9A-F]{8}$/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/domain/pricing.test.ts`
Expected: FAIL ("Cannot find module '@/lib/domain/pricing'").

- [ ] **Step 3: Implementar `lib/domain/pricing.ts`**

```ts
import type { PaymentMethod } from "@prisma/client";

/** Gateway fee % per method (snapshotted onto each Payment). */
export const GATEWAY_FEE_PCT: Record<PaymentMethod, number> = {
  CREDIT: 3.49,
  DEBIT: 1.99,
  PIX: 0.99,
  USDC: 1.0,
};

const round2 = (v: number): number => Math.round(v * 100) / 100;

export type Totals = { platformFee: number; serviceFee: number; total: number };

/** subtotal + Jurandir platform fee + establishment service fee. */
export function computeTotals(
  subtotal: number,
  platformFeePct: number,
  serviceFeePct: number,
): Totals {
  const platformFee = round2((subtotal * platformFeePct) / 100);
  const serviceFee = round2((subtotal * serviceFeePct) / 100);
  return { platformFee, serviceFee, total: round2(subtotal + platformFee + serviceFee) };
}

/** Split `grand` into `n` even shares; the last absorbs the rounding remainder. */
export function splitShares(grand: number, n: number): number[] {
  const base = Math.floor((grand / n) * 100) / 100;
  const arr = Array<number>(n).fill(base);
  arr[n - 1] = round2(grand - base * (n - 1));
  return arr;
}

/** Random order code: "PED-" + 8 uppercase hex chars. */
export function makeOrderCode(): string {
  const hex = "0123456789ABCDEF";
  return (
    "PED-" +
    Array.from({ length: 8 }, () => hex[Math.floor(Math.random() * 16)]).join("")
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/domain/pricing.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit (opcional)**

```bash
git add lib/domain/pricing.ts tests/domain/pricing.test.ts
git commit -m "feat(fase2): domínio de precificação (taxas, split, código) + testes"
```

---

## Task 4: Hash de senha (TDD)

**Files:**
- Create: `lib/auth/password.ts`, `tests/auth/password.test.ts`

**Interfaces:**
- Produces: `hashPassword(plain: string): Promise<string>`, `verifyPassword(plain: string, hash: string): Promise<boolean>`.

- [ ] **Step 1: Escrever os testes (falhando)**

`tests/auth/password.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password", () => {
  it("faz hash e verifica a senha correta", async () => {
    const hash = await hashPassword("demo1234");
    expect(hash).not.toBe("demo1234");
    expect(await verifyPassword("demo1234", hash)).toBe(true);
  });

  it("rejeita senha errada", async () => {
    const hash = await hashPassword("demo1234");
    expect(await verifyPassword("errada", hash)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/auth/password.test.ts`
Expected: FAIL ("Cannot find module '@/lib/auth/password'").

- [ ] **Step 3: Implementar `lib/auth/password.ts`**

```ts
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/auth/password.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (opcional)**

```bash
git add lib/auth/password.ts tests/auth/password.test.ts
git commit -m "feat(fase2): hash/verify de senha com bcryptjs + testes"
```

---

## Task 5: Sessão JWT + wrappers de cookie (TDD no núcleo puro)

**Files:**
- Create: `lib/auth/session.ts`, `tests/auth/session.test.ts`

**Interfaces:**
- Consumes: `Role` de `@prisma/client`; `AUTH_SECRET` do env.
- Produces:
  - `type SessionPayload = { sub: string; role: Role; establishmentId: string | null; name: string }`
  - `signSession(p: SessionPayload, maxAgeSec?: number): Promise<string>`
  - `verifySession(token: string): Promise<SessionPayload | null>`
  - `createSession(p: SessionPayload, remember: boolean): Promise<void>` (grava cookie)
  - `getSession(): Promise<SessionPayload | null>` (lê cookie)
  - `destroySession(): Promise<void>`
  - `destForRole(role: Role): string`
  - `SESSION_COOKIE = "jur_session"`

- [ ] **Step 1: Escrever os testes (falhando) — só o núcleo puro sign/verify**

`tests/auth/session.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { signSession, verifySession, destForRole } from "@/lib/auth/session";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-1234";
});

describe("session sign/verify", () => {
  it("faz round-trip do payload", async () => {
    const token = await signSession({
      sub: "u1",
      role: "ADMIN",
      establishmentId: null,
      name: "Admin",
    });
    const p = await verifySession(token);
    expect(p?.sub).toBe("u1");
    expect(p?.role).toBe("ADMIN");
    expect(p?.establishmentId).toBeNull();
    expect(p?.name).toBe("Admin");
  });

  it("retorna null para token adulterado", async () => {
    const token = await signSession({
      sub: "u1",
      role: "ESTABLISHMENT",
      establishmentId: "e1",
      name: "Quiosque",
    });
    expect(await verifySession(token + "x")).toBeNull();
  });

  it("retorna null para lixo", async () => {
    expect(await verifySession("not-a-jwt")).toBeNull();
  });
});

describe("destForRole", () => {
  it("mapeia role -> destino", () => {
    expect(destForRole("ADMIN")).toBe("/admin");
    expect(destForRole("ESTABLISHMENT")).toBe("/painel");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/auth/session.test.ts`
Expected: FAIL ("Cannot find module '@/lib/auth/session'").

- [ ] **Step 3: Implementar `lib/auth/session.ts`**

```ts
import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@prisma/client";

export const SESSION_COOKIE = "jur_session";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export type SessionPayload = {
  sub: string;
  role: Role;
  establishmentId: string | null;
  name: string;
};

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

/** Sign a session JWT (HS256). Pure — no cookies. */
export async function signSession(
  p: SessionPayload,
  maxAgeSec = THIRTY_DAYS,
): Promise<string> {
  return new SignJWT({ role: p.role, establishmentId: p.establishmentId, name: p.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSec}s`)
    .sign(secret());
}

/** Verify a session JWT. Returns null on any failure. Pure — no cookies. */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.sub !== "string" || typeof payload.role !== "string") return null;
    return {
      sub: payload.sub,
      role: payload.role as Role,
      establishmentId: (payload.establishmentId as string | null) ?? null,
      name: (payload.name as string) ?? "",
    };
  } catch {
    return null;
  }
}

export async function createSession(p: SessionPayload, remember: boolean): Promise<void> {
  const token = await signSession(p, THIRTY_DAYS);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    ...(remember ? { maxAge: THIRTY_DAYS } : {}),
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  return token ? verifySession(token) : null;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export function destForRole(role: Role): string {
  return role === "ADMIN" ? "/admin" : "/painel";
}
```

> Nota: o import `"server-only"` impede uso acidental no client. O teste importa apenas `signSession`/`verifySession`/`destForRole`, que não tocam `cookies()`. O pacote `server-only` já vem com o Next; se o vitest reclamar do import em ambiente node, trocar por um comentário e mover as funções de cookie para o topo — mas por padrão o vitest resolve `server-only` como no-op fora do bundler do Next. Se falhar, ver Step 4.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/auth/session.test.ts`
Expected: PASS. Se falhar por causa de `server-only`, remover a linha `import "server-only";` (a proteção de rota via server component já garante o uso correto) e rodar de novo.

- [ ] **Step 5: Commit (opcional)**

```bash
git add lib/auth/session.ts tests/auth/session.test.ts
git commit -m "feat(fase2): sessão JWT-cookie (jose) + testes de sign/verify"
```

---

## Task 6: Schemas de validação Zod (TDD)

**Files:**
- Create: `lib/validation.ts`, `tests/validation.test.ts`

**Interfaces:**
- Consumes: `PaymentMethod` de `@prisma/client`.
- Produces: `loginSchema`, `leadCreateSchema`, `orderCreateSchema`, `menuItemUpsertSchema`, `qrSpotCreateSchema`, `searchEventSchema`, e o tipo `OrderCreateInput = z.infer<typeof orderCreateSchema>`.

- [ ] **Step 1: Escrever os testes (falhando)**

`tests/validation.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { loginSchema, orderCreateSchema, leadCreateSchema } from "@/lib/validation";

describe("loginSchema", () => {
  it("aceita credenciais válidas", () => {
    const r = loginSchema.safeParse({ email: "a@b.com", password: "x", remember: true });
    expect(r.success).toBe(true);
  });
  it("rejeita email inválido", () => {
    expect(loginSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
  });
  it("aplica remember=false por padrão", () => {
    const r = loginSchema.parse({ email: "a@b.com", password: "x" });
    expect(r.remember).toBe(false);
  });
});

describe("orderCreateSchema", () => {
  const base = {
    establishmentId: "e1",
    locationLabel: "Guarda-sol nº 14",
    items: [{ name: "Combo", qty: 1, unitPrice: 99 }],
  };
  it("aceita pagamento total", () => {
    const r = orderCreateSchema.safeParse({
      ...base,
      payment: { kind: "full", method: "PIX" },
    });
    expect(r.success).toBe(true);
  });
  it("aceita split de 2 a 8", () => {
    const r = orderCreateSchema.safeParse({
      ...base,
      payment: { kind: "split", shares: [{ method: "PIX" }, { method: null }] },
    });
    expect(r.success).toBe(true);
  });
  it("rejeita split de 1 pessoa", () => {
    const r = orderCreateSchema.safeParse({
      ...base,
      payment: { kind: "split", shares: [{ method: "PIX" }] },
    });
    expect(r.success).toBe(false);
  });
  it("rejeita pedido sem itens", () => {
    const r = orderCreateSchema.safeParse({
      ...base,
      items: [],
      payment: { kind: "full", method: "PIX" },
    });
    expect(r.success).toBe(false);
  });
});

describe("leadCreateSchema", () => {
  it("exige nome e estabelecimento", () => {
    expect(leadCreateSchema.safeParse({ name: "", establishmentName: "" }).success).toBe(false);
    expect(
      leadCreateSchema.safeParse({ name: "Ana", establishmentName: "Bar X" }).success,
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/validation.test.ts`
Expected: FAIL ("Cannot find module '@/lib/validation'").

- [ ] **Step 3: Implementar `lib/validation.ts`**

```ts
import { z } from "zod";
import { PaymentMethod } from "@prisma/client";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  remember: z.boolean().default(false),
});

export const leadCreateSchema = z.object({
  name: z.string().min(1),
  establishmentName: z.string().min(1),
  city: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  message: z.string().max(1000).optional(),
});

const orderItemInput = z.object({
  menuItemId: z.string().optional(),
  name: z.string().min(1),
  qty: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
});

export const orderCreateSchema = z.object({
  establishmentId: z.string().min(1),
  locationLabel: z.string().min(1),
  posto: z.string().optional(),
  customerName: z.string().optional(),
  note: z.string().max(200).optional(),
  items: z.array(orderItemInput).min(1),
  payment: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("full"),
      method: z.nativeEnum(PaymentMethod),
      installments: z.number().int().min(1).max(6).default(1),
      cardMask: z.string().optional(),
    }),
    z.object({
      kind: z.literal("split"),
      shares: z
        .array(z.object({ method: z.nativeEnum(PaymentMethod).nullable() }))
        .min(2)
        .max(8),
    }),
  ]),
});
export type OrderCreateInput = z.infer<typeof orderCreateSchema>;

export const menuItemUpsertSchema = z.object({
  id: z.string().optional(),
  establishmentId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().nonnegative(),
  oldPrice: z.number().nonnegative().nullable().optional(),
  photo: z.string().optional(),
  measure: z.number().int().nullable().optional(),
  unit: z.string().nullable().optional(),
  category: z.string().min(1),
  subcategory: z.string().min(1),
  active: z.boolean().default(true),
});

export const qrSpotCreateSchema = z.object({
  establishmentId: z.string().min(1),
  label: z.string().min(1),
});

export const searchEventSchema = z.object({
  query: z.string().optional(),
  city: z.string().optional(),
  cuisine: z.string().optional(),
  category: z.string().optional(),
  openNow: z.boolean().optional(),
  establishmentId: z.string().optional(),
});
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Rodar toda a suíte + lint**

Run: `npm test`
Expected: PASS (smoke, pricing, password, session, validation).
Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 6: Commit (opcional)**

```bash
git add lib/validation.ts tests/validation.test.ts
git commit -m "feat(fase2): schemas Zod + testes"
```

---

## Task 7: Camada de dados (repos)

**Files:**
- Create: `lib/db/establishments.ts`, `lib/db/menu.ts`, `lib/db/orders.ts`, `lib/db/leads.ts`, `lib/db/search.ts`

**Interfaces:**
- Consumes: `prisma` (`@/lib/db/prisma`), `computeTotals`/`splitShares`/`makeOrderCode`/`GATEWAY_FEE_PCT` (`@/lib/domain/pricing`), `OrderCreateInput` e schemas (`@/lib/validation`), enums de `@prisma/client`.
- Produces:
  - establishments: `getEstablishmentBySlug`, `getEstablishmentById`, `listEstablishments`, `updateEstablishmentFee(id, pct)`.
  - menu: `listMenu(establishmentId)`, `upsertMenuItem(input)`, `deleteMenuItem(id, establishmentId)`.
  - orders: `createOrder(input: OrderCreateInput)`, `payShare(orderId, personIndex, method)`, `deliverOrder(orderId)`, `listOrders(establishmentId, status?)`.
  - leads: `createLead(input)`, `listLeads()`.
  - search: `recordSearchEvent(input)`, `aggregateSearch()`.

> Verificação desta task é por **compilação** (`tsc`/build); o comportamento em runtime é coberto pela Task 10 (`verify-db`) após a `DATABASE_URL`.

- [ ] **Step 1: `lib/db/establishments.ts`**

```ts
import { prisma } from "./prisma";

export function getEstablishmentBySlug(slug: string) {
  return prisma.establishment.findUnique({ where: { slug } });
}

export function getEstablishmentById(id: string) {
  return prisma.establishment.findUnique({ where: { id } });
}

export function listEstablishments() {
  return prisma.establishment.findMany({ orderBy: { name: "asc" } });
}

export function updateEstablishmentFee(id: string, platformFeePct: number) {
  return prisma.establishment.update({ where: { id }, data: { platformFeePct } });
}
```

- [ ] **Step 2: `lib/db/menu.ts`**

```ts
import { prisma } from "./prisma";
import { menuItemUpsertSchema } from "@/lib/validation";
import type { z } from "zod";

export function listMenu(establishmentId: string) {
  return prisma.menuItem.findMany({
    where: { establishmentId },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });
}

export function upsertMenuItem(input: z.infer<typeof menuItemUpsertSchema>) {
  const data = menuItemUpsertSchema.parse(input);
  const { id, establishmentId, oldPrice, measure, unit, ...rest } = data;
  const payload = {
    ...rest,
    oldPrice: oldPrice ?? null,
    measure: measure ?? null,
    unit: unit ?? null,
    establishment: { connect: { id: establishmentId } },
  };
  return id
    ? prisma.menuItem.update({ where: { id }, data: payload })
    : prisma.menuItem.create({ data: payload });
}

export function deleteMenuItem(id: string, establishmentId: string) {
  // Scope by establishmentId so a tenant can only delete its own items.
  return prisma.menuItem.deleteMany({ where: { id, establishmentId } });
}
```

- [ ] **Step 3: `lib/db/orders.ts`** (regras de negócio críticas)

```ts
import { Prisma, OrderStatus, type PaymentMethod } from "@prisma/client";
import { prisma } from "./prisma";
import {
  GATEWAY_FEE_PCT,
  computeTotals,
  makeOrderCode,
  splitShares,
} from "@/lib/domain/pricing";
import { orderCreateSchema, type OrderCreateInput } from "@/lib/validation";

const ORDER_INCLUDE = { items: true, payment: true, splitShares: true } as const;

async function uniqueCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = makeOrderCode();
    const exists = await prisma.order.findUnique({ where: { code } });
    if (!exists) return code;
  }
  throw new Error("could not generate a unique order code");
}

export async function createOrder(input: OrderCreateInput) {
  const data = orderCreateSchema.parse(input);
  const est = await prisma.establishment.findUnique({
    where: { id: data.establishmentId },
    select: { platformFeePct: true, serviceFeePct: true },
  });
  if (!est) throw new Error("establishment not found");

  const subtotal = data.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const { platformFee, serviceFee, total } = computeTotals(
    subtotal,
    est.platformFeePct,
    est.serviceFeePct,
  );
  const code = await uniqueCode();

  const isSplit = data.payment.kind === "split";
  const amounts = isSplit ? splitShares(total, data.payment.shares.length) : [];
  const allPaid = isSplit
    ? data.payment.shares.every((s) => s.method !== null)
    : true;

  return prisma.order.create({
    data: {
      establishment: { connect: { id: data.establishmentId } },
      code,
      status: allPaid ? OrderStatus.IN_PRODUCTION : OrderStatus.AWAITING_PAYMENT,
      locationLabel: data.locationLabel,
      posto: data.posto ?? null,
      customerName: data.customerName ?? null,
      note: data.note ?? null,
      subtotal,
      platformFee,
      serviceFee,
      total,
      items: {
        create: data.items.map((i) => ({
          menuItemId: i.menuItemId ?? null,
          name: i.name,
          qty: i.qty,
          unitPrice: i.unitPrice,
        })),
      },
      ...(data.payment.kind === "full"
        ? {
            payment: {
              create: {
                method: data.payment.method,
                installments: data.payment.installments,
                gatewayFeePct: new Prisma.Decimal(GATEWAY_FEE_PCT[data.payment.method]),
                cardMask: data.payment.cardMask ?? null,
              },
            },
          }
        : {
            splitShares: {
              create: data.payment.shares.map((s, idx) => ({
                personIndex: idx,
                amount: amounts[idx],
                method: s.method,
                paid: s.method !== null,
                paidAt: s.method !== null ? new Date() : null,
              })),
            },
          }),
    },
    include: ORDER_INCLUDE,
  });
}

/** Mark a friend's share paid; when all shares are paid the order goes to production. */
export async function payShare(
  orderId: string,
  personIndex: number,
  method: PaymentMethod,
) {
  return prisma.$transaction(async (tx) => {
    await tx.splitShare.update({
      where: { orderId_personIndex: { orderId, personIndex } },
      data: { method, paid: true, paidAt: new Date() },
    });
    const remaining = await tx.splitShare.count({ where: { orderId, paid: false } });
    if (remaining === 0) {
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.IN_PRODUCTION },
      });
    }
    return tx.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
  });
}

export function deliverOrder(orderId: string) {
  return prisma.order.update({
    where: { id: orderId },
    data: { status: OrderStatus.DELIVERED },
    include: ORDER_INCLUDE,
  });
}

export function listOrders(establishmentId: string, status?: OrderStatus) {
  return prisma.order.findMany({
    where: { establishmentId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    include: ORDER_INCLUDE,
  });
}
```

- [ ] **Step 4: `lib/db/leads.ts`**

```ts
import { prisma } from "./prisma";
import { leadCreateSchema } from "@/lib/validation";
import type { z } from "zod";

export function createLead(input: z.infer<typeof leadCreateSchema>) {
  const data = leadCreateSchema.parse(input);
  return prisma.lead.create({ data });
}

export function listLeads() {
  return prisma.lead.findMany({ orderBy: { createdAt: "desc" } });
}
```

- [ ] **Step 5: `lib/db/search.ts`**

```ts
import { prisma } from "./prisma";
import { searchEventSchema } from "@/lib/validation";
import type { z } from "zod";

export function recordSearchEvent(input: z.infer<typeof searchEventSchema>) {
  const data = searchEventSchema.parse(input);
  return prisma.searchEvent.create({ data });
}

/** Count events grouped by city (for the admin "Buscas" aggregation). */
export function aggregateSearch() {
  return prisma.searchEvent.groupBy({
    by: ["city"],
    _count: { _all: true },
    orderBy: { _count: { city: "desc" } },
  });
}
```

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: sem erros.
Run: `npm run build`
Expected: passa.

- [ ] **Step 7: Commit (opcional)**

```bash
git add lib/db/establishments.ts lib/db/menu.ts lib/db/orders.ts lib/db/leads.ts lib/db/search.ts
git commit -m "feat(fase2): camada de dados (repos) com regras de negócio"
```

---

## Task 8: Auth real (actions) + proteção de rotas + remover mock

**Files:**
- Modify: `lib/auth/actions.ts`, `app/[locale]/painel/page.tsx`, `app/[locale]/admin/page.tsx`
- Remove: `lib/auth/mock.ts`

**Interfaces:**
- Consumes: `prisma`, `verifyPassword`, `createSession`/`destroySession`/`getSession`/`destForRole`, `loginSchema`.
- Produces: `login(email, password, remember): Promise<LoginResult>`, `logout(locale): Promise<void>` (assinatura inalterada).

- [ ] **Step 1: Reescrever `lib/auth/actions.ts`**

```ts
"use server";

import { redirect } from "@/i18n/navigation";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, destForRole } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validation";

export type LoginResult =
  | { ok: true; dest: string }
  | { ok: false; error: string };

/** Real login: validates against the DB (bcrypt) and sets the JWT session cookie. */
export async function login(
  email: string,
  password: string,
  remember: boolean,
): Promise<LoginResult> {
  const parsed = loginSchema.safeParse({ email, password, remember });
  if (!parsed.success) return { ok: false, error: "invalidCredentials" };

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.trim().toLowerCase() },
  });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { ok: false, error: "invalidCredentials" };
  }

  await createSession(
    {
      sub: user.id,
      role: user.role,
      establishmentId: user.establishmentId,
      name: user.name,
    },
    parsed.data.remember,
  );

  return { ok: true, dest: destForRole(user.role) };
}

export async function logout(locale: string): Promise<void> {
  await destroySession();
  redirect({ href: "/login", locale });
}
```

- [ ] **Step 2: Atualizar `app/[locale]/painel/page.tsx` (guard por sessão)**

Substituir a leitura do cookie/`SESSION_COOKIE` por `getSession()`. O arquivo deve ficar:
```tsx
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/auth/session";
import { PanelApp } from "@/components/panel/PanelApp";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "panel" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function PainelPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (session?.role !== "ESTABLISHMENT") redirect({ href: "/login", locale });

  // Server timestamp → deterministic seed for SSR/hydration (see PanelApp).
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  return <PanelApp now={now} />;
}
```

- [ ] **Step 3: Atualizar `app/[locale]/admin/page.tsx` (guard por sessão)**

Abrir o arquivo, trocar o import do cookie/`SESSION_COOKIE` por `import { getSession } from "@/lib/auth/session";`, e substituir a checagem de role por:
```tsx
  const session = await getSession();
  if (session?.role !== "ADMIN") redirect({ href: "/login", locale });
```
Manter o resto (metadata, `now`, `<AdminApp now={now} />`) inalterado.

- [ ] **Step 4: Remover `lib/auth/mock.ts` e conferir imports órfãos**

Run:
```bash
rm lib/auth/mock.ts
```
Run (deve retornar vazio — nenhum import restante de `auth/mock`):
```bash
grep -rn "auth/mock" app components lib || echo "sem referências a auth/mock"
```
Expected: "sem referências a auth/mock". Se aparecer alguma, atualizar o import para `@/lib/auth/session` (para `SESSION_COOKIE`/`destForRole`) e resolver.

- [ ] **Step 5: Typecheck, build e lint**

Run: `npx tsc --noEmit`
Expected: sem erros.
Run: `npm run build`
Expected: passa.
Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 6: Commit (opcional)**

```bash
git add lib/auth/actions.ts app/[locale]/painel/page.tsx app/[locale]/admin/page.tsx
git rm lib/auth/mock.ts
git commit -m "feat(fase2): login real via DB + guard de rota por sessão; remove mock"
```

---

## Task 9: Seed (`prisma/seed.ts`)

**Files:**
- Create: `prisma/seed.ts`

**Interfaces:**
- Consumes: `SEED_ESTS` (`@/lib/data/admin`), `SEED_MENU`/`SEED_ORDERS`/`SEED_QRS`/`SEED_PROFILE` (`@/lib/data/panel`), `hashPassword`, `computeTotals`/`splitShares`/`GATEWAY_FEE_PCT`, enums.
- Produces: dados no banco (13 estabelecimentos, Quiosque do Mar completo, 2 usuários).

> Este arquivo **compila** agora; só **roda** após a `DATABASE_URL` (Task 10).

- [ ] **Step 1: Escrever `prisma/seed.ts`**

```ts
import { PrismaClient, OrderStatus, PaymentMethod } from "@prisma/client";
import { SEED_ESTS } from "../lib/data/admin";
import {
  SEED_MENU,
  SEED_ORDERS,
  SEED_QRS,
  SEED_PROFILE,
} from "../lib/data/panel";
import { hashPassword } from "../lib/auth/password";
import { computeTotals, splitShares, GATEWAY_FEE_PCT } from "../lib/domain/pricing";

const prisma = new PrismaClient();

const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const PAY_MAP: Record<string, PaymentMethod> = {
  credito: PaymentMethod.CREDIT,
  debito: PaymentMethod.DEBIT,
  pix: PaymentMethod.PIX,
  usdc: PaymentMethod.USDC,
};
const STATUS_MAP: Record<string, OrderStatus> = {
  aguardando: OrderStatus.AWAITING_PAYMENT,
  producao: OrderStatus.IN_PRODUCTION,
  entregue: OrderStatus.DELIVERED,
};

async function main() {
  const now = Date.now();

  // 1) Establishments (upsert by slug). Quiosque do Mar (id "live") is the demo tenant.
  const slugById = new Map<string, string>();
  for (const e of SEED_ESTS) {
    const slug = e.id === "live" ? "quiosque-do-mar" : slugify(e.name);
    slugById.set(e.id, slug);
    const isDemo = e.id === "live";
    const est = await prisma.establishment.upsert({
      where: { slug },
      update: {},
      create: {
        slug,
        name: e.name,
        owner: e.owner,
        type: e.tipo,
        city: e.city,
        neighborhood: e.neigh || null,
        posto: e.posto || null,
        radiusM: e.radius ? Number(e.radius) : null,
        plan: e.plan,
        platformFeePct: Math.round(parseFloat(e.fee.replace(",", ".")) || 8),
        serviceFeePct: isDemo ? Number(SEED_PROFILE.serviceFee) : 10,
        status: e.status === "ativo" ? "ACTIVE" : "PAUSED",
        tagline: isDemo ? SEED_PROFILE.tagline : null,
        description: isDemo ? SEED_PROFILE.desc : null,
        address: isDemo ? SEED_PROFILE.address : null,
        hours: isDemo ? SEED_PROFILE.hours : null,
        phone: e.phone || null,
        email: e.email || null,
        website: e.website || null,
        whatsapp: e.whatsapp || null,
        instagram: e.instagram || null,
      },
    });

    // Users: every establishment has a login (user field + password).
    if (e.user && e.password) {
      await prisma.user.upsert({
        where: { email: e.user.toLowerCase() },
        update: {},
        create: {
          email: e.user.toLowerCase(),
          passwordHash: await hashPassword(e.password),
          name: e.name,
          role: "ESTABLISHMENT",
          establishmentId: est.id,
        },
      });
    }

    if (!isDemo) continue;

    // 2) Quiosque do Mar: menu, QR spots, orders.
    for (const m of SEED_MENU) {
      await prisma.menuItem.create({
        data: {
          establishmentId: est.id,
          name: m.name,
          description: m.desc,
          price: m.price,
          oldPrice: m.old ?? null,
          photo: m.photo || null,
          measure: m.measure ?? null,
          unit: m.unit ?? null,
          category: m.cat,
          subcategory: m.sub,
          sortOrder: m.id,
        },
      });
    }
    for (const q of SEED_QRS) {
      await prisma.qrSpot.create({
        data: { establishmentId: est.id, label: q.label },
      });
    }
    for (const o of SEED_ORDERS) {
      const subtotal = o.items.reduce((s, [qty, , price]) => s + qty * price, 0);
      const { platformFee, serviceFee, total } = computeTotals(
        subtotal,
        est.platformFeePct,
        est.serviceFeePct,
      );
      const method = PAY_MAP[o.pay];
      const createdAt = new Date(now - o.minutesAgo * 60000);
      await prisma.order.create({
        data: {
          establishmentId: est.id,
          code: o.code,
          status: STATUS_MAP[o.st],
          locationLabel: o.loc,
          posto: o.posto ?? null,
          customerName: o.cust || null,
          note: o.note ?? null,
          subtotal,
          platformFee,
          serviceFee,
          total,
          createdAt,
          items: {
            create: o.items.map(([qty, name, price]) => ({ name, qty, unitPrice: price })),
          },
          ...(o.splits
            ? {
                splitShares: {
                  create: splitShares(total, o.splits.people).map((amount, idx) => {
                    const paid = idx < o.splits!.paid;
                    return {
                      personIndex: idx,
                      amount,
                      method: paid ? method : null,
                      paid,
                      paidAt: paid ? createdAt : null,
                    };
                  }),
                },
              }
            : {
                payment: {
                  create: {
                    method,
                    installments: 1,
                    gatewayFeePct: GATEWAY_FEE_PCT[method],
                    cardMask: o.card || null,
                  },
                },
              }),
        },
      });
    }
  }

  // 3) Admin user (no establishment).
  await prisma.user.upsert({
    where: { email: "admin@jurandir.app" },
    update: {},
    create: {
      email: "admin@jurandir.app",
      passwordHash: await hashPassword("admin1234"),
      name: "Administração Jurandir",
      role: "ADMIN",
    },
  });

  const counts = {
    establishments: await prisma.establishment.count(),
    users: await prisma.user.count(),
    menuItems: await prisma.menuItem.count(),
    orders: await prisma.order.count(),
  };
  console.log("seed OK", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

> Nota: o `email` do admin (`admin@jurandir.app`) e o do Quiosque do Mar (`contato@quiosquedomar.com.br`, vindo de `SEED_ESTS[0].user`) coincidem com as credenciais demo. Como o `user` do "live" é o mesmo email do `email`, o upsert por email é idempotente.

- [ ] **Step 2: Typecheck do seed**

Run: `npx tsc --noEmit`
Expected: sem erros. (Ajustar tipos se o TS reclamar de `o.splits!` — o guard `o.splits ?` garante a presença.)

- [ ] **Step 3: Commit (opcional)**

```bash
git add prisma/seed.ts
git commit -m "feat(fase2): seed reusando os mocks (13 ests, Quiosque do Mar, 2 users)"
```

---

## Task 10: Script de verificação + runbook pós-URL

**Files:**
- Create: `scripts/verify-db.ts`

**Interfaces:**
- Consumes: repos (`@/lib/db/*`), `verifyPassword`, `prisma`.

- [ ] **Step 1: Escrever `scripts/verify-db.ts`**

```ts
/**
 * Exercises the Fase 2 foundation against a seeded database.
 * Run AFTER `npm run db:migrate` + `npm run db:seed`, with DATABASE_URL set.
 *   npx tsx scripts/verify-db.ts
 */
import { PrismaClient, PaymentMethod } from "@prisma/client";
import { verifyPassword } from "../lib/auth/password";
import { getEstablishmentBySlug } from "../lib/db/establishments";
import { createOrder, payShare } from "../lib/db/orders";
import { createLead } from "../lib/db/leads";
import { recordSearchEvent } from "../lib/db/search";

const prisma = new PrismaClient();
let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
}

async function main() {
  // 1) Establishment count == 13
  const estCount = await prisma.establishment.count();
  check("13 estabelecimentos", estCount === 13);

  // 2) Login (both accounts)
  const admin = await prisma.user.findUnique({ where: { email: "admin@jurandir.app" } });
  check("admin existe", !!admin);
  check("admin senha OK", !!admin && (await verifyPassword("admin1234", admin.passwordHash)));
  check(
    "admin senha errada falha",
    !!admin && !(await verifyPassword("errada", admin.passwordHash)),
  );

  const demo = await prisma.user.findUnique({
    where: { email: "contato@quiosquedomar.com.br" },
  });
  check("estabelecimento existe", !!demo && demo.role === "ESTABLISHMENT" && !!demo.establishmentId);
  check("estabelecimento senha OK", !!demo && (await verifyPassword("demo1234", demo.passwordHash)));

  const est = await getEstablishmentBySlug("quiosque-do-mar");
  check("slug quiosque-do-mar existe", !!est);
  if (!est) throw new Error("sem estabelecimento demo");

  // 3) Split order -> AWAITING_PAYMENT; pay both shares -> IN_PRODUCTION
  const split = await createOrder({
    establishmentId: est.id,
    locationLabel: "Guarda-sol nº 99",
    items: [{ name: "Combo Casal", qty: 1, unitPrice: 99 }],
    payment: { kind: "split", shares: [{ method: null }, { method: null }] },
  });
  check("split criado como AWAITING_PAYMENT", split.status === "AWAITING_PAYMENT");
  await payShare(split.id, 0, PaymentMethod.PIX);
  const afterOne = await payShare(split.id, 1, PaymentMethod.CREDIT);
  check("split 100% pago vira IN_PRODUCTION", afterOne?.status === "IN_PRODUCTION");

  // 4) Full credit order (>= R$100) with masked card + gateway fee snapshot
  const full = await createOrder({
    establishmentId: est.id,
    locationLabel: "Guarda-sol nº 100",
    items: [{ name: "Combo Casal", qty: 2, unitPrice: 99 }],
    payment: { kind: "full", method: "CREDIT", installments: 3, cardMask: "Visa •••• 4412" },
  });
  check("pagamento total vira IN_PRODUCTION", full.status === "IN_PRODUCTION");
  check("gatewayFeePct snapshot 3.49", Number(full.payment?.gatewayFeePct) === 3.49);
  check("cartão mascarado", full.payment?.cardMask === "Visa •••• 4412");

  // 5) Lead + search event
  const lead = await createLead({ name: "Ana", establishmentName: "Novo Bar", city: "Itajaí/SC" });
  check("lead criado", !!lead.id);
  const ev = await recordSearchEvent({ query: "camarão", city: "Itajaí/SC" });
  check("search event criado", !!ev.id);

  console.log(failures === 0 ? "\nTODOS OS CHECKS PASSARAM" : `\n${failures} CHECK(S) FALHARAM`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Typecheck + build + suíte de unidade**

Run: `npx tsc --noEmit`
Expected: sem erros.
Run: `npm run build`
Expected: passa.
Run: `npm test`
Expected: PASS (smoke, pricing, password, session, validation).
Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 3: Runbook pós-`DATABASE_URL`** (executar quando o usuário fornecer as strings)

1. Preencher `.env` com `DATABASE_URL` (pooled 6543), `DIRECT_URL` (direta 5432).
2. Criar a migration inicial + aplicar:
   ```bash
   npm run db:migrate -- --name init
   ```
   Expected: cria `prisma/migrations/<timestamp>_init/` e aplica no banco.
3. Popular:
   ```bash
   npm run db:seed
   ```
   Expected: `seed OK { establishments: 13, users: 13, menuItems: 19, orders: 8 }` (users = 12 estabelecimentos com credencial + 1 admin; conferir a contagem real e ajustar se algum est não tiver `user`).
4. Verificar a fundação:
   ```bash
   npx tsx scripts/verify-db.ts
   ```
   Expected: "TODOS OS CHECKS PASSARAM".
5. Testar o login real no app:
   ```bash
   npm run build && npm run start
   ```
   Logar em `/login` com `admin@jurandir.app` / `admin1234` (→ `/admin`) e `contato@quiosquedomar.com.br` / `demo1234` (→ `/painel`); credencial errada mostra `invalidCredentials`.

- [ ] **Step 4: Commit (opcional)**

```bash
git add scripts/verify-db.ts
git commit -m "feat(fase2): script de verificação da fundação + runbook"
```

---

## Self-review (autor)

- **Cobertura do spec:** deps/env (T1) · schema/enums/models + client (T2) · precificação+split+código (T3) · bcrypt (T4) · JWT-cookie/sessão+destForRole (T5) · Zod (T6) · repos + regra "100% pago → IN_PRODUCTION" + multi-tenant + cartão mascarado (T7) · login real + guard de rota + remoção do mock (T8) · seed reusando mocks + 2 contas (T9) · verificação + runbook (T10). Regras de negócio (taxas 8%+serviço, gateway fees, código PED-, parcelamento até 6x — validado no Zod min1/max6, split 2–8) cobertas.
- **Sem placeholders:** todo passo tem código/comando reais.
- **Consistência de tipos:** `SessionPayload`, `OrderCreateInput`, assinaturas dos repos e enums usados igualmente entre tasks. `computeTotals`/`splitShares`/`makeOrderCode` definidas na T3 e consumidas em T7/T9/T10 com os mesmos nomes.
- **Fora de escopo (não implementar aqui):** religar UI ao DB; Fase 6 (gateway real, USDC, ESC/POS, WhatsApp/e-mail, gravar SearchEvent pela landing).
