# Pagamentos multi-provider (Asaas + Mercado Pago) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cobrança Pix real com split de marketplace (Jurandir retém `platformFee`), via dois gateways plugáveis (Asaas e Mercado Pago), dirigindo o status do pedido por webhook + reconciliação.

**Architecture:** Uma interface `PaymentProvider` isola os gateways; `getProvider(est)` escolhe por `Establishment.paymentProvider`. `createOrder` cria a cobrança quando o estabelecimento está onboardado (senão mantém o fluxo simulado). Confirmação via webhook (primária) + reconciliação server-side no poll de 5s do app (fallback e viabiliza dev sem webhook público).

**Tech Stack:** Next.js 16.2.11 (App Router, route handlers), Prisma 6 + Postgres (Neon), TypeScript, Zod, vitest. Asaas REST (`access_token` header) e Mercado Pago REST (`Authorization: Bearer` + OAuth).

## Global Constraints

- **Não rodar `npm run build`** com o `dev` do usuário no :3000 (clobber do `.next`). Verificação: `npx tsc --noEmit` + `npm run lint` + `npm test`.
- **Sem git** — cada tarefa fecha com a tríade de verificação acima (não há passo de commit).
- **Sem mocks em runtime** exceto o fallback simulado por estabelecimento não onboardado.
- **Chaves ainda não disponíveis** → verificação de runtime (E2E contra sandbox) é **deferida**; unit tests usam `fetch` mockado.
- Dinheiro `Decimal(10,2)` no banco → `Number()` na borda; arredondar com `round2`.
- Split: estabelecimento recebe `round2(total − platformFee)`; Jurandir retém `platformFee`.
- Segredos só no servidor (`ASAAS_*`, `MP_*`, `AUTH_SECRET`); nunca no bundle client.
- Testes em `tests/<domínio>/<nome>.test.ts` (padrão do repo), `import { describe, it, expect, vi } from "vitest"`, alias `@/`.
- Base sandbox Asaas `https://api-sandbox.asaas.com/v3`; MP `https://api.mercadopago.com`.

## Mapa de arquivos

**Criar:**
- `lib/payments/types.ts` — interface `PaymentProvider`, tipos `PixCharge`, `ChargeStatus`, `PixChargeInput`.
- `lib/payments/asaas.ts` — cliente Asaas + `asaasProvider` + `createSubaccount`.
- `lib/payments/mercadopago.ts` — cliente MP + `mercadoPagoProvider` + OAuth (`getOAuthUrl`/`exchangeOAuthCode`/`refreshToken`) + `signState`/`verifyState`.
- `lib/payments/index.ts` — `getProvider(est)`.
- `lib/db/payments.ts` — `confirmChargePaid`, `reconcileByChargeId`, `reconcileOrder`.
- `app/api/webhooks/asaas/route.ts`, `app/api/webhooks/mercadopago/route.ts`, `app/api/payments/mercadopago/callback/route.ts`.
- Testes: `tests/payments/asaas.test.ts`, `tests/payments/mercadopago.test.ts`, `tests/payments/provider.test.ts`, `tests/domain/split.test.ts`.

**Modificar:**
- `prisma/schema.prisma` — enum `PaymentProvider` + campos em `Establishment` e `Payment`.
- `lib/domain/pricing.ts` — exportar `round2` + `splitToEstablishment`.
- `lib/db/orders.ts` — `createOrder` orquestra a cobrança.
- `lib/app/adapters.ts` + `lib/app/helpers.ts` — campos Pix no `ClientOrder`.
- `lib/actions/app.ts` — `getMyOrdersAction` reconcilia pedidos aguardando.
- `lib/actions/admin.ts` — `connectAsaasAction`, `getMpConnectUrlAction`.
- `components/app/screens/DoneScreen.tsx` — bloco do QR Pix.
- `messages/pt.json`, `messages/en.json` — textos do Pix + botão de conectar.
- `.env` — variáveis `ASAAS_*`/`MP_*` (placeholders; chaves reais vêm do usuário).

---

### Task 1: Schema + helpers de split

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `lib/domain/pricing.ts`
- Test: `tests/domain/split.test.ts`

**Interfaces:**
- Produces: enum `PaymentProvider { ASAAS MERCADO_PAGO }`; `Establishment.{paymentProvider,paymentOnboarded,ownerCpfCnpj,asaasAccountId,asaasWalletId,mpUserId,mpAccessToken,mpRefreshToken,mpPublicKey}`; `Payment.{provider,gatewayChargeId,pixPayload,pixQrImage,confirmedAt,splitToEstablishment}`; `round2(v:number):number`; `splitToEstablishment(total:number,platformFee:number):number`.

- [ ] **Step 1: Escrever o teste que falha** — `tests/domain/split.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { round2, splitToEstablishment } from "@/lib/domain/pricing";

describe("splitToEstablishment", () => {
  it("estabelecimento recebe total menos a taxa da plataforma", () => {
    expect(splitToEstablishment(100, 8)).toBe(92);
  });
  it("arredonda em 2 casas", () => {
    expect(splitToEstablishment(100.005, 8.004)).toBe(round2(100.005 - 8.004));
    expect(round2(1.005)).toBe(1.01);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- split` → FAIL (`splitToEstablishment` não existe).

- [ ] **Step 3: Implementar em `lib/domain/pricing.ts`** — trocar `const round2` por export e adicionar o helper:

```ts
export const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Valor que vai ao estabelecimento no split de marketplace. */
export function splitToEstablishment(total: number, platformFee: number): number {
  return round2(total - platformFee);
}
```
(Remover a antiga linha `const round2 = ...;` — as demais funções do arquivo continuam usando `round2`.)

- [ ] **Step 4: Editar `prisma/schema.prisma`** — adicionar o enum e os campos:

```prisma
enum PaymentProvider {
  ASAAS
  MERCADO_PAGO
}
```
Em `model Establishment` (após os campos existentes):
```prisma
  paymentProvider  PaymentProvider @default(ASAAS)
  paymentOnboarded Boolean         @default(false)
  ownerCpfCnpj     String?
  asaasAccountId   String?
  asaasWalletId    String?
  mpUserId         String?
  mpAccessToken    String?
  mpRefreshToken   String?
  mpPublicKey      String?
```
Em `model Payment` (após os campos existentes):
```prisma
  provider             PaymentProvider?
  gatewayChargeId      String?          @unique
  pixPayload           String?
  pixQrImage           String?          @db.Text
  confirmedAt          DateTime?
  splitToEstablishment Decimal?         @db.Decimal(10, 2)
```

- [ ] **Step 5: Aplicar a migração** — `npx prisma migrate dev --name payments_multiprovider`. Se o TTY bloquear (como na Fase 2), usar: `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/manual.sql` seguido de `npx prisma migrate deploy` e `npx prisma generate`. Confirmar com `npx prisma generate` que o client tem os novos campos.

- [ ] **Step 6: Verificar** — `npm test -- split` (PASS) + `npx tsc --noEmit` (limpo) + `npm run lint` (limpo).

---

### Task 2: Interface do provider + provider Asaas

**Files:**
- Create: `lib/payments/types.ts`
- Create: `lib/payments/asaas.ts`
- Test: `tests/payments/asaas.test.ts`

**Interfaces:**
- Consumes: `round2`, `splitToEstablishment` (Task 1); `Establishment` de `@prisma/client`.
- Produces:
  - `type ChargeStatus = "pending" | "paid" | "failed"`
  - `type PixCharge = { chargeId: string; pixPayload: string; pixQrImage: string; status: ChargeStatus }`
  - `type PixChargeInput = { est: Establishment; reference: string; total: number; platformFee: number; customerName?: string; description: string }`
  - `interface PaymentProvider { readonly name: "ASAAS" | "MERCADO_PAGO"; createPixCharge(i: PixChargeInput): Promise<PixCharge>; getChargeStatus(est: Establishment, chargeId: string): Promise<ChargeStatus> }`
  - `asaasProvider: PaymentProvider`; `createSubaccount(est: Establishment): Promise<{ accountId: string; walletId: string }>`; `class AsaasError`.

- [ ] **Step 1: Criar `lib/payments/types.ts`**

```ts
import type { Establishment } from "@prisma/client";

export type ChargeStatus = "pending" | "paid" | "failed";

export type PixCharge = {
  chargeId: string;
  pixPayload: string; // copia-e-cola
  pixQrImage: string; // base64 PNG (sem prefixo data:)
  status: ChargeStatus;
};

export type PixChargeInput = {
  est: Establishment;
  reference: string; // order.code — referência externa/idempotência no gateway
  total: number;
  platformFee: number;
  customerName?: string;
  description: string;
};

export interface PaymentProvider {
  readonly name: "ASAAS" | "MERCADO_PAGO";
  createPixCharge(input: PixChargeInput): Promise<PixCharge>;
  getChargeStatus(est: Establishment, chargeId: string): Promise<ChargeStatus>;
}
```

- [ ] **Step 2: Escrever o teste que falha** — `tests/payments/asaas.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { asaasProvider } from "@/lib/payments/asaas";
import type { Establishment } from "@prisma/client";

function seq(bodies: unknown[]) {
  const fn = vi.fn();
  bodies.forEach((b) =>
    fn.mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(b) }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

const est = { asaasWalletId: "wal_1", ownerCpfCnpj: "24971563792", name: "Bar", email: "b@b.com" } as unknown as Establishment;

beforeEach(() => {
  process.env.ASAAS_API_KEY = "test-key";
  process.env.ASAAS_BASE_URL = "https://api-sandbox.asaas.com/v3";
  vi.restoreAllMocks();
});

describe("asaasProvider.createPixCharge", () => {
  it("cria cliente, cobrança Pix com split e devolve o QR", async () => {
    const fn = seq([
      { id: "cus_1" },
      { id: "pay_1", status: "PENDING" },
      { payload: "000201-copiaecola", encodedImage: "iVBORw0KGgo=" },
    ]);
    const r = await asaasProvider.createPixCharge({
      est, reference: "PED-ABC", total: 100, platformFee: 8, description: "Pedido PED-ABC",
    });
    expect(r).toEqual({
      chargeId: "pay_1", pixPayload: "000201-copiaecola", pixQrImage: "iVBORw0KGgo=", status: "pending",
    });
    // 3ª chamada (index 1 = /payments) carrega o split correto
    const paymentBody = JSON.parse(fn.mock.calls[1][1].body as string);
    expect(paymentBody.billingType).toBe("PIX");
    expect(paymentBody.value).toBe(100);
    expect(paymentBody.externalReference).toBe("PED-ABC");
    expect(paymentBody.split).toEqual([{ walletId: "wal_1", fixedValue: 92 }]);
  });
});

describe("asaasProvider.getChargeStatus", () => {
  it("mapeia RECEIVED → paid", async () => {
    seq([{ status: "RECEIVED" }]);
    expect(await asaasProvider.getChargeStatus(est, "pay_1")).toBe("paid");
  });
  it("mapeia PENDING → pending", async () => {
    seq([{ status: "PENDING" }]);
    expect(await asaasProvider.getChargeStatus(est, "pay_1")).toBe("pending");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar** — `npm test -- asaas` → FAIL (módulo não existe).

- [ ] **Step 4: Implementar `lib/payments/asaas.ts`**

```ts
import type { Establishment } from "@prisma/client";
import { round2, splitToEstablishment } from "@/lib/domain/pricing";
import type { PaymentProvider, PixCharge, PixChargeInput, ChargeStatus } from "./types";

const baseUrl = () => process.env.ASAAS_BASE_URL ?? "https://api-sandbox.asaas.com/v3";
const apiKey = () => process.env.ASAAS_API_KEY ?? "";
const SANDBOX_CPF = "24971563792"; // CPF válido de testes (sandbox)

export class AsaasError extends Error {
  constructor(public status: number, public body: string) {
    super(`Asaas ${status}: ${body}`);
    this.name = "AsaasError";
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", access_token: apiKey(), ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new AsaasError(res.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}

function mapStatus(s: string): ChargeStatus {
  if (s === "RECEIVED" || s === "CONFIRMED" || s === "RECEIVED_IN_CASH") return "paid";
  if (s === "PENDING" || s === "AWAITING_RISK_ANALYSIS") return "pending";
  return "failed";
}

function dueTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export const asaasProvider: PaymentProvider = {
  name: "ASAAS",
  async createPixCharge(input: PixChargeInput): Promise<PixCharge> {
    const { est, reference, total, platformFee, customerName, description } = input;
    const customer = await call<{ id: string }>("/customers", {
      method: "POST",
      body: JSON.stringify({ name: customerName || "Cliente Jurandir", cpfCnpj: est.ownerCpfCnpj || SANDBOX_CPF }),
    });
    const charge = await call<{ id: string; status: string }>("/payments", {
      method: "POST",
      body: JSON.stringify({
        customer: customer.id,
        billingType: "PIX",
        value: total,
        dueDate: dueTomorrow(),
        description,
        externalReference: reference,
        split: [{ walletId: est.asaasWalletId, fixedValue: splitToEstablishment(total, platformFee) }],
      }),
    });
    const qr = await call<{ payload: string; encodedImage: string }>(`/payments/${charge.id}/pixQrCode`);
    return { chargeId: charge.id, pixPayload: qr.payload, pixQrImage: qr.encodedImage, status: mapStatus(charge.status) };
  },
  async getChargeStatus(_est: Establishment, chargeId: string): Promise<ChargeStatus> {
    const c = await call<{ status: string }>(`/payments/${chargeId}`);
    return mapStatus(c.status);
  },
};

export async function createSubaccount(est: Establishment): Promise<{ accountId: string; walletId: string }> {
  const r = await call<{ id: string; walletId: string }>("/accounts", {
    method: "POST",
    body: JSON.stringify({
      name: est.name,
      email: est.email,
      cpfCnpj: est.ownerCpfCnpj,
      mobilePhone: (est.phone ?? "").replace(/\D/g, "") || "47999990000",
      address: est.address ?? "Rua Exemplo",
      addressNumber: "100",
      province: "Centro",
      postalCode: "88300000",
    }),
  });
  return { accountId: r.id, walletId: r.walletId };
}
```
Nota: `round2` importado fica disponível para uso futuro; o split usa `splitToEstablishment`.

- [ ] **Step 5: Verificar** — `npm test -- asaas` (PASS) + `npx tsc --noEmit` + `npm run lint`.

---

### Task 3: Provider Mercado Pago + OAuth

**Files:**
- Create: `lib/payments/mercadopago.ts`
- Test: `tests/payments/mercadopago.test.ts`

**Interfaces:**
- Consumes: `PaymentProvider`, `PixCharge`, `PixChargeInput`, `ChargeStatus` (Task 2); `splitToEstablishment` não é usado (MP usa `application_fee = platformFee`).
- Produces: `mercadoPagoProvider: PaymentProvider`; `getOAuthUrl(state: string): string`; `exchangeOAuthCode(code: string): Promise<{ userId: string; accessToken: string; refreshToken: string; publicKey: string }>`; `signState(estId: string): string`; `verifyState(state: string): string | null`; `class MpError`.

- [ ] **Step 1: Escrever o teste que falha** — `tests/payments/mercadopago.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mercadoPagoProvider, getOAuthUrl, exchangeOAuthCode, signState, verifyState } from "@/lib/payments/mercadopago";
import type { Establishment } from "@prisma/client";

function seq(bodies: unknown[]) {
  const fn = vi.fn();
  bodies.forEach((b) => fn.mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(b) }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

const est = { id: "est_1", mpAccessToken: "seller-token" } as unknown as Establishment;

beforeEach(() => {
  process.env.MP_BASE_URL = "https://api.mercadopago.com";
  process.env.MP_CLIENT_ID = "app-123";
  process.env.MP_CLIENT_SECRET = "secret-xyz";
  process.env.MP_REDIRECT_URI = "http://localhost:3000/api/payments/mercadopago/callback";
  process.env.AUTH_SECRET = "unit-secret";
  vi.restoreAllMocks();
});

describe("mercadoPagoProvider.createPixCharge", () => {
  it("cria pagamento Pix com application_fee e devolve o QR", async () => {
    const fn = seq([
      { id: 987654, status: "pending", point_of_interaction: { transaction_data: { qr_code: "copiaecola", qr_code_base64: "iVBOR" } } },
    ]);
    const r = await mercadoPagoProvider.createPixCharge({ est, reference: "PED-1", total: 100, platformFee: 8, description: "Pedido PED-1" });
    expect(r).toEqual({ chargeId: "987654", pixPayload: "copiaecola", pixQrImage: "iVBOR", status: "pending" });
    const body = JSON.parse(fn.mock.calls[0][1].body as string);
    expect(body.payment_method_id).toBe("pix");
    expect(body.transaction_amount).toBe(100);
    expect(body.application_fee).toBe(8);
    expect(body.external_reference).toBe("PED-1");
    expect(fn.mock.calls[0][1].headers.Authorization).toBe("Bearer seller-token");
  });
});

describe("mercadoPagoProvider.getChargeStatus", () => {
  it("mapeia approved → paid", async () => {
    seq([{ status: "approved" }]);
    expect(await mercadoPagoProvider.getChargeStatus(est, "987654")).toBe("paid");
  });
});

describe("OAuth", () => {
  it("monta a URL de autorização", () => {
    const url = getOAuthUrl("est_1.abc");
    expect(url).toContain("https://auth.mercadopago.com.br/authorization?");
    expect(url).toContain("client_id=app-123");
    expect(url).toContain("state=est_1.abc");
    expect(url).toContain("redirect_uri=http");
  });
  it("troca o code por tokens", async () => {
    seq([{ user_id: 555, access_token: "AT", refresh_token: "RT", public_key: "PK" }]);
    const r = await exchangeOAuthCode("the-code");
    expect(r).toEqual({ userId: "555", accessToken: "AT", refreshToken: "RT", publicKey: "PK" });
  });
  it("assina e verifica o state", () => {
    const s = signState("est_1");
    expect(verifyState(s)).toBe("est_1");
    expect(verifyState("est_1.deadbeef")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- mercadopago` → FAIL.

- [ ] **Step 3: Implementar `lib/payments/mercadopago.ts`**

```ts
import { createHmac } from "crypto";
import type { Establishment } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { PaymentProvider, PixCharge, PixChargeInput, ChargeStatus } from "./types";

const baseUrl = () => process.env.MP_BASE_URL ?? "https://api.mercadopago.com";

export class MpError extends Error {
  constructor(public status: number, public body: string) {
    super(`MP ${status}: ${body}`);
    this.name = "MpError";
  }
}

async function call<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new MpError(res.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}

function mapStatus(s: string): ChargeStatus {
  if (s === "approved" || s === "authorized") return "paid";
  if (s === "pending" || s === "in_process" || s === "in_mediation") return "pending";
  return "failed";
}

type MpToken = { user_id: number; access_token: string; refresh_token: string; public_key: string };

async function refresh(est: Establishment): Promise<string> {
  const t = await call<MpToken>("/oauth/token", "", {
    method: "POST",
    body: JSON.stringify({
      client_id: process.env.MP_CLIENT_ID,
      client_secret: process.env.MP_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: est.mpRefreshToken,
    }),
  });
  await prisma.establishment.update({
    where: { id: est.id },
    data: { mpAccessToken: t.access_token, mpRefreshToken: t.refresh_token },
  });
  return t.access_token;
}

async function withToken<T>(est: Establishment, fn: (token: string) => Promise<T>): Promise<T> {
  try {
    return await fn(est.mpAccessToken ?? "");
  } catch (e) {
    if (e instanceof MpError && e.status === 401 && est.mpRefreshToken) {
      return await fn(await refresh(est));
    }
    throw e;
  }
}

type MpPayment = {
  id: number; status: string;
  point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
};

export const mercadoPagoProvider: PaymentProvider = {
  name: "MERCADO_PAGO",
  async createPixCharge(input: PixChargeInput): Promise<PixCharge> {
    const { est, reference, total, platformFee, customerName, description } = input;
    const r = await withToken(est, (token) =>
      call<MpPayment>("/v1/payments", token, {
        method: "POST",
        headers: { "X-Idempotency-Key": reference },
        body: JSON.stringify({
          transaction_amount: total,
          description,
          payment_method_id: "pix",
          external_reference: reference,
          application_fee: platformFee,
          payer: { email: "comprador@jurandir.app", first_name: customerName || "Cliente" },
        }),
      }),
    );
    const tx = r.point_of_interaction?.transaction_data;
    return { chargeId: String(r.id), pixPayload: tx?.qr_code ?? "", pixQrImage: tx?.qr_code_base64 ?? "", status: mapStatus(r.status) };
  },
  async getChargeStatus(est: Establishment, chargeId: string): Promise<ChargeStatus> {
    const r = await withToken(est, (token) => call<MpPayment>(`/v1/payments/${chargeId}`, token));
    return mapStatus(r.status);
  },
};

export function getOAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.MP_CLIENT_ID ?? "",
    response_type: "code",
    platform_id: "mp",
    redirect_uri: process.env.MP_REDIRECT_URI ?? "",
    state,
  });
  return `https://auth.mercadopago.com.br/authorization?${p.toString()}`;
}

export async function exchangeOAuthCode(code: string): Promise<{ userId: string; accessToken: string; refreshToken: string; publicKey: string }> {
  const t = await call<MpToken>("/oauth/token", "", {
    method: "POST",
    body: JSON.stringify({
      client_id: process.env.MP_CLIENT_ID,
      client_secret: process.env.MP_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.MP_REDIRECT_URI,
    }),
  });
  return { userId: String(t.user_id), accessToken: t.access_token, refreshToken: t.refresh_token, publicKey: t.public_key };
}

/** Assina o estId no `state` do OAuth (anti-tampering). */
export function signState(estId: string): string {
  const sig = createHmac("sha256", process.env.AUTH_SECRET ?? "").update(estId).digest("hex").slice(0, 16);
  return `${estId}.${sig}`;
}
export function verifyState(state: string): string | null {
  const [estId, sig] = state.split(".");
  if (!estId || !sig) return null;
  const expected = createHmac("sha256", process.env.AUTH_SECRET ?? "").update(estId).digest("hex").slice(0, 16);
  return sig === expected ? estId : null;
}
```

- [ ] **Step 4: Verificar** — `npm test -- mercadopago` (PASS) + `npx tsc --noEmit` + `npm run lint`.

---

### Task 4: Fábrica `getProvider` + confirmação/reconciliação + orquestração no `createOrder`

**Files:**
- Create: `lib/payments/index.ts`
- Create: `lib/db/payments.ts`
- Modify: `lib/db/orders.ts`
- Test: `tests/payments/provider.test.ts`

**Interfaces:**
- Consumes: `asaasProvider`/`createSubaccount` (Task 2), `mercadoPagoProvider` (Task 3), `PaymentProvider` (Task 2), `computeTotals`/`splitToEstablishment` (Task 1).
- Produces: `getProvider(est: Establishment): PaymentProvider`; `confirmChargePaid(gatewayChargeId: string): Promise<void>`; `reconcileByChargeId(gatewayChargeId: string): Promise<void>`; `reconcileOrder(orderId: string): Promise<void>`; `createOrder` agora grava campos Pix e nasce `AWAITING_PAYMENT` quando usa gateway.

- [ ] **Step 1: Escrever o teste que falha** — `tests/payments/provider.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { getProvider } from "@/lib/payments";
import type { Establishment } from "@prisma/client";

describe("getProvider", () => {
  it("seleciona Asaas", () => {
    const est = { paymentProvider: "ASAAS" } as unknown as Establishment;
    expect(getProvider(est).name).toBe("ASAAS");
  });
  it("seleciona Mercado Pago", () => {
    const est = { paymentProvider: "MERCADO_PAGO" } as unknown as Establishment;
    expect(getProvider(est).name).toBe("MERCADO_PAGO");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- provider` → FAIL.

- [ ] **Step 3: Implementar `lib/payments/index.ts`**

```ts
import type { Establishment } from "@prisma/client";
import type { PaymentProvider } from "./types";
import { asaasProvider } from "./asaas";
import { mercadoPagoProvider } from "./mercadopago";

export function getProvider(est: Pick<Establishment, "paymentProvider">): PaymentProvider {
  return est.paymentProvider === "MERCADO_PAGO" ? mercadoPagoProvider : asaasProvider;
}

export type { PaymentProvider, PixCharge, ChargeStatus, PixChargeInput } from "./types";
```

- [ ] **Step 4: Implementar `lib/db/payments.ts`**

```ts
import { OrderStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { getProvider } from "@/lib/payments";

/** Flip idempotente do pedido para IN_PRODUCTION quando a cobrança foi paga. */
export async function confirmChargePaid(gatewayChargeId: string): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { gatewayChargeId },
    include: { order: { select: { id: true, status: true } } },
  });
  if (!payment?.order) return;
  if (payment.order.status === OrderStatus.IN_PRODUCTION || payment.order.status === OrderStatus.DELIVERED) return;
  await prisma.$transaction([
    prisma.order.update({ where: { id: payment.order.id }, data: { status: OrderStatus.IN_PRODUCTION } }),
    prisma.payment.update({ where: { id: payment.id }, data: { confirmedAt: new Date() } }),
  ]);
}

/** Consulta o gateway e confirma se pago. Usado pela reconciliação (dev) e pelo webhook do MP. */
export async function reconcileByChargeId(gatewayChargeId: string): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { gatewayChargeId },
    include: { order: { include: { establishment: true } } },
  });
  if (!payment?.order || payment.order.status !== OrderStatus.AWAITING_PAYMENT) return;
  const status = await getProvider(payment.order.establishment).getChargeStatus(payment.order.establishment, gatewayChargeId);
  if (status === "paid") await confirmChargePaid(gatewayChargeId);
}

export async function reconcileOrder(orderId: string): Promise<void> {
  const p = await prisma.payment.findFirst({ where: { orderId }, select: { gatewayChargeId: true } });
  if (p?.gatewayChargeId) await reconcileByChargeId(p.gatewayChargeId);
}
```

- [ ] **Step 5: Alterar `lib/db/orders.ts` `createOrder`** — carregar o estabelecimento completo, decidir gateway, criar a cobrança antes do `order.create` e gravar os campos Pix. Substituir o corpo de `createOrder` por:

```ts
export async function createOrder(input: OrderCreateInput) {
  const data = orderCreateSchema.parse(input);
  const est = await prisma.establishment.findUnique({ where: { id: data.establishmentId } });
  if (!est) throw new Error("establishment not found");

  const subtotal = data.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const { platformFee, serviceFee, total } = computeTotals(subtotal, est.platformFeePct, est.serviceFeePct);
  const code = await uniqueCode();

  const payment = data.payment;
  const amounts = payment.kind === "split" ? splitShares(total, payment.shares.length) : [];
  const allPaid = payment.kind === "split" ? payment.shares.every((s) => s.method !== null) : true;

  // Cobrança real: só para pagamento cheio via Pix num estabelecimento onboardado.
  const useGateway = est.paymentOnboarded && payment.kind === "full" && payment.method === "PIX";
  let pix: import("@/lib/payments").PixCharge | null = null;
  if (useGateway) {
    const { getProvider } = await import("@/lib/payments");
    pix = await getProvider(est).createPixCharge({
      est, reference: code, total, platformFee,
      customerName: data.customerName ?? undefined,
      description: `Pedido ${code}`,
    });
  }

  const status = useGateway
    ? OrderStatus.AWAITING_PAYMENT
    : allPaid ? OrderStatus.IN_PRODUCTION : OrderStatus.AWAITING_PAYMENT;

  return prisma.order.create({
    data: {
      establishment: { connect: { id: data.establishmentId } },
      code,
      status,
      locationLabel: data.locationLabel,
      posto: data.posto ?? null,
      customerName: data.customerName ?? null,
      note: data.note ?? null,
      subtotal, platformFee, serviceFee, total,
      items: { create: data.items.map((i) => ({ menuItemId: i.menuItemId ?? null, name: i.name, qty: i.qty, unitPrice: i.unitPrice })) },
      ...(payment.kind === "full"
        ? {
            payment: {
              create: {
                method: payment.method,
                installments: payment.installments,
                gatewayFeePct: new Prisma.Decimal(GATEWAY_FEE_PCT[payment.method]),
                cardMask: payment.cardMask ?? null,
                provider: pix ? est.paymentProvider : null,
                gatewayChargeId: pix?.chargeId ?? null,
                pixPayload: pix?.pixPayload ?? null,
                pixQrImage: pix?.pixQrImage ?? null,
                splitToEstablishment: pix ? new Prisma.Decimal(splitToEstablishment(total, platformFee)) : null,
              },
            },
          }
        : {
            splitShares: {
              create: payment.shares.map((s, idx) => ({
                personIndex: idx, amount: amounts[idx], method: s.method,
                paid: s.method !== null, paidAt: s.method !== null ? new Date() : null,
              })),
            },
          }),
    },
    include: ORDER_INCLUDE,
  });
}
```
Atualizar os imports do topo de `orders.ts`: adicionar `splitToEstablishment` ao import de `../domain/pricing`. (`getProvider` é importado dinamicamente para evitar ciclo `orders ↔ payments`.)

- [ ] **Step 6: Verificar** — `npm test -- provider` (PASS) + `npm test` (todos os testes anteriores seguem verdes) + `npx tsc --noEmit` + `npm run lint`.

Nota de teste: `confirmChargePaid`/`reconcile*` dependem do Prisma/Neon e não têm unit test isolado (padrão do repo — sem mock de Prisma); a verificação de runtime é a E2E deferida (Task 8-nota). Garantir só `tsc`/`lint` limpos aqui.

---

### Task 5: Campos Pix no ClientOrder + reconciliação no poll + QR no DoneScreen

**Files:**
- Modify: `lib/app/helpers.ts`
- Modify: `lib/app/adapters.ts`
- Modify: `lib/actions/app.ts`
- Modify: `components/app/screens/DoneScreen.tsx`
- Modify: `messages/pt.json`, `messages/en.json`

**Interfaces:**
- Consumes: `reconcileByChargeId` (Task 4); `ClientOrder` (existente).
- Produces: `ClientOrder.pixPayload?: string`, `ClientOrder.pixQrImage?: string`; `getMyOrdersAction` reconcilia pedidos `AWAITING_PAYMENT` com cobrança antes de retornar.

- [ ] **Step 1: `lib/app/helpers.ts`** — adicionar ao tipo `ClientOrder` (após `status`):

```ts
  pixPayload?: string;
  pixQrImage?: string;
```

- [ ] **Step 2: `lib/app/adapters.ts`** — estender o tipo `DbOrder.payment` e o retorno de `toClientOrder`:

Trocar a linha do payment no `type DbOrder`:
```ts
  payment: { method: string; installments: number; pixPayload: string | null; pixQrImage: string | null } | null;
```
E no objeto retornado por `toClientOrder`, após `pay: ...`:
```ts
    pixPayload: o.payment?.pixPayload ?? undefined,
    pixQrImage: o.payment?.pixQrImage ?? undefined,
```

- [ ] **Step 3: `lib/actions/app.ts`** — reconciliar antes de retornar. Substituir `getMyOrdersAction` por:

```ts
export async function getMyOrdersAction(ids: string[]): Promise<ClientOrder[]> {
  if (!ids.length) return [];
  let rows = await getOrdersByIds(ids);
  const awaiting = rows.filter((o) => o.status === "AWAITING_PAYMENT" && o.payment?.gatewayChargeId);
  if (awaiting.length) {
    const { reconcileByChargeId } = await import("@/lib/db/payments");
    await Promise.all(awaiting.map((o) => reconcileByChargeId(o.payment!.gatewayChargeId!).catch(() => {})));
    rows = await getOrdersByIds(ids);
  }
  return rows.map(toClientOrder);
}
```

- [ ] **Step 4: `components/app/screens/DoneScreen.tsx`** — renderizar o QR quando aguardando pagamento Pix. Inserir logo após o fechamento do card de resumo (após a linha `</div>` que fecha o bloco `rounded-2xl bg-white p-5 text-left`, antes do primeiro `<button>`):

```tsx
      {inc && L.pixPayload && (
        <div
          className="mt-5 rounded-2xl bg-white p-5 text-center"
          style={{ boxShadow: "0 4px 12px -6px rgba(12,67,71,.15)" }}
        >
          <p className="m-0 font-display text-[15px] font-bold uppercase tracking-[-0.01em]">
            {t("pixTitle")}
          </p>
          {L.pixQrImage && (
            <img
              src={`data:image/png;base64,${L.pixQrImage}`}
              alt="QR Pix"
              className="mx-auto mt-3 h-48 w-48 rounded-lg"
            />
          )}
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(L.pixPayload!)}
            className="mt-3 w-full rounded-xl bg-ink py-3 text-[14px] font-bold text-sand"
          >
            {t("pixCopy")}
          </button>
          <p className="m-0 mt-3 text-[13px] text-[#d97706]">{t("pixWaiting")}</p>
        </div>
      )}
```

- [ ] **Step 5: Adicionar as chaves em `messages/pt.json` (namespace `app`)** — junto às demais chaves `done*`:
```json
    "pixTitle": "Pague com Pix",
    "pixCopy": "Copiar código Pix",
    "pixWaiting": "Aguardando confirmação do pagamento…",
```
E em `messages/en.json` (namespace `app`):
```json
    "pixTitle": "Pay with Pix",
    "pixCopy": "Copy Pix code",
    "pixWaiting": "Waiting for payment confirmation…",
```

- [ ] **Step 6: Verificar** — `npx tsc --noEmit` + `npm run lint` + `npm test` (44+ verdes) + `node -e "require('./messages/pt.json');require('./messages/en.json')"` (JSON válido).

---

### Task 6: Onboarding (ações de admin) + UI

**Files:**
- Modify: `lib/actions/admin.ts`
- Modify: `components/admin/AdminApp.tsx` (ou o componente da seção do estabelecimento onde ficam as ações — localizar com grep `updateFeeAction`/`RegEditorModal`)
- Modify: `messages/pt.json`, `messages/en.json`

**Interfaces:**
- Consumes: `createSubaccount` (Task 2), `getOAuthUrl`/`signState` (Task 3), `assertAdmin` (existente).
- Produces: `connectAsaasAction(estId: string): Promise<{ ok: boolean; error?: string }>`; `getMpConnectUrlAction(estId: string): Promise<{ ok: boolean; url?: string }>`.

- [ ] **Step 1: `lib/actions/admin.ts`** — adicionar os imports e as duas ações ao final do arquivo:

```ts
import { createSubaccount } from "@/lib/payments/asaas";
import { getOAuthUrl, signState } from "@/lib/payments/mercadopago";

export async function connectAsaasAction(estId: string): Promise<{ ok: boolean; error?: string }> {
  await assertAdmin();
  const est = await prisma.establishment.findUnique({ where: { id: estId } });
  if (!est) return { ok: false, error: "notfound" };
  if (!est.ownerCpfCnpj) return { ok: false, error: "cpf" };
  try {
    const { accountId, walletId } = await createSubaccount(est);
    await prisma.establishment.update({
      where: { id: estId },
      data: { paymentProvider: "ASAAS", asaasAccountId: accountId, asaasWalletId: walletId, paymentOnboarded: true },
    });
    revalidatePath("/admin");
    return { ok: true };
  } catch {
    return { ok: false, error: "gateway" };
  }
}

export async function getMpConnectUrlAction(estId: string): Promise<{ ok: boolean; url?: string }> {
  await assertAdmin();
  const est = await prisma.establishment.findUnique({ where: { id: estId }, select: { id: true } });
  if (!est) return { ok: false };
  return { ok: true, url: getOAuthUrl(signState(est.id)) };
}
```

- [ ] **Step 2: Localizar a seção do estabelecimento no admin** — `grep -rn "updateFeeAction\|RegEditorModal" components/admin`. Nessa seção, adicionar um botão "Conectar pagamentos" por estabelecimento que: se `est.paymentOnboarded`, mostra o badge `{t("payActive")}`; senão, um botão que chama `connectAsaasAction(id)` (provider Asaas) ou, para MP, chama `getMpConnectUrlAction(id)` e faz `window.location.href = url`. Como as props do admin vêm de `toAdminEst`, incluir `paymentProvider` e `paymentOnboarded` no adapter `toAdminEst` (em `lib/admin/adapters.ts`) e no tipo `AdminEst`.

Exemplo do handler (client) na seção:
```tsx
const connectAsaas = async (id: string) => {
  const r = await connectAsaasAction(id);
  if (!r.ok) toast(r.error === "cpf" ? t("payNeedCpf") : t("payConnectError"));
  else toast(t("payConnected"));
};
const connectMp = async (id: string) => {
  const r = await getMpConnectUrlAction(id);
  if (r.ok && r.url) window.location.href = r.url;
  else toast(t("payConnectError"));
};
```
Botão:
```tsx
{est.paymentOnboarded ? (
  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{t("payActive")}</span>
) : (
  <button type="button" onClick={() => (est.paymentProvider === "MERCADO_PAGO" ? connectMp(est.id) : connectAsaas(est.id))} className="rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-sand">
    {t("payConnect")}
  </button>
)}
```
(Se o admin não tiver sistema de toast, usar o mesmo mecanismo de feedback já presente na tela — reaproveitar o padrão existente de erro/sucesso do `saveReg`.)

- [ ] **Step 3: `lib/admin/adapters.ts`** — no `toAdminEst`, incluir `paymentProvider: e.paymentProvider` e `paymentOnboarded: e.paymentOnboarded`; adicionar ambos ao tipo `AdminEst` (e ao `select`/tipo de origem se houver).

- [ ] **Step 4: Mensagens** — adicionar em `messages/pt.json` e `messages/en.json` no namespace `admin` (ou o namespace usado pela seção): `payConnect`/`payActive`/`payConnected`/`payConnectError`/`payNeedCpf`. PT: "Conectar pagamentos"/"Pagamentos ativos"/"Pagamentos conectados"/"Falha ao conectar pagamentos"/"Informe o CPF/CNPJ do estabelecimento primeiro". EN equivalentes.

- [ ] **Step 5: Verificar** — `npx tsc --noEmit` + `npm run lint` + `npm test` + JSON válido.

---

### Task 7: Route handlers — webhooks + callback OAuth + env

**Files:**
- Create: `app/api/webhooks/asaas/route.ts`
- Create: `app/api/webhooks/mercadopago/route.ts`
- Create: `app/api/payments/mercadopago/callback/route.ts`
- Modify: `.env`

**Interfaces:**
- Consumes: `confirmChargePaid`/`reconcileByChargeId` (Task 4), `exchangeOAuthCode`/`verifyState` (Task 3).

- [ ] **Step 1: `.env`** — adicionar (placeholders; o usuário preenche as chaves):
```
ASAAS_API_KEY=
ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=troque-por-um-segredo
MP_CLIENT_ID=
MP_CLIENT_SECRET=
MP_BASE_URL=https://api.mercadopago.com
MP_REDIRECT_URI=http://localhost:3000/api/payments/mercadopago/callback
MP_WEBHOOK_SECRET=
```

- [ ] **Step 2: `app/api/webhooks/asaas/route.ts`**
```ts
import { confirmChargePaid } from "@/lib/db/payments";

export async function POST(req: Request): Promise<Response> {
  if (req.headers.get("asaas-access-token") !== process.env.ASAAS_WEBHOOK_TOKEN) {
    return new Response("unauthorized", { status: 401 });
  }
  try {
    const body = await req.json();
    const event: string = body?.event;
    const chargeId: string | undefined = body?.payment?.id;
    if (chargeId && (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED")) {
      await confirmChargePaid(chargeId);
    }
  } catch {
    /* corpo inválido — ignora; o Asaas reentrega se não for 2xx, então respondemos 200 assim mesmo */
  }
  return new Response("ok", { status: 200 });
}
```

- [ ] **Step 3: `app/api/webhooks/mercadopago/route.ts`** — a confirmação é autoritativa via `reconcileByChargeId` (re-consulta o MP); assinatura opcional se `MP_WEBHOOK_SECRET` estiver setado.
```ts
import { createHmac } from "crypto";
import { reconcileByChargeId } from "@/lib/db/payments";

function signatureOk(req: Request, dataId: string): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return true; // sem segredo configurado, confiamos no re-fetch autoritativo
  const sig = req.headers.get("x-signature") ?? "";
  const reqId = req.headers.get("x-request-id") ?? "";
  const parts = Object.fromEntries(sig.split(",").map((kv) => kv.split("=").map((s) => s.trim())));
  const ts = parts["ts"]; const v1 = parts["v1"];
  if (!ts || !v1) return false;
  const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;
  const hmac = createHmac("sha256", secret).update(manifest).digest("hex");
  return hmac === v1;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const type = (body as { type?: string }).type ?? url.searchParams.get("type");
    const id = (body as { data?: { id?: string } }).data?.id ?? url.searchParams.get("data.id");
    if (type === "payment" && id && signatureOk(req, String(id))) {
      await reconcileByChargeId(String(id));
    }
  } catch {
    /* ignora corpo inválido */
  }
  return new Response("ok", { status: 200 });
}
```

- [ ] **Step 4: `app/api/payments/mercadopago/callback/route.ts`**
```ts
import { prisma } from "@/lib/db/prisma";
import { exchangeOAuthCode, verifyState } from "@/lib/payments/mercadopago";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const estId = state ? verifyState(state) : null;
  const back = (q: string) => Response.redirect(new URL(`/admin?mp=${q}`, req.url), 303);
  if (!code || !estId) return back("error");
  try {
    const t = await exchangeOAuthCode(code);
    await prisma.establishment.update({
      where: { id: estId },
      data: {
        paymentProvider: "MERCADO_PAGO",
        mpUserId: t.userId, mpAccessToken: t.accessToken, mpRefreshToken: t.refreshToken, mpPublicKey: t.publicKey,
        paymentOnboarded: true,
      },
    });
    return back("ok");
  } catch {
    return back("error");
  }
}
```

- [ ] **Step 5: Verificar** — `npx tsc --noEmit` + `npm run lint` + `npm test`. (Não rodar `build`.)

---

## E2E deferida (quando as chaves de sandbox chegarem)

Não é uma task do plano (bloqueada por credenciais). Roteiro para o controller executar depois:
1. Preencher `.env` (Asaas API Key / MP Client ID+Secret) + configurar webhook no painel de cada gateway.
2. Onboardar um estabelecimento por provider (Asaas: `connectAsaasAction` com `ownerCpfCnpj` de sandbox; MP: fluxo OAuth via botão → callback).
3. App: pedido Pix (pagamento cheio) → QR renderizado na DoneScreen.
4. Simular pagamento no sandbox (MP: test users; Asaas: painel/simulação).
5. Confirmar que o poll de 5s promove o pedido para "em produção" (reconciliação) e/ou o webhook o faz, e que ele aparece pago no painel do estabelecimento.

## Self-Review (checklist do writing-plans)

**1. Cobertura da spec:** abstração (Task 2/4) ✓; schema (Task 1) ✓; Asaas (Task 2) ✓; Mercado Pago + OAuth (Task 3) ✓; split math (Task 1) ✓; createOrder seam + AWAITING_PAYMENT (Task 4) ✓; confirm/reconcile (Task 4) ✓; QR na DoneScreen + poll reconcile (Task 5) ✓; onboarding admin (Task 6) ✓; webhooks + callback + env (Task 7) ✓; fallback simulado (Task 4, `useGateway`) ✓; testes fetch-mock (Tasks 2/3/4) + E2E deferida ✓.

**2. Placeholders:** nenhum "TBD"; textos e chaves de mensagens são valores concretos; os únicos vazios são as chaves de `.env` (por design, vêm do usuário).

**3. Consistência de tipos:** `PixCharge`/`PixChargeInput`/`ChargeStatus` definidos na Task 2 e usados igual nas Tasks 3/4; `getProvider` recebe `Pick<Establishment,"paymentProvider">` (compatível com o `est` completo passado no `createOrder` e no `reconcileByChargeId`); `gatewayChargeId` é a chave única usada por `confirmChargePaid`/`reconcileByChargeId`/webhooks; `reference = order.code` consistente entre `createOrder` e os providers.
