# Tuna (Fase 1: backend) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tuna como 7º gateway no backend: Pix, cartão (crédito/débito com 3DS) e carteiras com split por bar, cadastro do bar pela API no painel, webhooks e controles no admin — pronto para testar com as credenciais de homolog.

**Architecture:** Provider `lib/payments/tuna.ts` no padrão multi-gateway (cliente HTTP com auth por header, modo TEST/PRODUCTION do admin, erros por `code` negativo), prontidão por método calculada por um helper puro (cadastro do ambiente atual + grupo Pix/Cartão ativo + chave de cartões), cadastro do bar via `Merchant/Register` com status atualizado pelo webhook de merchant, webhook de pagamento que sempre reconsulta `Payment/Status`.

**Tech Stack:** Next.js 16 (App Router, server actions, next-intl) + Prisma + Vitest.

**Spec:** `docs/superpowers/specs/2026-10-26-tuna-gateway-design.md` · **Contrato:** `docs/tuna/CONTRACT.md` (+ `docs/tuna/specs/*.yaml`).

## Global Constraints

- Hosts default: Payment/Merchant `https://engine.tunagateway.com`, Token `https://token.tunagateway.com`; env `TUNA_ENGINE_URL`/`TUNA_TOKEN_URL` (+ `_TEST`). Auth: headers `x-tuna-account` (`TUNA_ACCOUNT[_TEST]`) e `x-tuna-apptoken` (`TUNA_APPTOKEN[_TEST]`), JSON.
- Convenção de env do repo: modo TEST lê `NOME_TEST` e cai para `NOME`; PRODUCTION lê `NOME`. Modo vem de `AppSetting.tunaMode` (default `TEST`), cache 30 s, igual `pagbank.ts`.
- Resposta com `code` < 0 (mesmo HTTP 200) = recusa definitiva → `TunaError`; rede/timeout/HTTP ≥ 500 = incerto.
- Status geral: `"2"`,`"8"` → `paid`; `"3"`,`"4"`,`"5"`,`"6"`,`"7"`,`"9"` → `failed`; qualquer outro → `pending`.
- Métodos: crédito `"1"` (com 3DS `"7"`), débito **sempre** `"8"` e exige 3DS, Pix `"D"`, carteiras `"1"` + `tokenProvider` `"GooglePay"|"ApplePay"`.
- `partnerUniqueID` = código do pedido; header `Idempotency-Key` em todo POST de cobrança/estorno.
- Split: um item com o total e `split{ merchantId: est.tunaMerchantExternalId, amount: round2(total − platformFee) }`; valores em reais (double), não centavos.
- Nunca: app token no cliente; dados crus de cartão no backend; logar token/sessão/cartão/CPF; marcar pago pelo corpo do webhook.
- Retrocompatibilidade: rotas existentes só ganham campos opcionais; o app publicado não pode ser afetado.
- Branch `feat/tuna-gateway`; sem push/merge. Banco: ALTER pontual aditivo (feito pelo controller na Task 9), nunca `db push`.
- Verificação: `npx vitest run` + `npx tsc --noEmit` (falhas pré-existentes conhecidas: `tests/payments/pagarme.test.ts` "sem recebedor do estabelecimento → erro", `tests/app/adapters.test.ts` "toClientOrder > maps a split order"); eslint sem erros novos (4 pré-existentes set-state-in-effect).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Bar real com o modo em TESTE** → Tuna invisível e não selecionável (só `TUNA_TEST_SLUGS`) (teste na Task 1).
2. **Modo virou para PRODUÇÃO com cadastro feito em homolog** → bar não está pronto (pede novo cadastro) (teste na Task 1).
3. **Notificação "Rejected" de um provedor de Pix depois de outro já aprovado** → Pix continua `active` (teste na Task 6).
4. **Débito sem dados de 3DS** → recusa antes de chamar a Tuna (teste na Task 3).
5. **Pedido sem CPF em PRODUÇÃO** → `document` omitido, nunca CPF inventado; em TESTE usa `TUNA_TEST_CPF` (teste na Task 3).
6. **Webhook com Bearer errado quando há segredo configurado** → 401 e nada reconciliado (teste na Task 6).

---

### Task 1: Dados + prontidão por método

**Files:**
- Modify: `prisma/schema.prisma` (enum `PaymentProvider`; model `Establishment` ~L128-159; model `AppSetting` ~L457-466)
- Modify: `lib/db/settings.ts`
- Create: `lib/payments/tuna-readiness.ts` (puro)
- Modify: `lib/payments/capabilities.ts`
- Test: Create `tests/payments/tuna-readiness.test.ts`; Modify `tests/payments/provider.test.ts`

**Interfaces:**
- Produces:
  - Prisma: `PaymentProvider.TUNA`; `Establishment`: `tunaMerchantExternalId String?`, `tunaMerchantId String?`, `tunaMerchantEnv PaymentEnv?`, `tunaPixStatus String?`, `tunaCardStatus String?`, `tunaKycLevel String?`, `tunaContractAcceptedAt DateTime?`; `AppSetting`: `tunaMode PaymentEnv @default(TEST)`, `tunaCardsEnabled Boolean @default(false)`.
  - `getTunaMode(): Promise<PaymentEnv>`, `setTunaMode(mode: PaymentEnv): Promise<void>`, `getTunaCardsEnabled(): Promise<boolean>`, `setTunaCardsEnabled(on: boolean): Promise<void>` (padrão upsert de `settings.ts`).
  - `type TunaEstFields = { slug: string; tunaMerchantEnv: "TEST" | "PRODUCTION" | null; tunaPixStatus: string | null; tunaCardStatus: string | null }`
  - `type TunaContext = { mode: "TEST" | "PRODUCTION"; cardsEnabled: boolean; testSlugs: string[] }`
  - `type TunaReadiness = { visible: boolean; registered: boolean; pixReady: boolean; cardReady: boolean }`
  - `tunaReadiness(est: TunaEstFields, ctx: TunaContext): TunaReadiness` — `visible` = PRODUCTION ou slug (trim, minúsculas) em `testSlugs`; `registered` = `tunaMerchantEnv === ctx.mode`; `pixReady` = visible && registered && `tunaPixStatus === "active"`; `cardReady` = visible && registered && `tunaCardStatus === "active"` && `cardsEnabled`.
  - `parseTunaTestSlugs(raw: string | undefined): string[]` (vírgula; trim; minúsculas; sem vazios).
  - capabilities: `GATEWAY_CAP.TUNA` = os 5 `true`; `GatewayReadiness` ganha `tuna?: { pixReady: boolean; cardReady: boolean }`; `canCharge(est, key, "TUNA")` = `key === "pix" ? !!est.tuna?.pixReady : !!est.tuna?.cardReady`; `isGatewayReady(est, "TUNA")` = `!!(est.tuna?.pixReady || est.tuna?.cardReady)`. `ROUTE_FALLBACK` inalterado.

- [ ] **Step 1: Testes que falham** (`tunaReadiness`): TEST + slug fora da lista → `visible:false`, nada pronto; TEST + slug na lista (com maiúsculas/espaços na env) + cadastro TEST + pix `active` → `pixReady:true`; cadastro `TEST` com modo `PRODUCTION` → `registered:false`, nada pronto; card `active` com `cardsEnabled:false` → `cardReady:false`; com `true` → `cardReady:true`; pix `analysis` → `pixReady:false`. `parseTunaTestSlugs(" Leo-Teste , ,bar2")` → `["leo-teste","bar2"]`. Em `provider.test.ts`: `canCharge({pagarmeRecipientId:null, tuna:{pixReady:true, cardReady:false}}, "pix", "TUNA")` → true; mesmo est com `"credit"` → false; sem `tuna` → false.
- [ ] **Step 2:** `npx vitest run tests/payments/tuna-readiness.test.ts tests/payments/provider.test.ts` → FAIL.
- [ ] **Step 3:** Implementar schema, settings, helper e capabilities; `npx prisma generate` (local).
- [ ] **Step 4:** PASS + `npx tsc --noEmit` → 0 erros.
- [ ] **Step 5: Commit** `feat(tuna): dados e prontidao por metodo (pix/cartao) da Tuna`.

### Task 2: Núcleo do cliente Tuna

**Files:**
- Create: `lib/payments/tuna.ts` (núcleo; as cobranças entram na Task 3)
- Modify: `lib/payments/gateway-errors.ts`
- Test: Create `tests/payments/tuna.test.ts`; Modify `tests/payments/gateway-errors.test.ts`

**Interfaces:**
- Consumes: `getTunaMode` (Task 1).
- Produces (em `tuna.ts`):
  - `ensureTunaMode(): Promise<"TEST"|"PRODUCTION">`, `bustTunaModeCache(): void`, `__setTunaModeForTests(mode: "TEST"|"PRODUCTION"|null): void` (cópia do padrão `pagbank.ts`, default TEST, no-op de banco sob VITEST).
  - `class TunaError extends Error { constructor(public status: number, public code: number | null, public body: string) }` — `status` = HTTP; `code` = `code` da Tuna quando houver.
  - `tunaPost<T>(api: "engine" | "token", path: string, body: unknown, opts?: { idempotencyKey?: string; auth?: "app" | "none" }): Promise<T>` — host por `api` e modo; headers `Content-Type: application/json`, `x-tuna-account`/`x-tuna-apptoken` quando `auth !== "none"` (default `"app"`), `Idempotency-Key` quando dado; timeout 20 s; HTTP ≥ 400 → `TunaError(status, null, body)`; JSON com `code` numérico < 0 → `TunaError(422, code, body)`; nunca loga o corpo da requisição.
  - `mapTunaStatus(status: string | null | undefined): ChargeStatus` (regra do Global Constraints).
  - `pickCi(obj: unknown, ...keys: string[]): unknown` — leitura de campo sem diferenciar maiúsculas (para `pixInfo` etc.).
- `isDefiniteGatewayFailure`: `TunaError` com `status` 400–499 → true (inclui o 422 dos `code` negativos); demais → false.

- [ ] **Step 1: Testes que falham:** (a) `tunaPost("engine", "/api/Payment/Status", {...}, { idempotencyKey: "k1" })` em TEST com envs `TUNA_ACCOUNT_TEST=acc_t`, `TUNA_APPTOKEN_TEST=tok_t` → URL `https://engine.tunagateway.com/api/Payment/Status`, headers `x-tuna-account: acc_t`, `x-tuna-apptoken: tok_t`, `Idempotency-Key: k1`; em PRODUCTION usa `TUNA_ACCOUNT`/`TUNA_APPTOKEN`; `api:"token"` → `https://token.tunagateway.com`; `auth:"none"` → sem os headers de auth. (b) Resposta 200 `{"code":-108,"message":{...}}` → rejeita `TunaError` com `status 422`, `code -108`. (c) HTTP 500 → `TunaError` status 500. (d) `mapTunaStatus`: "2"/"8" → paid; "4","5","6","3","9","7" → failed; "P","0",undefined → pending. (e) `pickCi({QrCopyPaste:"x"}, "qrCopyPaste")` → "x". (f) `gateway-errors`: `TunaError(422,-108,"")` → true; `TunaError(503,null,"")` → false.
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** PASS + `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(tuna): cliente HTTP da Tuna (auth, modo, erros, status)`.

### Task 3: Cobranças (Pix, cartão com 3DS, carteiras, status, estorno)

**Files:**
- Modify: `lib/payments/tuna.ts`, `lib/payments/types.ts`, `lib/payments/index.ts`
- Test: `tests/payments/tuna.test.ts`, `tests/payments/provider.test.ts` (mapeamento `getProviderByName("TUNA")`)

**Interfaces:**
- Consumes: Task 2 inteira.
- Produces:
  - `types.ts`: nome `"TUNA"` na união do `PaymentProvider`; `CardTokenPaymentInput.tuna?: { sessionId: string; brand?: string; threeDs?: { referenceId: string; transactionId: string } }`; `CardPaymentResult.challenge?: { url: string; token: string; paRequest?: string }`.
  - `index.ts`: `case "TUNA": return tunaProvider`.
  - `buildTunaCustomer(reference: string, opts: { name?: string; document?: string; phone?: string }, mode: "TEST"|"PRODUCTION"): { id: string; name: string; email: string; document?: string; documentType?: "CPF" }` — `id` = reference; nome com sobrenome (padrão `buildCustomer` do PagBank); e-mail `pedido-<reference minúsculo>@jurandir.app.br`; documento = dígitos do pagador se ≥ 11; senão em TEST `TUNA_TEST_CPF` (dígitos) e em PRODUCTION **omitido** (sem `documentType`).
  - `tunaSplitItem(est, total: number, platformFee: number, description: string)` → `{ detailUniqueId: "1", productDescription, itemQuantity: 1, amount: total, split: { merchantId, amount: round2(total - platformFee) } }`; sem `est.tunaMerchantExternalId` → `TunaError(422, null, "bar sem cadastro na Tuna")`.
  - `createTunaSession(customer: { id: string; email: string }): Promise<string>` — `tunaPost("token", "/api/Token/NewSession", { customer, ...(mode TEST ? { Is3dsTest: true } : {}) })` → `sessionId` (vazio → `TunaError(502,…)`).
  - `tunaProvider: PaymentProvider` com:
    - `createPixCharge` → `Init` (`"D"`, `pix{name, document?, documentType?, expirationSeconds: PIX_EXPIRES_MIN*60}`), `partnerUniqueID: reference`, `paymentItems.items:[tunaSplitItem]`, `paymentData{paymentMethods, amount: total, countryCode:"BR", callbackUrl: <APP_BASE_URL>/api/webhooks/tuna (só se https)}`, `Idempotency-Key: init:<reference>` → `chargeId` = `paymentKey`; `pixPayload` = `pickCi(pixInfo,"qrCopyPaste") ?? pickCi(pixInfo,"qrContent")`; `pixQrImage`: base64 se vier como data/base64; se for URL https, baixar e converter (falha → ""); `status` por `mapTunaStatus`.
    - `createCardTokenPayment` → débito sem `tuna.threeDs` → `TunaError(422,…)` **antes** de qualquer fetch; sem `tuna.sessionId` → idem. Tipo `"8"` (débito), `"7"` (crédito com 3DS), `"1"` (crédito sem); `cardInfo{ token: cardToken, tokenProvider:"Tuna", brandName: tuna.brand, tokenSingleUse: 1, saveCard: false, billingInfo{ document?, documentType? } }`; `installments` (débito sempre 1); `tokenSession: tuna.sessionId`; `authenticationInformation{ code: sessionId, referenceId, transactionId }` quando houver 3DS. Se `methods[0].threeDSInfo` existir → `{ chargeId: paymentKey, status: "pending", challenge: { url, token, paRequest } }`.
    - `createWalletPayment` → `createTunaSession` e depois `Init` `"1"` com `cardInfo{ tokenProvider: "GooglePay"|"ApplePay", token }` (Apple: `paymentData` extraído do JSON do token se vier embrulhado, re-stringificado; Google: token cru).
    - `getChargeStatus(est, chargeId)` → `Payment/Status {paymentKey}` → `mapTunaStatus`.
    - `findApprovedPayment(est, reference)` → `Payment/Status {PartnerUniqueID, paymentDate}` para a data de hoje e de ontem (America/Sao_Paulo, `YYYY-MM-DD`); primeiro `paid` encontrado → `{ paymentId: paymentKey, status: "paid" }`; senão `null`; erros → `null`.
  - `refundTunaPayment(paymentKey: string, opts?: { amount?: number; barMerchantId?: string; barAmount?: number }): Promise<{ status: string }>` — total `{paymentKey}`; parcial `{paymentKey, cardsDetail:[{amount, methodId:0, ...(barMerchantId ? { Splits:[{MerchantID: barMerchantId, Amount: barAmount}] } : {})}]}`; `Idempotency-Key: cancel:<paymentKey>:<amount ?? "total">`.

- [ ] **Step 1: Testes que falham** (stub de `fetch` como em `pagbank.test.ts`; `__setTunaModeForTests`): Pix → body com `paymentMethodType "D"`, `expirationSeconds 900` (PIX_EXPIRES_MIN=15), `partnerUniqueID` = ref, item com `split{merchantId:"jur_est1", amount: 18.4}` para total 20 / taxa 1.6, header `Idempotency-Key: init:PED-1`; resposta com `pixInfo:{QrCopyPaste:"000201..."}` → `pixPayload "000201..."`, `chargeId` = paymentKey. Cartão crédito sem 3DS → `"1"`; com threeDs → `"7"` + `authenticationInformation`; débito com threeDs → `"8"`, installments 1; **débito sem threeDs → rejeita e `fetch` chamado 0 vezes**; resposta com `threeDSInfo{url,token,paRequest}` → resultado `pending` + `challenge`. Carteira Google → 2 fetches (NewSession em `token.tunagateway.com`, depois Init com `tokenProvider "GooglePay"`). CPF: pedido sem documento em PRODUCTION → `customer` sem `document`/`documentType`; em TEST com `TUNA_TEST_CPF=111.444.777-35` → `document "11144477735"`. Status `"8"` → paid. Bar sem `tunaMerchantExternalId` → rejeita sem fetch. `getProviderByName("TUNA").name === "TUNA"`.
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** `npx vitest run tests/payments` PASS (salvo pré-existentes) + `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(tuna): cobrancas Pix, cartao com 3DS, carteiras, status e estorno`.

### Task 4: Cadastro do bar (provider + validação + action)

**Files:**
- Modify: `lib/payments/tuna.ts`, `lib/validation.ts`, `lib/actions/panel.ts`
- Test: `tests/payments/tuna.test.ts`, `tests/validation.test.ts`

**Interfaces:**
- Produces:
  - `tunaMerchantSchema` (zod) + `type TunaMerchantForm`: `documentType "CNPJ"|"CPF"`, `document` (≥ 11 dígitos), `name`, `fantasyName`, `pixKeyType "1"|"2"|"3"|"4"|"5"|"6"`, `pixKey`, `contact{ name, email, phone }`, `legalRepresentative{ name, document, birthday (YYYY-MM-DD) }`, `bank{ bankCode, agency, account, accountType "C"|"S" }`, `address{ street, number, complement?, neighborhood, city, state (2 letras), postalCode }`, `stateFiscalDocument` (default `"ISENTO"`), `birthday?`, `motherName?`, `occupation?` (obrigatórios quando `CPF`), `acceptedContract: true` (literal).
  - `registerTunaMerchant(form: TunaMerchantForm, opts: { externalId: string; condition: string; mcc: string }): Promise<{ merchantId: string }>` → `tunaPost("engine", "/api/Merchant/Register", {...})` com `externalId`, `document`, `documentType`, `name`, `fantasyName`, `countryId: 1`, `mccCode`, `condition`, `stateFiscalDocument`, `acceptedContract: true`, `pixKeyType`, `pixKey`, `contact{name,email,phone,cellPhone: phone}`, `legalRepresentative`, `bankAccounts:[{ externalId: externalId+"_b1", document, documentType, accountType, bankCode, agency, number: account }]`, `address{..., phone: contact.phone}`, campos de PF quando `CPF`. `merchantId` da resposta como string.
  - `registerTunaMerchantAction(form: TunaMerchantForm): Promise<{ ok: boolean; error?: string }>` — `requireEst()`; valida; `condition` = env `TUNA_MERCHANT_CONDITION` (vazio → `{ ok:false, error:"notConfigured" }`); `mcc` = `TUNA_MERCHANT_MCC ?? "5812"`; `externalId` = `jur_<establishment.id>`; grava `tunaMerchantExternalId`, `tunaMerchantId`, `tunaMerchantEnv = await ensureTunaMode()`, `tunaPixStatus = tunaCardStatus = "analysis"`, `tunaContractAcceptedAt = new Date()`; `revalidatePath("/painel")`; erro da Tuna → `{ ok:false, error: mensagem curta }`.

- [ ] **Step 1: Testes que falham:** `tunaMerchantSchema` aceita um CNPJ completo e rejeita `acceptedContract:false`; rejeita PF sem `birthday`. `registerTunaMerchant` → body com `externalId "jur_est1"`, `countryId 1`, `mccCode "5812"`, `condition "cond1"`, `acceptedContract true`, `bankAccounts[0].number`, e devolve `merchantId "86"` para a resposta `{merchantId:86, code:1}`; resposta `code -124` → rejeita `TunaError`.
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** PASS + `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(tuna): cadastro do bar na Tuna (Merchant/Register)`.

### Task 5: Painel do bar (cartão Tuna, modal e prontidão)

**Files:**
- Modify: `app/[locale]/painel/page.tsx`, `components/panel/PanelApp.tsx`, `components/panel/context.tsx`, `components/panel/sections/PaymentsManager.tsx`, `lib/actions/panel.ts` (`savePaymentRoutingAction` + `SELECTABLE_GATEWAYS`), `messages/pt.json`, `messages/en.json`
- Create: `components/panel/sections/TunaConnection.tsx` (card + modal; segue o visual do `RecipientModal`)

**Interfaces:**
- Consumes: `tunaReadiness`, `parseTunaTestSlugs` (Task 1), `getTunaMode`/`getTunaCardsEnabled`, `registerTunaMerchantAction` (Task 4).
- Produces: prop/contexto do painel `tuna: { visible: boolean; registered: boolean; pixReady: boolean; cardReady: boolean; pixStatus: string | null; cardStatus: string | null }`; `registerTuna(form): Promise<{ ok; error? }>` no contexto.
- Regras: `SELECTABLE_GATEWAYS` inclui `"TUNA"`. `savePaymentRoutingAction`: `readiness` ganha `tuna: { pixReady, cardReady }` calculado com `tunaReadiness` (est + `getTunaMode()` + `getTunaCardsEnabled()` + `parseTunaTestSlugs(process.env.TUNA_TEST_SLUGS)`), e o `select` do est inclui os campos Tuna e `slug`. `PaymentsManager`: coluna "Tuna" só quando `tuna.visible`; célula TUNA selecionável por método (`pix` → `pixReady`; demais → `cardReady`); nota: não cadastrado → `needsSetup`; em análise → `tunaInAnalysis`; cartão sem liberação → `soon`. Card "Tuna" em Conexões só quando `visible`: status Pix/Cartão (não cadastrado, em análise, ativo, recusado, bloqueado, erro) + botão "Cadastrar na Tuna" (ou "Cadastrar de novo" se `!registered` mas houver cadastro de outro ambiente) abrindo o modal com os campos do `tunaMerchantSchema`, checkbox de aceite com o texto **"Li e aceito as condições de credenciamento da Tuna para receber os pagamentos com divisão automática."**, máscaras de CNPJ/CPF/telefone/CEP reaproveitando as do `RecipientModal`.
- Strings novas `panel.config` (pt/en): `tunaTitle` "Tuna", `tunaRegister` "Cadastrar na Tuna", `tunaRegisterAgain` "Cadastrar de novo", `tunaInAnalysis` "em análise", `tunaStatusActive` "ativo", `tunaStatusRejected` "recusado", `tunaStatusBlocked` "bloqueado", `tunaStatusError` "erro no cadastro", `tunaNotConfigured` "Cadastro na Tuna indisponível no momento.", `tunaAccept` (texto acima), `tunaAnalysisNote` "A Tuna analisa o cadastro em até 48 h. Pix e cartão liberam separadamente."

- [ ] **Step 1:** Implementar a fiação e o card/modal.
- [ ] **Step 2:** `npx tsc --noEmit` → 0 erros; eslint nos arquivos tocados sem erros novos; `npx vitest run` → verde (salvo pré-existentes).
- [ ] **Step 3: Commit** `feat(tuna): Tuna no painel do bar (cadastro, status e roteamento)`.

### Task 6: Webhooks (pagamento e merchant)

**Files:**
- Create: `lib/payments/tuna-webhook.ts` (puro), `app/api/webhooks/tuna/route.ts`, `app/api/webhooks/tuna/merchant/route.ts`
- Test: Create `tests/payments/tuna-webhook.test.ts`

**Interfaces:**
- Consumes: `reconcileByChargeId` (`lib/db/payments.ts`).
- Produces:
  - `tunaWebhookAuth(authorization: string | null, secrets: { prod?: string; test?: string }): "PRODUCTION" | "TEST" | "any" | "unauthorized"` — nenhum segredo configurado → `"any"`; `Bearer <x>` igual (tempo constante) a `prod` → `"PRODUCTION"`, a `test` → `"TEST"`; senão `"unauthorized"`.
  - `tunaServiceGroup(serviceId: unknown, serviceName: unknown): "pix" | "card" | null` — ids Pix `69,71,86,88,93,101`; cartão `41,63`; senão pelo nome (contém "pix" → pix; "cart"/"card" → card); senão `null`.
  - `nextTunaStatus(current: string | null, messageCode: string): string | null` — `SRVMerchantRegisterOk` → `"active"`; `…Rejected` → `"rejected"`, `…Blocked` → `"blocked"`, `…Error` → `"error"`, **mas se `current === "active"` mantém `"active"`**; outros códigos → `current`.
  - Rota pagamento: `tunaWebhookAuth` com `TUNA_WEBHOOK_SECRET` / `TUNA_WEBHOOK_SECRET_TEST` → `unauthorized` = 401; corpo inválido = 200; lê `paymentKey` (case-insensitive) e loga `[tuna/webhook]` só com `paymentKey`/`statusId`; `reconcileByChargeId(paymentKey)`; exceção ao reconciliar → 500 (a Tuna re-tenta); senão 200.
  - Rota merchant: `tunaWebhookAuth` com `TUNA_MERCHANT_WEBHOOK_SECRET[_TEST]`; acha o bar por `tunaMerchantExternalId = externalId`; se o ambiente (≠ `"any"`) for diferente de `tunaMerchantEnv` → ignora (200); grupo via `tunaServiceGroup`; atualiza `tunaPixStatus` ou `tunaCardStatus` com `nextTunaStatus`, e `tunaKycLevel` quando vier; `SRVMerchantPayment*` → só log; sempre 200 (exceto 401).

- [ ] **Step 1: Testes que falham:** `tunaWebhookAuth` (sem segredos → "any"; prod certo → "PRODUCTION"; test certo → "TEST"; errado com segredo → "unauthorized"; header ausente com segredo → "unauthorized"). `tunaServiceGroup(69, "")` → pix; `(41,"")` → card; `(999,"Tuna Split para PIX")` → pix; `(999,"x")` → null. `nextTunaStatus`: null+Ok → active; analysis+Rejected → rejected; **active+Rejected → active**; analysis+desconhecido → analysis.
- [ ] **Step 2:** FAIL → **Step 3:** implementar helpers e rotas → **Step 4:** PASS + `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(tuna): webhooks de pagamento e de cadastro (merchant)`.

### Task 7: Sessão de tokenização + rota de cartão

**Files:**
- Create: `app/api/public/tuna/session/route.ts`
- Modify: `app/api/public/orders/card/route.ts`, `lib/db/payments.ts` (`payOrderWithCardToken`)
- Create/Test: decisão pura em `lib/payments/tuna-readiness.ts` + `tests/payments/tuna-readiness.test.ts`

**Interfaces:**
- Consumes: `createTunaSession`, `buildTunaCustomer` (Task 3), `getTunaCardsEnabled`.
- Produces:
  - `decideTunaSession(o: { status: string; method: string | null; provider: string | null; hasGatewayCharge: boolean } | null, cardsEnabled: boolean): "ok" | "cardsDisabled" | "notfound" | "notChargeable"` — ordem: `null` → notfound; não (`AWAITING_PAYMENT` && provider `TUNA` && method `CREDIT`|`DEBIT` && `!hasGatewayCharge`) → notChargeable; `!cardsEnabled` → cardsDisabled; senão ok.
  - Rota `POST /api/public/tuna/session { orderId }` (CORS igual às outras `/api/public`): 404 `orderNotFound`, 409 `notChargeable`, 403 `cardsDisabled`, 502 `unavailable`; 200 `{ sessionId, tokenUrl, env }` (`tokenUrl` = host token do modo; `env` = modo). Nunca loga o `sessionId`.
  - `/orders/card`: aceita `tuna` opcional (`sessionId` string não-vazia; `brand` string opcional; `threeDs{ referenceId, transactionId }` só se os dois forem strings não-vazias) e repassa a `payOrderWithCardToken(..., tuna?)`; resposta ganha `challenge` quando houver. `payOrderWithCardToken` ganha parâmetro final opcional `tuna?: CardTokenPaymentInput["tuna"]` e devolve `challenge?`.

- [ ] **Step 1: Testes que falham** de `decideTunaSession` (cada ramo, incluindo DEBIT ok, PIX notChargeable, cobrança iniciada notChargeable, cartões desligados cardsDisabled).
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** PASS + `npx tsc --noEmit` + `npx vitest run tests/payments`.
- [ ] **Step 5: Commit** `feat(tuna): sessao de tokenizacao e cartao Tuna na rota de cobranca`.

### Task 8: Admin + documentação

**Files:**
- Modify: `lib/actions/admin.ts`, `app/[locale]/admin/page.tsx`, `components/admin/AdminApp.tsx`, `components/admin/context.tsx`, `components/admin/sections/PagamentosSection.tsx`, `app/api/public/admin/payment-mode/route.ts`, `messages/pt.json`, `messages/en.json`, `DEPLOY_VERCEL.md`

**Interfaces:**
- Consumes: `getTunaMode`/`setTunaMode`/`getTunaCardsEnabled`/`setTunaCardsEnabled` (Task 1), `bustTunaModeCache` (Task 2).
- Produces: `setTunaModeAction(mode: PaymentEnv): Promise<{ ok: boolean; mode: PaymentEnv }>` (bust do cache), `setTunaCardsEnabledAction(on: boolean): Promise<{ ok: boolean; enabled: boolean }>`; card "Tuna" no admin (Teste/Produção, mesmo `GatewayModeCard`) + interruptor "Cartões e carteiras pela Tuna" (pt: descrição "Deixe DESLIGADO até o app e o site com a Tuna estarem publicados. Com ele desligado, a Tuna só aparece para Pix."); rota pública de modos aceita `gateway: "tuna"` e devolve `tunaMode`. `DEPLOY_VERCEL.md`: tabela das envs da Tuna (Global Constraints + `TUNA_WEBHOOK_SECRET[_TEST]`, `TUNA_MERCHANT_WEBHOOK_SECRET[_TEST]`, `TUNA_MERCHANT_CONDITION`, `TUNA_MERCHANT_MCC`, `TUNA_TEST_CPF`, `TUNA_TEST_SLUGS`) e as URLs de webhook a cadastrar no Console da Tuna: `https://jurandir.app.br/api/webhooks/tuna` e `https://jurandir.app.br/api/webhooks/tuna/merchant`.

- [ ] **Step 1:** Implementar. **Step 2:** `npx tsc --noEmit`, eslint nos arquivos tocados, `npx vitest run`. **Step 3: Commit** `feat(tuna): controles da Tuna no admin e documentacao das envs`.

### Task 9: Banco + primeiro teste (controller/usuário)

- [ ] **Step 1 (controller):** ALTER pontual no Neon: `ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'TUNA'`; `ALTER TABLE "Establishment" ADD COLUMN IF NOT EXISTS "tunaMerchantExternalId" TEXT, ... "tunaMerchantId" TEXT, "tunaMerchantEnv" "PaymentEnv", "tunaPixStatus" TEXT, "tunaCardStatus" TEXT, "tunaKycLevel" TEXT, "tunaContractAcceptedAt" TIMESTAMP(3)`; `ALTER TABLE "AppSetting" ADD COLUMN IF NOT EXISTS "tunaMode" "PaymentEnv" NOT NULL DEFAULT 'TEST', "tunaCardsEnabled" BOOLEAN NOT NULL DEFAULT false`; conferir com `information_schema`.
- [ ] **Step 2 (usuário):** colar `TUNA_ACCOUNT_TEST`/`TUNA_APPTOKEN_TEST` no `.env` local (não no chat) → controller testa `Token/NewSession` e um `Payment/Status` real (sem cobrança) para confirmar credenciais e host.
- [ ] **Step 3:** depois de publicado (push = usuário): cadastrar o bar de teste (em `TUNA_TEST_SLUGS`), receber o webhook de merchant, gerar um Pix de teste e conferir o webhook de pagamento.
