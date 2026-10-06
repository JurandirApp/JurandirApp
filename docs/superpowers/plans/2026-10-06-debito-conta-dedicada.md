# Débito Pagar.me em Conta Dedicada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Todo o débito Pagar.me é cobrado numa conta Pagar.me dedicada do Jurandir (conta B), **sem split**; o app tokeniza o débito com a chave pública da conta B; e o admin tem um relatório de quanto repassar (via Pix) pra cada bar.

**Architecture:** Débito Pagar.me usa `PAGARME_DEBIT_SECRET_KEY` (conta B) no backend e `PAGARME_DEBIT_PUBLIC_KEY` no app, sem split. Crédito/Pix seguem na conta principal com split (inalterado). Status/reconciliação do débito usam a chave B (via `Payment.method`). Relatório deriva dos pedidos de débito pagos (sem schema novo).

**Tech Stack:** Next.js 16 + Prisma (backend), Flutter + Dio (app), vitest (teste do provider).

**Spec:** `docs/superpowers/specs/2026-10-06-debito-conta-dedicada-design.md`

## Global Constraints
- **Next.js 16** — ler `node_modules/next/dist/docs/` antes de API/rota se precisar.
- **Pagar.me-only:** o tratamento especial de débito (conta B, sem split, pk_B) só vale pra débito **Pagar.me**. Crédito/Pix e outros gateways: **inalterados**.
- **Guardas:** débito Pagar.me sem a chave da conta B configurada → erro claro, NUNCA cobra na conta errada. Débito **nunca** manda split.
- **Convenção de env** (já existe): produção = nome sem sufixo; teste = `_TEST`. Resolver por `envByMode` (segue `pagarmeMode`).
- `PAGARME_SECRET_KEY`/token SÓ no backend; `pk_` pode ir no app.
- DB I/O não é unit-testado; o provider Pagar.me (pagarme.ts) TEM teste (`tests/payments/pagarme.test.ts`, mocka fetch) — adicionar caso de débito lá.
- Commits pt-BR `feat(debito): ...` com a linha de co-autoria do seu ambiente.

## Review Focus
- **Débito manda split por engano** (regressão): o débito Pagar.me NÃO pode ter `split` no payload → Task 1 (teste verifica ausência de split).
- **Débito cobra na conta errada** (chave A em vez de B): a cobrança/status/reconcile do débito tem que usar a chave B → Task 1 (auth header) + Task 2 (status).
- **Crédito/Pix quebram** (a mudança de `call`/`authHeader`/split vaza pro crédito): crédito/Pix continuam com chave A + split → Task 1 (teste do crédito segue passando).
- **Chave B ausente** → erro claro, não cobra: Task 1 (guarda backend) + Task 4 (guarda app).
- **Relatório conta pedido não-pago ou de outro gateway**: filtrar `method=DEBIT, provider=PAGARME, confirmedAt != null` → Task 3.

---

## Task 1: Backend — seleção de chave (conta B) + cobrança de débito sem split

**Files:**
- Modify: `lib/payments/pagarme.ts`
- Test: `tests/payments/pagarme.test.ts`

**Interfaces:**
- Produces: `debitSecretKey(): string`; `call(path, init?, keyOverride?)`; `authHeader(key?)`. `createCardTokenPayment` passa a cobrar débito na conta B sem split.

- [ ] **Step 1: `authHeader` + `call` aceitam chave override.** Em `pagarme.ts`:
```ts
function authHeader(key?: string): string {
  return "Basic " + Buffer.from(`${key ?? secretKey()}:`).toString("base64");
}
```
e em `call` (atualmente linha ~126), adicionar o 3º parâmetro:
```ts
async function call<T>(path: string, init?: RequestInit, keyOverride?: string): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: authHeader(keyOverride), ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new PagarmeError(res.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}
```

- [ ] **Step 2: `debitSecretKey()`** (perto de `secretKey()`):
```ts
const debitSecretKey = () => envByMode("PAGARME_DEBIT_SECRET_KEY");
```

- [ ] **Step 3: débito sem split + chave B em `createCardTokenPayment`.** Hoje o `payments[0]` tem `split: buildSplit(...)` SEMPRE (linha ~367) e o `call` usa a chave global (linha ~371). Mudar pra: débito → sem split + chave B (com guarda); crédito → igual.
```ts
    if (isDebit && !debitSecretKey()) {
      throw new PagarmeError(500, "conta de débito Pagar.me não configurada (PAGARME_DEBIT_SECRET_KEY)");
    }
    const body = {
      code: reference,
      items: [{ amount: totalCents, description, quantity: 1, code: reference }],
      customer: buildCustomer(reference, { name: customerName, document: customerDocument, phone: customerPhone }),
      payments: [
        {
          payment_method: isDebit ? "debit_card" : "credit_card",
          [isDebit ? "debit_card" : "credit_card"]: cardObj,
          // Débito NÃO tem split na Pagar.me → cai inteiro na conta B.
          ...(isDebit ? {} : { split: buildSplit(est, totalCents, cents(platformFee)) }),
        },
      ],
    };
    const order = await call<PgOrder>(
      "/orders",
      { method: "POST", body: JSON.stringify(body) },
      isDebit ? debitSecretKey() : undefined,
    );
```
(Manter o resto da função igual.)

- [ ] **Step 4: teste.** Em `tests/payments/pagarme.test.ts`, seguindo o padrão existente (mock de fetch que captura o body + headers), adicionar um teste: cobrança de **débito** →
  - o body do POST `/orders` **não** tem `split` no `payments[0]`;
  - o header `Authorization` usa a chave de débito (setar `process.env.PAGARME_DEBIT_SECRET_KEY` no teste e checar o Basic base64);
  - e um teste que crédito CONTINUA com `split` e com a chave principal.
  (Olhar como os testes atuais capturam o request — reutilizar o mesmo mock/helper.)

- [ ] **Step 5: tsc + vitest.**
Run: `cd "d:/Projetos 2.0/Jurandir/jurandir" && npx tsc --noEmit && npx vitest run tests/payments/pagarme.test.ts`
Expected: tsc sem erro; testes de pagarme verdes (os novos + os antigos).

- [ ] **Step 6: commit.**
```bash
git add lib/payments/pagarme.ts tests/payments/pagarme.test.ts
git commit -m "feat(debito): débito Pagar.me cobra na conta dedicada (chave B) sem split

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Backend — status/reconciliação do débito na conta B

**Files:**
- Modify: `lib/payments/types.ts` (assinatura `getChargeStatus`), `lib/payments/pagarme.ts` (impl), os outros providers (`pagbank.ts`, `mercadopago.ts`, `asaas.ts`, `appmax.ts` — param opcional ignorado), `lib/db/payments.ts` (callers passam `{debit}`).

**Interfaces:**
- Consumes: `debitSecretKey()` (Task 1).
- Produces: `getChargeStatus(est, chargeId, opts?: { debit?: boolean })` — Pagar.me usa chave B quando `opts.debit`.

- [ ] **Step 1: interface.** Em `lib/payments/types.ts`, mudar a assinatura do método `getChargeStatus` da interface `PaymentProvider` pra incluir o 3º parâmetro opcional `opts?: { debit?: boolean }`.

- [ ] **Step 2: Pagar.me impl** (`pagarme.ts:409`):
```ts
  async getChargeStatus(_est: Establishment, chargeId: string, opts?: { debit?: boolean }): Promise<ChargeStatus> {
    await ensurePagarmeMode();
    const c = await call<PgCharge>(`/charges/${chargeId}`, undefined, opts?.debit ? debitSecretKey() : undefined);
    return mapStatus(c.status);
  },
```

- [ ] **Step 3: outros providers.** Nos demais (`pagbank.ts`, `mercadopago.ts`, `asaas.ts`, `appmax.ts`), adicionar o param opcional `_opts?: { debit?: boolean }` na assinatura do `getChargeStatus` (ignorado) só pra casar a interface. (Se o TS aceitar a interface com o param opcional sem tocar nos outros — por serem optional — confirmar com `tsc`; se reclamar, adicionar o param.)

- [ ] **Step 4: callers em `lib/db/payments.ts`.** Nos 2 pontos que chamam `getChargeStatus` (linhas ~48 e ~144), quando o provider for `PAGARME`, passar `{ debit: <payment>.method === "DEBIT" }`. Ler o código pra pegar o nome exato do objeto que tem o `method` (ex.: `payment.method` / `sh.method`). Ex.:
```ts
    const status = await getProviderByName(payment.provider ?? "MERCADO_PAGO").getChargeStatus(
      est, chargeId, { debit: payment.method === "DEBIT" },
    );
```
(Passar `{debit}` nos dois callers; os providers que não usam ignoram.)

- [ ] **Step 5: tsc + vitest (suite inteira, garante que nada quebrou).**
Run: `npx tsc --noEmit && npx vitest run tests/payments`
Expected: sem erro; pagamentos verdes.

- [ ] **Step 6: commit.**
```bash
git add lib/payments lib/db/payments.ts
git commit -m "feat(debito): status/reconciliação do débito Pagar.me usa a conta dedicada

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Backend — relatório de repasse de débito (admin)

**Files:**
- Create/Modify: `lib/db/admin.ts` (ou `lib/db/panel.ts`) — função de agregação; `lib/actions/admin.ts` — server action; uma seção admin em `components/admin/sections/` (ex.: `RepasseDebitoSection.tsx`) + registrar no admin.

**Interfaces:**
- Produces: `listDebitPayout(from: Date, to: Date): Promise<Array<{ establishmentId, nome, qtd, bruto, taxa, aRepassar }>>` e `listDebitPayoutAction(period)`.

- [ ] **Step 1: agregação (db).** Função que soma por estabelecimento os pedidos de débito Pagar.me pagos no período:
```ts
export async function listDebitPayout(from: Date, to: Date) {
  const rows = await prisma.payment.findMany({
    where: { method: "DEBIT", provider: "PAGARME", confirmedAt: { not: null, gte: from, lte: to } },
    select: {
      splitToEstablishment: true,
      order: { select: { total: true, platformFee: true, establishmentId: true, establishment: { select: { name: true } } } },
    },
  });
  const byEst = new Map<string, { establishmentId: string; nome: string; qtd: number; bruto: number; taxa: number; aRepassar: number }>();
  for (const r of rows) {
    const o = r.order; if (!o) continue;
    const cur = byEst.get(o.establishmentId) ?? { establishmentId: o.establishmentId, nome: o.establishment?.name ?? "", qtd: 0, bruto: 0, taxa: 0, aRepassar: 0 };
    cur.qtd += 1;
    cur.bruto += Number(o.total);
    cur.taxa += Number(o.platformFee);
    cur.aRepassar += Number(r.splitToEstablishment ?? (Number(o.total) - Number(o.platformFee)));
    byEst.set(o.establishmentId, cur);
  }
  return [...byEst.values()].sort((a, b) => b.aRepassar - a.aRepassar);
}
```
(Confirmar os nomes/decimais exatos dos campos no `schema.prisma`: `Order.total/platformFee` Decimal, `Payment.splitToEstablishment` Decimal — usar `Number(...)`.)

- [ ] **Step 2: server action.** Em `lib/actions/admin.ts` (seguindo o padrão de auth ADMIN já usado lá — ler um action existente): `listDebitPayoutAction(period: "hoje"|"7d"|"30d"|"tudo")` → checa sessão ADMIN → resolve o range (reusar o helper de período do admin se houver) → `return listDebitPayout(from, to)`.

- [ ] **Step 3: UI admin.** Nova seção `components/admin/sections/RepasseDebitoSection.tsx` (seguindo o estilo das outras seções): seletor de período + tabela **Bar | Qtd | Bruto | Taxa Jurandir | A repassar (Pix)**. Registrar a seção na navegação do admin (ver como `FaturamentoSection`/`TaxasSection` são registradas em `components/admin/` — o app shell do admin). Read-only (sem disparar Pix).

- [ ] **Step 4: tsc + commit.**
Run: `npx tsc --noEmit` → sem erro.
```bash
git add lib/db lib/actions/admin.ts components/admin
git commit -m "feat(debito): relatório de repasse de débito por bar no admin

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: App — tokenização do débito com a chave da conta B

**Files:**
- Modify: `jurandir-app/lib/core/payments/card_tokenizer.dart`, o caller (`card_sheet.dart`), e os dart_defines de produção.

**Interfaces:**
- Consumes: nada novo.
- Produces: `tokenizeCard({ ..., bool debit = false })` que usa `PAGARME_DEBIT_PUBLIC_KEY` quando `debit`.

- [ ] **Step 1: `card_tokenizer.dart`.** Adicionar a chave de débito e selecionar por método:
```dart
const _publicKey = String.fromEnvironment('PAGARME_PUBLIC_KEY', defaultValue: '');
const _debitPublicKey = String.fromEnvironment('PAGARME_DEBIT_PUBLIC_KEY', defaultValue: '');

bool get pagarmeCardConfigured => _publicKey.isNotEmpty;
bool get pagarmeDebitConfigured => _debitPublicKey.isNotEmpty;

Future<String?> tokenizeCard({
  required String number,
  required String holderName,
  required int expMonth,
  required int expYear,
  required String cvv,
  bool debit = false,
}) async {
  final pk = debit ? _debitPublicKey : _publicKey;
  if (pk.isEmpty) return null;
  // ... resto igual, trocando queryParameters: {'appId': pk}
}
```
(Trocar `_publicKey` por `pk` no corpo.)

- [ ] **Step 2: caller `card_sheet.dart`.** Ler o arquivo: o `showCardSheet(..., debit: ...)` já sabe se é débito. Passar `debit: <isDebit>` pra `tokenizeCard(...)`. Confirmar o nome da flag de débito no card_sheet e repassar.

- [ ] **Step 3: dart_defines.** Adicionar `PAGARME_DEBIT_PUBLIC_KEY` nos arquivos de dart_define de produção (ex.: `dart_defines.prod.json`) com placeholder/valor (o usuário coloca a `pk_` real da conta B). Anotar no report que o valor real é do usuário.

- [ ] **Step 4: analyze + commit.**
Run: `cd "d:/Projetos 2.0/Jurandir/jurandir-app" && flutter analyze lib/core/payments/card_tokenizer.dart lib/features/checkout`
Expected: No issues.
```bash
git add lib/core/payments/card_tokenizer.dart lib/features/checkout dart_defines.prod.json
git commit -m "feat(debito): app tokeniza débito com a chave pública da conta dedicada

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review
- **Cobertura do spec:** conta B (chave) + débito sem split (Task 1) ✅; status/reconcile na conta B (Task 2) ✅; relatório (Task 3) ✅; app pk_B (Task 4) ✅; Pagar.me-only + guardas (Tasks 1/4) ✅; webhook reusa reconcile (Task 2, sem mudança estrutural) ✅. Sem schema change ✅.
- **Placeholders:** nenhum — código real em cada passo; pontos "confirmar nome exato" são verificações de símbolo existente.
- **Consistência de tipos:** `getChargeStatus(est, chargeId, opts?)` (Task 2) usado igual nos callers; `debitSecretKey`/`call(keyOverride)` (Task 1) usados na Task 2.
- **Review Focus:** split no débito (Task 1 teste); conta errada (Task 1/2); crédito/Pix intactos (Task 1 teste de crédito); chave ausente (guardas); relatório filtra pagos/Pagar.me (Task 3).
- **3DS:** fora do escopo (pré-requisito de negócio; anotado no spec/riscos).
