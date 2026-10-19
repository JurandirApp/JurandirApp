# Apple Pay e Google Pay no site — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O cliente do site paga com Apple Pay (Safari) e Google Pay dentro da página, pelo gateway de carteira do bar (Pagar.me/PagBank), com aviso "Somente crédito".

**Architecture:** O servidor calcula a config das carteiras por bar (env + modo do gateway) e a entrega à página. O cliente mostra os botões oficiais quando o aparelho suporta; com o token, cria o pedido `CREDIT` sem checkout hospedado (server action), guarda o id, e cobra por `orderId` com a cobrança de carteira que já existe (`payOrderWithWallet`). Apple Pay valida o comerciante num endpoint nosso com o Merchant Identity Certificate (mTLS).

**Tech Stack:** Next.js 16 (App Router, server actions, next-intl) + Vitest; Google Pay API for Web (`pay.js`); Apple Pay JS nativo (`ApplePaySession` v3); Flutter (só o aviso no app).

**Spec:** `docs/superpowers/specs/2026-10-19-carteiras-web-design.md`

## Global Constraints

- Pedido de carteira nasce com `payment.method = CREDIT`; cobrança só via `payOrderWithWallet` (sem mudar providers).
- Gateway da carteira = `est.gateways.applePay` / `est.gateways.googlePay`; botão só aparece se `est.applePay` / `est.googlePay` (canCharge) **e** a config existir **e** o aparelho suportar.
- Apple Pay: `merchantCapabilities: ["supports3DS", "supportsCredit"]`, `supportedNetworks: ["visa", "masterCard"]`, `countryCode: "BR"`, `currencyCode: "BRL"`, `ApplePaySession` versão 3.
- Google Pay: `apiVersion 2 / apiVersionMinor 0`, `type: "CARD"`, `allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"]`, `tokenizationSpecification.type: "PAYMENT_GATEWAY"`; Pagar.me → `gateway: "pagarme"`, redes `["VISA", "MASTERCARD"]`; PagBank → `gateway: "pagbank"`, redes `["VISA", "MASTERCARD", "ELO"]`; `merchantInfo.merchantName: "Jurandir"`, `countryCode: "BR"`, `currencyCode: "BRL"`, `totalPriceStatus: "FINAL"`.
- Aviso: pt `"Somente crédito"`, en `"Credit only"` — texto pequeno e discreto junto do(s) botão(ões).
- Chave do certificado da Apple só no servidor (env); nunca no cliente, nunca em log. `validationURL` só de host Apple.
- Carteiras só no modo pagamento inteiro.
- Rotas públicas existentes não mudam de contrato (app publicado usa `/api/public/orders/wallet`).
- Backend: branch `feat/web-wallets` criada a partir de `feat/pagbank-debito-3ds`; nada de push/merge sem OK do usuário. Instalações = usuário.
- Verificação: `npx vitest run` + `npx tsc --noEmit` (falhas pré-existentes conhecidas: `tests/payments/pagarme.test.ts` "sem recebedor do estabelecimento → erro", `tests/app/adapters.test.ts` "toClientOrder > maps a split order"); eslint sem erros novos.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Bar com carteira em gateway sem `gatewayMerchantId` configurado** → Google Pay não aparece (teste na Task 1).
2. **Gateway da carteira em Teste no admin** → Google Pay `environment: "TEST"` mesmo com `GOOGLE_PAY_MERCHANT_ID` setado (teste na Task 1).
3. **`validationURL` forjada** (`https://evil.com`, `https://apple-pay-gateway.apple.com.evil.com`, `http://apple-pay-gateway.apple.com`) → recusada (teste na Task 1).
4. **Retentativa/duplo clique com o mesmo pedido** → `chargeWalletAction` não cobra de novo pedido já cobrado (teste da decisão na Task 3).
5. **Cert/key da Apple ausentes** → `applePay` nulo na config, endpoint de sessão responde 503 sem stack (teste na Task 1 / Task 2).

---

### Task 1: Config das carteiras (puro) + guarda da validationURL

**Files:**
- Create: `lib/payments/wallet-web.ts`
- Test: Create `tests/payments/wallet-web.test.ts`

**Interfaces:**
- Produces:
  - `type WalletWebEnv = { appleMerchantId: string; appleDisplayName: string; appleCertReady: boolean; googleMerchantId: string; googleGatewayMerchantIds: { PAGARME?: string; PAGBANK?: string } }`
  - `type GatewayModes = { PAGARME: "TEST" | "PRODUCTION"; PAGBANK: "TEST" | "PRODUCTION" }`
  - `type ApplePayWebConfig = { merchantIdentifier: string; displayName: string; supportedNetworks: string[]; merchantCapabilities: string[]; countryCode: "BR"; currencyCode: "BRL" }`
  - `type GooglePayWebConfig = { environment: "TEST" | "PRODUCTION"; merchantId?: string; merchantName: string; gateway: "pagarme" | "pagbank"; gatewayMerchantId: string; allowedCardNetworks: string[]; allowedAuthMethods: string[] }`
  - `type WalletWebConfig = { applePay: ApplePayWebConfig | null; googlePay: GooglePayWebConfig | null }`
  - `walletWebConfig(est: { applePay: boolean; googlePay: boolean; gateways: { applePay: string; googlePay: string } }, env: WalletWebEnv, modes: GatewayModes): WalletWebConfig` — valores do Global Constraints; Apple só se `est.applePay && env.appleCertReady`; Google só se `est.googlePay` e o gateway for PAGARME/PAGBANK com `gatewayMerchantId` não-vazio; `environment` = `"PRODUCTION"` só se `modes[gateway] === "PRODUCTION"` e `env.googleMerchantId` não-vazio; `merchantId` só quando PRODUCTION.
  - `isAppleValidationUrl(url: string): boolean` — `https:` e host terminando em `.apple.com` cujo primeiro rótulo começa com `apple-pay-gateway` ou `cn-apple-pay-gateway` (ex.: `apple-pay-gateway.apple.com`, `apple-pay-gateway-nc-pod5.apple.com`, `cn-apple-pay-gateway.apple.com`); URL inválida → false.

- [ ] **Step 1: Testes que falham:** Apple presente com cert pronto e ausente sem cert ou com `est.applePay=false`; capabilities exatamente `["supports3DS","supportsCredit"]`; Google Pagar.me → `gateway "pagarme"`, redes `["VISA","MASTERCARD"]`, gatewayMerchantId do env; PagBank → `"pagbank"`, `["VISA","MASTERCARD","ELO"]`; sem gatewayMerchantId do gateway → `googlePay: null`; gateway `MERCADO_PAGO` → null; modo TEST → `environment "TEST"` e sem `merchantId`; PRODUCTION + merchantId → `"PRODUCTION"` com merchantId; PRODUCTION sem merchantId → `"TEST"`. `isAppleValidationUrl`: aceita `https://apple-pay-gateway.apple.com/paymentservices/startSession`, `https://apple-pay-gateway-nc-pod5.apple.com/paymentservices/paymentSession`, `https://cn-apple-pay-gateway.apple.com/x`; recusa `http://apple-pay-gateway.apple.com/x`, `https://evil.com/x`, `https://apple-pay-gateway.apple.com.evil.com/x`, `https://evilapple-pay-gateway.apple.com/x` (o primeiro rótulo tem que começar com o prefixo), `"lixo"`.
- [ ] **Step 2:** `npx vitest run tests/payments/wallet-web.test.ts` → FAIL.
- [ ] **Step 3:** Implementar (módulo puro, sem env/Prisma).
- [ ] **Step 4:** PASS + `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(web): config das carteiras do site (Apple/Google Pay) + guarda da validationURL`.

### Task 2: Validação do comerciante Apple Pay (`POST /api/public/applepay/session`) + leitura do env

**Files:**
- Create: `lib/payments/wallet-web-env.ts` (servidor: lê env + modos do admin)
- Create: `app/api/public/applepay/session/route.ts`
- Modify: `public/.well-known/README.md` (trocar o passo a passo do MP pelo da Apple Developer: Merchant ID → Merchant Domains)

**Interfaces:**
- Consumes: `isAppleValidationUrl`, `WalletWebEnv`, `GatewayModes`, `walletWebConfig` (Task 1); `getAppSettings()` (`lib/db/settings.ts`).
- Produces:
  - `readWalletWebEnv(): WalletWebEnv` — `APPLE_PAY_MERCHANT_ID` (default `merchant.br.app.jurandir`), `APPLE_PAY_DISPLAY_NAME` (default `Jurandir`), `appleCertReady` = `APPLE_PAY_MERCHANT_CERT` e `APPLE_PAY_MERCHANT_KEY` não-vazios, `GOOGLE_PAY_MERCHANT_ID`, `GOOGLE_PAY_PAGARME_GATEWAY_MERCHANT_ID`, `GOOGLE_PAY_PAGBANK_GATEWAY_MERCHANT_ID`.
  - `getWalletWebConfig(est): Promise<WalletWebConfig>` — `walletWebConfig(est, readWalletWebEnv(), modos de getAppSettings())`; erro lendo o banco → modos TEST.
  - Rota: body `{ validationURL: string }` → `isAppleValidationUrl` falso → 400 `{ error: "invalidUrl" }`; cert/key ausentes → 503 `{ error: "notConfigured" }`; senão `POST validationURL` via `node:https` com `cert`/`key` (PEM decodificado de base64), JSON `{ merchantIdentifier, displayName, initiative: "web", initiativeContext: <APPLE_PAY_DOMAIN ou host de APP_BASE_URL> }`, timeout 10 s → devolve o JSON da Apple como veio (200); falha → 502 `{ error: "appleFailed" }` com log `[applepay/session]` só com status/mensagem (nunca cert/key/sessão). `runtime = "nodejs"`, `dynamic = "force-dynamic"`, mesmo origin (sem CORS).

- [ ] **Step 1:** Implementar `wallet-web-env.ts` e a rota.
- [ ] **Step 2:** `npx tsc --noEmit` → 0 erros; `npx vitest run tests/payments` → verde (salvo pré-existentes).
- [ ] **Step 3:** Atualizar o README do `.well-known` (passos: Apple Developer → Identifiers → Merchant IDs → `merchant.br.app.jurandir` → Merchant Domains → Add Domain `jurandir.app.br` → baixar arquivo → substituir `apple-developer-merchantid-domain-association` → deploy → Verify).
- [ ] **Step 4: Commit** `feat(web): validacao do comerciante Apple Pay (mTLS) e env das carteiras`.

### Task 3: Server actions de carteira + config na página

**Files:**
- Modify: `lib/actions/app.ts`
- Modify: `app/[locale]/[slug]/page.tsx` (passa `wallets={await getWalletWebConfig(appEst)}` ao `ClientApp`)
- Modify: `components/app/ClientApp.tsx` (só a prop `wallets: WalletWebConfig` e repassar ao contexto — a UI é a Task 4)
- Test: Create `tests/payments/wallet-charge.test.ts`

**Interfaces:**
- Consumes: `getWalletWebConfig` (Task 2); `createOrder`, `getOrdersByIds` (`lib/db/orders`); `payOrderWithWallet`, `resolveChargeableOrder` (`lib/db/payments`).
- Produces:
  - `createWalletOrderAction(input: OrderCreateInput): Promise<{ ok: boolean; order?: ClientOrder; error?: string }>` — valida com `orderCreateSchema`; exige `payment.kind === "full"` e `payment.method === "CREDIT"` (senão `{ ok:false, error:"invalid" }`); `createOrder` e **não** cria checkout hospedado.
  - `chargeWalletAction(orderId: string, walletType: "apple_pay" | "google_pay", token: string): Promise<{ ok: boolean; status: ChargeStatus; order?: ClientOrder; detail?: string }>` — token vazio → failed; `resolveChargeableOrder(orderId)`: `notfound` → `{ ok:false, status:"failed" }`; `settled` → `{ ok:true, status }` + pedido, **sem cobrar**; `charge` → `payOrderWithWallet` e devolve o pedido atualizado (`getOrdersByIds`). Exceção → `{ ok:false, status:"failed" }` (log `[chargeWallet]` só com a mensagem).
  - Pura e testável: `walletChargeDecision(r: { kind: "charge" } | { kind: "settled"; status: "paid" | "pending" } | { kind: "notfound" }): "charge" | "settled" | "notfound"` (em `lib/payments/wallet-web.ts`), usada pela action.

- [ ] **Step 1: Testes que falham** de `walletChargeDecision` (cada kind) — a regra "settled nunca cobra".
- [ ] **Step 2:** FAIL → implementar as actions + decisão + prop na página → PASS.
- [ ] **Step 3:** `npx tsc --noEmit` → 0 erros; `npx vitest run` → verde (salvo pré-existentes).
- [ ] **Step 4: Commit** `feat(web): actions de pedido e cobranca por carteira no site`.

### Task 4: Botões de Apple Pay e Google Pay no checkout do site

**Files:**
- Create: `lib/payments/wallet-sdk.ts` (loader idempotente do `https://pay.google.com/gp/p/js/pay.js`, no padrão de `lib/payments/mp-sdk.ts`; tipos mínimos de `google.payments.api` e `ApplePaySession`)
- Create: `components/app/WalletButtons.tsx`
- Modify: `components/app/screens/CheckoutScreen.tsx` (bloco das carteiras acima da grade de métodos, só no modo pagamento inteiro)
- Modify: `components/app/ClientApp.tsx` (`payWithWallet` no contexto) e `components/app/context.tsx`
- Modify: `messages/pt.json`, `messages/en.json` (namespace `app`)

**Interfaces:**
- Consumes: `WalletWebConfig` (Task 1); `createWalletOrderAction`, `chargeWalletAction` (Task 3); estado do carrinho/`finish` existentes em `ClientApp.tsx:292-356`.
- Produces: `<WalletButtons config={wallets} total={grandTotal} disabled={...} onToken={(walletType, token, complete) => ...} />` e o fluxo:
  - **Google Pay:** só renderiza se `config.googlePay` e `isReadyToPay` resolver `result: true`; usa `paymentsClient.createButton({ buttonType: "pay", buttonColor: "black", buttonSizeMode: "fill", onClick })`; no clique chama `loadPaymentData` (dentro do gesto) com `transactionInfo.totalPrice` = total com 2 casas (`"12.50"`), `totalPriceStatus: "FINAL"`; token = `paymentMethodData.tokenizationData.token`. Cancelamento do usuário (`statusCode "CANCELED"`) → silêncio.
  - **Apple Pay:** só renderiza se `config.applePay` e `window.ApplePaySession?.canMakePayments()`; botão com CSS `-webkit-appearance: -apple-pay-button; -apple-pay-button-type: pay; -apple-pay-button-style: black`; no clique cria `new ApplePaySession(3, { countryCode, currencyCode, supportedNetworks, merchantCapabilities, total: { label: config.displayName, amount: "12.50" } })` e `begin()` no mesmo gesto; `onvalidatemerchant` → `POST /api/public/applepay/session { validationURL }` → `completeMerchantValidation(json)` (erro → `abort()` + aviso); `onpaymentauthorized` → token = `JSON.stringify(event.payment.token)` → fluxo de cobrança → `completePayment({ status: ApplePaySession.STATUS_SUCCESS | STATUS_FAILURE })`.
  - **Fluxo de cobrança (`payWithWallet(walletType, token)` no ClientApp):** monta o mesmo `OrderCreateInput` do `finish` com `payment: { kind: "full", method: "CREDIT", installments: 1 }` → `createWalletOrderAction` → guarda `order.dbId` em `jur_orders_<slug>` (igual ao `finish`) → `chargeWalletAction(dbId, walletType, token)` → `paid` → limpa carrinho e vai pro `done` com o pedido; `pending` → `done` com o pedido (aguardando; o polling atual confirma); `failed` → aviso `walletDeclined` e fica no checkout; exceção após criar o pedido → vai pra "Meus pedidos" (polling) em vez de mostrar erro.
  - **Aviso:** abaixo dos botões, texto pequeno e discreto (`text-[11px]`, cor esmaecida do tema) com a chave `walletCreditOnly`.
  - Strings novas (`app`): `walletCreditOnly` = "Somente crédito" / "Credit only"; `walletOr` = "ou escolha outra forma" / "or choose another method"; `walletDeclined` = "Pagamento não aprovado. Tente outro cartão ou forma de pagamento." / "Payment not approved. Try another card or payment method."; `walletUnavailable` = "Não foi possível iniciar o pagamento. Tente outra forma." / "Couldn't start the payment. Try another method."
  - Nunca logar o token.

- [ ] **Step 1:** Implementar loader, componente, integração e strings.
- [ ] **Step 2:** `npx tsc --noEmit` → 0 erros; eslint nos arquivos tocados sem erros novos; `npx vitest run` → verde (salvo pré-existentes).
- [ ] **Step 3:** Verificação manual opcional: `npm run dev`, abrir um bar com Google Pay no Chrome — o botão aparece (TEST) e a folha abre com cartões de teste.
- [ ] **Step 4: Commit** `feat(web): Apple Pay e Google Pay no checkout do site (somente credito)`.

### Task 5: Aviso "Somente crédito" no app

**Files:**
- Modify: `D:\Projetos 2.0\Jurandir\jurandir-app\lib\features\checkout\presentation\checkout_screen.dart` (onde Apple Pay / Google Pay aparecem na lista de métodos, ~L70-81, e/ou junto do botão da carteira)

- [ ] **Step 1:** Mostrar "Somente crédito" pequeno e discreto (estilo de legenda já usado no checkout) junto da opção Apple Pay/Google Pay. Branch do app: `feat/pagbank-debito-3ds` (mesmo build do débito 3DS).
- [ ] **Step 2:** `flutter analyze` → sem issues novos; `flutter test` (falha pré-existente conhecida: `test/widget_test.dart` "app inicia no Splash e avança").
- [ ] **Step 3: Commit** `feat(checkout): aviso discreto de que Apple Pay/Google Pay sao somente credito`.

### Task 6: Configuração e teste (com o usuário)

Sem código novo; corrigir o que aparecer em commits próprios.

- [ ] **Step 1:** Gerar a chave privada + CSR do Merchant Identity Certificate (`openssl req -new -newkey rsa:2048 -nodes -keyout apple_pay_merchant_identity.key -out apple_pay_merchant_identity.csr -subj "/CN=merchant.br.app.jurandir"`) **fora do repo** (`D:\Projetos 2.0\Jurandir\`), mandar o CSR pro usuário subir na Apple; converter o `.cer` baixado (`openssl x509 -inform der -in merchant_id.cer -out merchant_id.pem`) e entregar os valores base64 de cert e key pro usuário colar na Vercel (`APPLE_PAY_MERCHANT_CERT`, `APPLE_PAY_MERCHANT_KEY`).
- [ ] **Step 2:** Usuário adiciona o domínio na Apple e manda o arquivo → substituir `public/.well-known/apple-developer-merchantid-domain-association` (commit).
- [ ] **Step 3:** Usuário cadastra o site no Google Pay & Wallet Console e cola `GOOGLE_PAY_MERCHANT_ID`, `GOOGLE_PAY_PAGARME_GATEWAY_MERCHANT_ID` (`acc_EyDVN88HkDCg0eGm`), `GOOGLE_PAY_PAGBANK_GATEWAY_MERCHANT_ID` (`ACCO_` da conta PagBank) na Vercel.
- [ ] **Step 4:** Deploy (push/merge = OK do usuário). Google Pay em TEST: botão aparece no Chrome/Android, folha abre; a cobrança com token de teste é recusada pelo gateway (esperado no TEST — já documentado).
- [ ] **Step 5:** Apple Pay: alguém com iPhone/Mac no Safari abre o site → botão aparece → validação do comerciante passa (log `[applepay/session]` sem erro) → cobrança real de valor baixo quando o gateway da carteira estiver em produção.
