# Débito PagBank com 3DS — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cliente paga débito via PagBank dentro do app, com autenticação 3DS do banco numa WebView, sem split, atrás de uma chave geral no admin.

**Architecture:** Backend (Next.js) ganha: chave `pagbankDebitEnabled`, cobrança `DEBIT_CARD` com `authentication_method THREEDS`, endpoint que cria a sessão 3DS, e uma página HTML (nosso HTTPS) que roda o SDK JS do PagBank. O app (Flutter) abre essa página numa WebView, injeta os dados via JS, recebe o resultado por canal JS e cobra com o id do 3DS. Relatório de repasse passa a incluir débito PagBank.

**Tech Stack:** Next.js 16 + Prisma + Vitest (`jurandir`); Flutter/Dart 3.12 + Riverpod + Dio + `webview_flutter` (`jurandir-app`).

**Spec:** `docs/superpowers/specs/2026-10-16-pagbank-debito-3ds-design.md` (ler junto — contrato do PagBank está lá).

## Global Constraints

- Dados crus do cartão (número/CVV) **nunca** vão pro nosso backend nem pra log (app, página ou servidor).
- `DEBIT_CARD` **nunca** leva `splits` nem `liable`.
- `amount` do 3DS = `amount` da cobrança = `Math.round(Number(order.total) * 100)`; `installments` = 1 nos dois.
- Chave geral `pagbankDebitEnabled` **default false**. Desligada ⇒ PagBank não selecionável no Débito e sessão 3DS recusada.
- Backend: trabalhar na branch `feat/pagbank-debito-3ds` (já criada). `main` = produção — **nada de push/merge sem OK do usuário**. App: criar branch `feat/pagbank-debito-3ds` a partir de `master`; push é sempre do usuário.
- Instalações: o C: da máquina está cheio — **o usuário roda** `flutter pub add …` e `npx prisma db push` (entregar o comando exato e esperar). Se tentar e der ENOSPC, parar e pedir.
- Textos para o cliente em português, no tom do checkout atual.
- Verificação backend: `npx vitest run` e `npx tsc --noEmit` (ignorar a falha pré-existente `tests/payments/pagarme.test.ts` "sem recebedor do estabelecimento → erro"). App: `flutter analyze` e `flutter test`.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **App antigo** (sem `authenticationId`) cobrando débito PagBank → recusa limpa **sem chamar o PagBank** (teste na Task 3).
2. **Total com centavos** (ex.: R$ 10,05) → sessão devolve `amount: 1005` e a cobrança manda `1005` (teste na Task 4).
3. **Bar com conta Connect** (`pagbankAccountId`) pagando débito → cobrança sem `splits` (teste na Task 3).
4. **Retentativa** depois de cobrança já feita (pedido com `gatewayChargeId`) → sessão 3DS recusa `notChargeable`, nada de cobrar duas vezes (teste na Task 4).
5. **Chave desligada depois de bar já ter escolhido PagBank no débito** → sessão recusa `disabled`; o app mostra "Débito indisponível no momento" (teste automatizado na Task 4; no app, Task 10 passo 5).
6. **CEP sem logradouro** → `billingAddress.street` não vai vazio (teste na Task 8).

---

## Backend (`D:\Projetos 2.0\Jurandir\jurandir`)

### Task 1: Chave geral + capacidade PagBank débito

**Files:**
- Modify: `prisma/schema.prisma:457-464` (model `AppSetting`)
- Modify: `lib/db/settings.ts`
- Modify: `lib/payments/capabilities.ts`
- Test: `tests/payments/provider.test.ts`

**Interfaces:**
- Produces:
  - `AppSetting.pagbankDebitEnabled Boolean @default(false)`
  - `getPagbankDebitEnabled(): Promise<boolean>`, `setPagbankDebitEnabled(on: boolean): Promise<void>` em `lib/db/settings.ts` (mesmo padrão upsert do `setPagbankMode`)
  - `GatewayReadiness` ganha `pagbankDebitEnabled?: boolean`
  - `gatewayImplements(gateway: string, key: RouteKey, flags?: { pagbankDebitEnabled?: boolean }): boolean`
  - `canCharge(est, key, gateway)` passa a ser `gatewayImplements(gateway, key, est) && isGatewayReady(est, gateway)`
  - `GATEWAY_CAP.PAGBANK.debit = true` (atualizar o comentário da linha 20: débito com 3DS, sem split, atrás da chave geral)

- [ ] **Step 1: Testes que falham** em `tests/payments/provider.test.ts`:
  - `gatewayImplements("PAGBANK", "debit")` → `false`; `gatewayImplements("PAGBANK", "debit", { pagbankDebitEnabled: true })` → `true`; `gatewayImplements("PAGBANK", "credit")` → `true`; `gatewayImplements("PAGARME", "debit")` → `true`.
  - `canCharge({ pagarmeRecipientId: null }, "debit", "PAGBANK")` → `false`; `canCharge({ pagarmeRecipientId: null, pagbankDebitEnabled: true }, "debit", "PAGBANK")` → `true`.
- [ ] **Step 2:** `npx vitest run tests/payments/provider.test.ts` → FAIL (`gatewayImplements` não existe).
- [ ] **Step 3:** Implementar schema, settings e capabilities conforme Interfaces.
- [ ] **Step 4:** `npx vitest run tests/payments/provider.test.ts` → PASS; `npx tsc --noEmit` → 0 erros (o Prisma client precisa do `npx prisma generate` — local, não mexe no banco).
- [ ] **Step 5: Pedir ao usuário** `npx prisma db push` (aditivo: só cria a coluna). Esperar confirmação antes de qualquer coisa que leia a coluna em runtime.
- [ ] **Step 6: Commit** `feat(pagbank): chave geral do debito PagBank (default off) + capacidade`.

### Task 2: Chave no admin + painel respeitando a chave

**Files:**
- Modify: `lib/actions/admin.ts` (perto de `setPagbankModeAction`, L236-256)
- Modify: `app/[locale]/admin/page.tsx` (já lê `getAppSettings()` na L51), `components/admin/AdminApp.tsx`, `components/admin/context.tsx`, `components/admin/sections/PagamentosSection.tsx`
- Modify: `lib/actions/panel.ts:153-182` (`savePaymentRoutingAction`)
- Modify: `app/[locale]/painel/page.tsx:~119`, `components/panel/PanelApp.tsx`, `components/panel/context.tsx`, `components/panel/sections/PaymentsManager.tsx:72`
- Modify: `messages/pt.json`, `messages/en.json` (`admin.pagamentos.*`)

**Interfaces:**
- Consumes: `getPagbankDebitEnabled`, `setPagbankDebitEnabled`, `gatewayImplements` (Task 1).
- Produces:
  - `setPagbankDebitEnabledAction(on: boolean): Promise<{ ok: boolean; enabled: boolean }>` (`assertAdmin`, `revalidatePath("/admin")`)
  - Admin context: `pagbankDebitEnabled: boolean`, `setPagbankDebitEnabled(on: boolean): void` (otimista com rollback em erro, igual `setPagbankMode` no `AdminApp.tsx:~105`)
  - Panel context: `pagbankDebitEnabled: boolean` (prop vinda de `getAppSettings()` na page do painel)

- [ ] **Step 1:** `savePaymentRoutingAction`: `readiness` passa a incluir `pagbankDebitEnabled: await getPagbankDebitEnabled()`.
- [ ] **Step 2:** `PaymentsManager`: `const impl = gatewayImplements(g.id, m.key, { pagbankDebitEnabled })` no lugar de `GATEWAY_CAP[g.id][m.key]`.
- [ ] **Step 3:** `PagamentosSection`: card "Débito PagBank (3DS)" com Ligado/Desligado, abaixo dos dois cards de ambiente. Textos (pt): título `"Débito PagBank (3DS)"`; descrição `"Deixe DESLIGADO até o app novo (com a confirmação do banco) estar na Play Store e na App Store. Com ele desligado, nenhum bar consegue escolher PagBank no débito."`; botões `"Ligado"`/`"Desligado"`. Inglês equivalente.
- [ ] **Step 4:** `npx tsc --noEmit` → 0 erros; `npx eslint components/admin components/panel lib/actions` → sem erros novos.
- [ ] **Step 5: Commit** `feat(admin): liga/desliga do debito PagBank; painel respeita a chave`.

### Task 3: Cobrança `DEBIT_CARD` com 3DS (provider + rota de cartão)

**Files:**
- Modify: `lib/payments/types.ts:73-88` (`CardTokenPaymentInput`)
- Modify: `lib/payments/pagbank.ts` (cabeçalho L19-20; `buildCustomer` L133 → `export`; `createOrder` L205/L217; `createCardTokenPayment` L285-304)
- Modify: `lib/db/payments.ts:234-276` (`payOrderWithCardToken`)
- Modify: `app/api/public/orders/card/route.ts`
- Test: `tests/payments/pagbank.test.ts` (substituir o teste L133-147 "débito é recusado (PagBank exige 3DS)")

**Interfaces:**
- Produces:
  - `CardTokenPaymentInput.authenticationId?: string`
  - `payOrderWithCardToken(orderId, cardToken, installments, method, customerDocument?, billing?, authenticationId?: string)`
  - `POST /api/public/orders/card` aceita `authenticationId?: string` (string não-vazia, senão ignora) e repassa.
  - `export function buildCustomer(reference: string, opts?: { name?: string; document?: string; phone?: string })` (sem mudar o corpo)

- [ ] **Step 1: Testes que falham** (`describe("pagbankProvider.createCardTokenPayment")`):
  - `"débito com 3DS: DEBIT_CARD + authentication_method, sem split mesmo com conta Connect"` — `est` com `pagbankAccountId: "ACCO_bar"`, `method: "debit"`, `authenticationId: "3DS_ABC"`, `cardToken: "ENC"`, `total: 20`, `platformFee: 1.6`; resposta mock `{ charges: [{ id: "CHAR_1", status: "PAID" }] }`. Asserções: `charges[0].payment_method` `toMatchObject({ type: "DEBIT_CARD", installments: 1, capture: true, card: { encrypted: "ENC" }, authentication_method: { type: "THREEDS", id: "3DS_ABC" } })`; `charges[0].splits` `toBeUndefined()`; resultado `{ chargeId: "CHAR_1", status: "paid" }`.
  - `"débito sem authenticationId é recusado sem chamar o PagBank"` — `rejects.toThrow(/3DS/)` e `fetch` mock com `toHaveBeenCalledTimes(0)`.
- [ ] **Step 2:** `npx vitest run tests/payments/pagbank.test.ts` → FAIL.
- [ ] **Step 3:** Implementar: débito sem `authenticationId` → `throw new PagbankError(422, "débito PagBank exige autenticação 3DS (authenticationId)")`; com ele → `payment_method` `{ type: "DEBIT_CARD", installments: 1, capture: true, card: { encrypted, store: false, holder: { name, tax_id } }, authentication_method: { type: "THREEDS", id } }`. Em `createOrder`, `splits` só quando `paymentMethod.type !== "DEBIT_CARD"`. Atualizar o cabeçalho (débito suportado com 3DS do SDK JS, sem split). Plumbing de `authenticationId` em types → `payOrderWithCardToken` → rota.
- [ ] **Step 4:** `npx vitest run tests/payments/pagbank.test.ts` → PASS; `npx tsc --noEmit` → 0 erros.
- [ ] **Step 5: Commit** `feat(pagbank): cobranca de debito com 3DS (sem split)`.

### Task 4: Sessão 3DS (`POST /api/public/pagbank/3ds-session`)

**Files:**
- Modify: `lib/payments/pagbank.ts` (nova função, perto de `getCardPublicKey`)
- Create: `lib/payments/threeds.ts` (puro, sem Prisma)
- Create: `app/api/public/pagbank/3ds-session/route.ts` (CORS igual às outras `/api/public`)
- Test: `tests/payments/pagbank.test.ts`, Create `tests/payments/threeds.test.ts`

**Interfaces:**
- Produces:
  - `createThreeDsSession(): Promise<{ session: string; expiresAt: number; env: "PROD" | "SANDBOX" }>` — chama `ensurePagbankMode()`; `POST {sdkBase}/checkout-sdk/sessions` com `Authorization: Bearer <token>`, sem body; `sdkBase` = PRODUCTION `https://sdk.pagseguro.com`, TEST `https://sandbox.sdk.pagseguro.com`; mapeia `{ session, expires_at }`.
  - `type ThreeDsOrderView = { status: OrderStatus; method: string | null; provider: string | null; hasGatewayCharge: boolean } | null`
  - `decideThreeDsSession(o: ThreeDsOrderView, enabled: boolean): "ok" | "disabled" | "notfound" | "notChargeable"` — ordem: `!enabled` → disabled; `null` → notfound; não (`AWAITING_PAYMENT` && method `DEBIT` && provider `PAGBANK` && `!hasGatewayCharge`) → notChargeable; senão ok.
  - `threeDsAmountCents(total: number): number` = `Math.round(total * 100)` (o MESMO cálculo do `cents` do pagbank.ts — reaproveitar exportando, não duplicar).
  - Rota: body `{ orderId }` → 200 `{ session, env, amount, customer: { name, email, phones? } }` (customer = `buildCustomer(order.code, { name: order.customerName, phone: order.customerPhone })` **sem** `tax_id`); 403 `{ error: "debitDisabled" }`; 404 `{ error: "orderNotFound" }`; 409 `{ error: "notChargeable" }`; 502 `{ error: "unavailable" }` (log `[pagbank/3ds-session]` sem dados sensíveis).

- [ ] **Step 1: Testes que falham:**
  - `pagbank.test.ts`: `"cria sessão 3DS no host SDK do sandbox"` → `fetch` chamado com `"https://sandbox.sdk.pagseguro.com/checkout-sdk/sessions"`, método POST, header `Authorization: "Bearer tok_test"`; mock `{ session: "S1", expires_at: 123 }` → `{ session: "S1", expiresAt: 123, env: "SANDBOX" }`. Variante com `__setPagbankModeForTests("PRODUCTION")` → host `https://sdk.pagseguro.com`, `env: "PROD"`.
  - `threeds.test.ts`: `decideThreeDsSession` — chave desligada → `"disabled"` (mesmo com pedido válido); `null` → `"notfound"`; método `CREDIT` → `"notChargeable"`; provider `PAGARME` → `"notChargeable"`; `hasGatewayCharge: true` → `"notChargeable"`; status `IN_PRODUCTION` → `"notChargeable"`; válido → `"ok"`. `threeDsAmountCents(10.05)` → `1005`; `threeDsAmountCents(19.9)` → `1990`.
- [ ] **Step 2:** `npx vitest run tests/payments` → FAIL.
- [ ] **Step 3:** Implementar conforme Interfaces (a rota lê o pedido com `prisma.order.findUnique({ include: { payment: true } })` e a chave com `getPagbankDebitEnabled()`).
- [ ] **Step 4:** `npx vitest run tests/payments` → PASS (exceto a falha pré-existente do pagarme); `npx tsc --noEmit` → 0 erros.
- [ ] **Step 5: Commit** `feat(pagbank): sessao 3DS por pedido de debito`.

### Task 5: Página 3DS (`GET /api/public/pagbank/3ds`)

**Files:**
- Create: `lib/payments/threeds-page.ts`
- Create: `app/api/public/pagbank/3ds/route.ts` (`text/html; charset=utf-8`, `Cache-Control: no-store`; `/api` já fica fora do middleware de i18n — `proxy.ts`)
- Test: `tests/payments/threeds.test.ts`

**Interfaces:**
- Produces: `threeDsPageHtml(): string` e o **contrato JS com o app**:
  - A página carrega `https://assets.pagseguro.com.br/checkout-sdk-js/rc/dist/browser/pagseguro.min.js`; ao carregar, posta `{ "type": "ready" }`.
  - Expõe `window.jurandir3ds.start(params)`, `params = { session: string, env: "PROD" | "SANDBOX", data: <objeto `data` do authenticate3DS, montado pelo app> }`. Faz `PagSeguro.setUp({ session, env })` e `PagSeguro.authenticate3DS({ data, beforeChallenge: ({ open }) => { post({ type: "challenge" }); open(); } })`.
  - Mensagens (sempre `JSON.stringify`) via `window.ThreeDS.postMessage(...)` (se `window.ThreeDS` não existir — navegador comum — usar `console.log`, pra depurar no desktop): `{ "type": "result", "status": "<AUTH_FLOW_COMPLETED|AUTH_NOT_SUPPORTED|CHANGE_PAYMENT_METHOD>", "id": "<3DS_… ou null>" }`; `{ "type": "error", "code": "<errorMessages[0].code | SDK_ERROR | SDK_LOAD_FAILED>", "message": "<≤200 chars, sem dados do cartão>" }`.
  - Visual: fundo da cor do app, spinner + "Confirmando com o seu banco…" até o modal do banco aparecer. Nenhum outro `fetch`, nenhum `console.log` de `params`/`data`.

- [ ] **Step 1: Teste que falha** — `threeDsPageHtml()` contém a URL do SDK acima, `jurandir3ds`, `ThreeDS.postMessage`, `beforeChallenge` e `open()`; e **não** contém `console.log(params` nem `console.log(data`.
- [ ] **Step 2:** `npx vitest run tests/payments/threeds.test.ts` → FAIL.
- [ ] **Step 3:** Implementar a página (HTML + `<script>` inline) e a rota.
- [ ] **Step 4:** PASS + `npx tsc --noEmit` → 0 erros. Verificação manual opcional: `npm run dev`, abrir `http://localhost:3000/api/public/pagbank/3ds` e ver `{"type":"ready"}` no console.
- [ ] **Step 5: Commit** `feat(pagbank): pagina 3DS hospedada (SDK JS do PagBank)`.

### Task 6: Relatório "Repasse Débito" com PagBank

**Files:**
- Create: `lib/domain/payout.ts`
- Modify: `lib/db/admin.ts:28-65` (`listDebitPayout` usa o agregador puro)
- Modify: `components/admin/sections/RepasseDebitoSection.tsx` (coluna Gateway; `key` = `establishmentId + gateway`; comentário L13)
- Modify: `app/api/public/admin/debit-payout/route.ts` (comentário do formato)
- Modify: `messages/pt.json:920-926`, `messages/en.json` (`desc` → `"Débitos pagos no período (Pagar.me e PagBank). Uma linha por bar e por gateway — o dinheiro está na conta de cada gateway. Valor a repassar = total menos taxa Jurandir."`; nova chave `"gateway": "Gateway"`)
- Test: Create `tests/domain/payout.test.ts`

**Interfaces:**
- Produces:
  - `type DebitPayoutInput = { provider: "PAGARME" | "PAGBANK"; establishmentId: string; nome: string; total: number; platformFee: number; splitToEstablishment: number | null }`
  - `type DebitPayoutRow = { establishmentId: string; nome: string; gateway: "PAGARME" | "PAGBANK"; qtd: number; bruto: number; taxa: number; aRepassar: number }`
  - `aggregateDebitPayout(rows: DebitPayoutInput[]): DebitPayoutRow[]` — agrupa por (bar, gateway); `aRepassar += splitToEstablishment ?? total − platformFee`; ordena por `aRepassar` desc.
  - `listDebitPayout` filtra `provider: { in: ["PAGARME", "PAGBANK"] }` e devolve `DebitPayoutRow[]` (a API do app passa a ter `gateway` em cada linha).

- [ ] **Step 1: Testes que falham** — mesmo bar com 1 débito Pagar.me (total 50, fee 4) e 2 PagBank (20/1.6 e 30/2.4) → 2 linhas: PAGBANK `{ qtd: 2, bruto: 50, taxa: 4, aRepassar: 46 }` e PAGARME `{ qtd: 1, bruto: 50, taxa: 4, aRepassar: 46 }`; `splitToEstablishment: 40` vence o cálculo; ordem por `aRepassar` desc.
- [ ] **Step 2:** `npx vitest run tests/domain/payout.test.ts` → FAIL.
- [ ] **Step 3:** Implementar; ligar no `listDebitPayout` e na UI.
- [ ] **Step 4:** PASS + `npx tsc --noEmit` → 0 erros.
- [ ] **Step 5: Commit** `feat(admin): repasse de debito inclui PagBank (linha por bar e gateway)`.

---

## App (`D:\Projetos 2.0\Jurandir\jurandir-app`, branch `feat/pagbank-debito-3ds` a partir de `master`)

### Task 7: Dependência WebView + espelho do relatório

**Files:**
- Modify: `pubspec.yaml` / `pubspec.lock` (via comando do usuário)
- Modify: `lib/core/data/models.dart:666-690` (`DebitPayoutRow`), `lib/features/admin/presentation/admin_repasse_debito_screen.dart` (mostrar o gateway na linha; comentário L14)
- Test: Create `test/debit_payout_row_test.dart`

**Interfaces:**
- Produces: `DebitPayoutRow.gateway` (`String`, `''` se ausente — compat com backend antigo).

- [ ] **Step 1: Pedir ao usuário:** `cd "D:\Projetos 2.0\Jurandir\jurandir-app" && git checkout -b feat/pagbank-debito-3ds && flutter pub add webview_flutter webview_flutter_android webview_flutter_wkwebview`. Esperar.
- [ ] **Step 2: Teste que falha** — `DebitPayoutRow.fromJson({... 'gateway': 'PAGBANK'})` → `gateway == 'PAGBANK'`; sem a chave → `''`.
- [ ] **Step 3:** `flutter test test/debit_payout_row_test.dart` → FAIL; implementar; → PASS.
- [ ] **Step 4:** `flutter analyze` → sem issues novos.
- [ ] **Step 5: Commit** `feat(admin): repasse de debito mostra o gateway` (+ pubspec).

### Task 8: Modelo 3DS puro + API

**Files:**
- Create: `lib/core/payments/threeds.dart`
- Modify: `lib/core/data/public_api.dart` (perto de `pagbankPublicKey` L90 e `createCardOrder` L146)
- Test: Create `test/threeds_test.dart`

**Interfaces:**
- Produces:
  - `class ThreeDsSession { final String session; final String env; final int amount; final Map<String, dynamic> customer; factory ThreeDsSession.fromJson(Map<String, dynamic>) }`
  - `class RawCard { final String number; final int expMonth; final int expYear; final String holder; }`
  - `class BillingParts { final String street, number, complement, city, state, postalCode; }`
  - `Map<String, dynamic> buildThreeDsData({required ThreeDsSession session, required RawCard card, required BillingParts billing})` → `{ customer: session.customer, paymentMethod: { type: 'DEBIT_CARD', installments: 1, card: { number, expMonth: 'MM' (2 dígitos), expYear: 'YYYY', holder: { name } } }, amount: { value: session.amount, currency: 'BRL' }, billingAddress: { street, number, complement, regionCode: state, country: 'BRA', city, postalCode }, dataOnly: false }`. `street` vazio → `'Não informado'`; `complement` vazio → omitir.
  - `sealed class ThreeDsOutcome` com `ThreeDsAuthenticated(String id)`, `ThreeDsNotSupported()`, `ThreeDsDenied()`, `ThreeDsFailed(String code)`, `ThreeDsCancelled()`.
  - `ThreeDsOutcome? parseThreeDsMessage(String raw)` — `result`+`AUTH_FLOW_COMPLETED`+id → Authenticated; `AUTH_FLOW_COMPLETED` sem id → Failed('NO_ID'); `AUTH_NOT_SUPPORTED` → NotSupported; `CHANGE_PAYMENT_METHOD` → Denied; `error` → Failed(code); `ready`/`challenge`/JSON inválido → `null` (não-terminal).
  - `PublicApi.pagbankThreeDsSession(String orderId) → Future<({ThreeDsSession? session, String? error})>` — 200 → session; 403 → `error: 'debitDisabled'`; outros/rede → `error: 'unavailable'`.
  - `PublicApi.createCardOrder(..., String? authenticationId)` → body `'authenticationId': ?authenticationId`.
  - `String pagbankThreeDsPageUrl()` — mesma base do Dio + `/pagbank/3ds`.

- [ ] **Step 1: Testes que falham** em `test/threeds_test.dart`: `buildThreeDsData` com mês 2/ano 2027 → `expMonth: '02'`, `expYear: '2027'`, `amount.value == session.amount`, `installments == 1`, `type == 'DEBIT_CARD'`; street `''` → `'Não informado'`; `parseThreeDsMessage` para cada caso acima.
- [ ] **Step 2:** `flutter test test/threeds_test.dart` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** PASS + `flutter analyze` limpo.
- [ ] **Step 5: Commit** `feat(checkout): modelo do 3DS do PagBank + chamadas da API`.

### Task 9: Tela de autenticação (WebView) + fluxo do débito no checkout

**Files:**
- Create: `lib/features/checkout/presentation/three_ds_screen.dart`
- Modify: `lib/features/checkout/presentation/card_sheet.dart` (resultado L13; `_pay` L74-141; texto L163)
- Modify: `lib/features/checkout/presentation/checkout_screen.dart` (`_payCard` L195-271)

**Interfaces:**
- Consumes: Task 8 inteira.
- Produces:
  - `Future<ThreeDsOutcome> runThreeDs(BuildContext context, {required String pageUrl, required ThreeDsSession session, required Map<String, dynamic> data})` — rota em tela cheia, header "Confirmação do banco" com fechar (→ `ThreeDsCancelled`). WebView: JS irrestrito; canal JS `ThreeDS`; ao receber `ready` → `runJavaScript('window.jurandir3ds.start(${jsonEncode({...})})')`; Android: cookies de terceiros ligados (`AndroidWebViewCookieManager.setAcceptThirdPartyCookies`); iOS: `WebKitWebViewControllerCreationParams` com `allowsInlineMediaPlayback: true`; `setOnJavaScriptConfirmDialog` → `AlertDialog` nosso (Cancelar/Confirmar); `NavigationDelegate` não bloqueia https; timeout 5 min → `ThreeDsFailed('TIMEOUT')`; erro de carga da página principal → `ThreeDsFailed('PAGE_LOAD')`. Nunca logar `data`.
  - `CardSheetResult = ({String token, Map<String, dynamic> billing, RawCard? raw, BillingParts? billingParts})`; `showCardSheet(..., bool wantRaw = false)` — `raw`/`billingParts` só quando `wantRaw` (montados com o que a folha já coleta: número, validade, titular, CEP, número, logradouro, bairro, cidade, UF).
  - Texto da folha (L163): trocar "criptografados direto pro Pagar.me" por `"Seus dados são criptografados no celular e enviados direto pro processador do pagamento."`

- [ ] **Step 1:** `_payCard`, quando `debit && gatewayFor('debit') == 'PAGBANK'`: (a) exigir telefone com DDD (seguir o padrão do `_ensureCpf`: se `profile.phone` vazio, pedir; cancelou → sai); (b) folha com `wantRaw: true`; (c) criar pedido como hoje; (d) `pagbankThreeDsSession(id)` — `debitDisabled` → toast `"Débito indisponível no momento. Use crédito, Pix ou carteira."`; outro erro → toast `"Não foi possível iniciar o pagamento. Tente de novo."`; (e) `runThreeDs(...)`; (f) `ThreeDsAuthenticated(id)` → `createCardOrder(..., authenticationId: id)` e segue o tratamento atual de paid/pending/failed/exceção; `ThreeDsNotSupported`/`ThreeDsDenied` → toast `"Esse cartão de débito não pode ser usado aqui. Pague com crédito, Pix ou carteira."`; `ThreeDsFailed`/`ThreeDsCancelled` → toast `"Não foi possível confirmar com o seu banco. Tente de novo."`. Em todos os não-autenticados: `setState(() => _submitting = false)` e **não cobra**. Demais métodos inalterados.
- [ ] **Step 2:** `flutter analyze` → limpo; `flutter test` → tudo verde.
- [ ] **Step 3:** Build de debug Android sobe sem erro (`flutter build apk --debug --dart-define-from-file=dart_defines.pagbank-test.json`) — se faltar espaço/SDK, pedir ao usuário.
- [ ] **Step 4: Commit** `feat(checkout): debito PagBank com confirmacao do banco (3DS) dentro do app`.

### Task 10: Teste ponta a ponta no sandbox (com o usuário)

Sem código novo; corrigir o que aparecer em commits próprios.

- [ ] **Step 1:** Combinar com o usuário onde rodar: backend local (`npm run dev`, app no emulador com `API_BASE_URL=http://10.0.2.2:3000/api/public` — no SANDBOX o SDK pula o Cardinal) **ou** deploy da branch (push/merge = OK do usuário). Pré-requisitos: `db push` feito, PagBank em **Teste** no admin, chave "Débito PagBank" **Ligada** no ambiente usado, bar de teste com Débito → PagBank.
- [ ] **Step 2:** Pedido com total **exatamente R$ 10,05**, cartão MC `5200000000001005` → espera PAID sem desafio; pedido vai pra produção.
- [ ] **Step 3:** Total **R$ 10,96**, MC `5200000000001096` → aparece o "desafio" (diálogo de confirmação) → Confirmar → PAID.
- [ ] **Step 4:** Total **R$ 29,25**, Visa `4000000000002925` → não autenticado → recusa tratada, sem travar.
- [ ] **Step 5:** Chave desligada → "Débito indisponível no momento".
- [ ] **Step 6:** Admin → Repasse Débito mostra a linha PagBank do bar.
- [ ] **Step 7:** Guardar requests/responses do sandbox (sem dados de cartão) pra homologação do débito no PagBank, se pedirem. iPhone: gerar build pelo GitHub Actions e pedir teste no TestFlight a quem tiver iPhone (mesmos passos 2-5).
