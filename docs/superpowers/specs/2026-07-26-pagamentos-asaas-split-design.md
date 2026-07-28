# Pagamentos — multi-provider (Asaas + Mercado Pago), marketplace/split, Pix — Design

**Data:** 2026-07-26
**Status:** Aprovado (Approach A, multi-provider) — pronto para plano de implementação

## Objetivo

Integrar pagamentos reais no modelo **marketplace/split**, com **dois provedores plugáveis**:
**Asaas** e **Mercado Pago**. O cliente paga o `total` do pedido por **Pix**; o gateway roteia a
fatia do estabelecimento para a conta dele e a **Jurandir retém a `platformFee`**. O status do
pedido passa a ser dirigido pelo pagamento real (webhook + reconciliação por polling), não mais simulado.

O provedor é escolhido **por estabelecimento** (`Establishment.paymentProvider`), permitindo ligar/trocar
de gateway sem reescrever o fluxo do pedido.

## Escopo

**Dentro (MVP):**
- **Abstração de provedor** (`lib/payments/`): interface `PaymentProvider` + fábrica `getProvider(est)`.
- **Asaas** — subconta por estabelecimento (`walletId`), cobrança Pix com split, webhook, reconciliação.
- **Mercado Pago** — **OAuth connect** por estabelecimento (marketplace), cobrança Pix com `application_fee`, webhook, reconciliação.
- Split de marketplace: estabelecimento recebe `total − platformFee`; Jurandir retém `platformFee`.
- Cobrança **Pix** para **pagamento cheio** (`payment.kind === "full"`, `method === "PIX"`).
- Reuso do **poller de 5s** do app (mostra "pago → em produção" sozinho) via reconciliação server-side.
- **Fallback**: estabelecimento não onboardado mantém o fluxo simulado atual (sem regressão nos testes).

**Fora (adiado — explícito):**
- Pix no rateio entre amigos (`payment.kind === "split"`) — permanece simulado.
- Cartão de crédito/débito — mesma arquitetura, depois.
- KYC/onboarding de produção, telas de repasse/extrato, refresh automático agendado de token.
- USDC/cripto.

## Global Constraints

- **Next.js 16.2.11** (App Router, Turbopack). Não rodar `npm run build` com o `dev` do usuário no :3000.
- **Sem git** (handoff por arquivo). Verificação: `tsc --noEmit` + `npm run lint` + `npm test`.
- **Sem mocks em runtime** exceto o **fallback simulado** por estabelecimento não onboardado (transitório).
- Dinheiro sempre pt-BR; `Decimal(10,2)` no banco → `Number()` na borda.
- Segredos (chaves, tokens de vendedor) **só no servidor**; nunca no bundle client.
- Textos de UI em PT e EN (next-intl).

## Arquitetura (unidades e limites)

1. **`lib/payments/types.ts`** — interface `PaymentProvider` + tipos compartilhados (`PixCharge`, `ChargeStatus`).
2. **`lib/payments/asaas.ts`** — cliente HTTP Asaas + implementação do provider + onboarding (subconta).
3. **`lib/payments/mercadopago.ts`** — cliente HTTP MP + implementação do provider + OAuth (connect/refresh).
4. **`lib/payments/index.ts`** — `getProvider(est)`: devolve a implementação conforme `est.paymentProvider`.
5. **`lib/db/payments.ts`** — `confirmChargePaid(gatewayChargeId)` (flip idempotente → `IN_PRODUCTION`) e `reconcileOrder(orderId)` (consulta o provider e confirma se pago).
6. **`lib/db/orders.ts`** — `createOrder` orquestra: se onboardado + Pix + full → `getProvider(est).createPixCharge(...)`; senão, simulado.
7. **Route Handlers:**
   - `app/api/webhooks/asaas/route.ts` — valida token, resolve evento, `confirmChargePaid`.
   - `app/api/webhooks/mercadopago/route.ts` — valida assinatura, resolve `data.id`, `confirmChargePaid`.
   - `app/api/payments/mercadopago/callback/route.ts` — callback OAuth: troca `code` por tokens, persiste no estabelecimento.
8. **`lib/actions/admin.ts`** — `connectAsaasAction(estId)` e `getMpConnectUrlAction(estId)` (ambas `assertAdmin`).
9. **App do cliente** — `DoneScreen` renderiza QR Pix quando `status === "aguardando"` + `pixPayload`; o poller de 5s promove para "produção" via reconciliação.

**Interface comum:**
```ts
type PixCharge = { chargeId: string; pixPayload: string; pixQrImage: string; status: ChargeStatus };
type ChargeStatus = "pending" | "paid" | "failed";

interface PaymentProvider {
  readonly name: "ASAAS" | "MERCADO_PAGO";
  createPixCharge(input: {
    est: Establishment; orderId: string; total: number; platformFee: number;
    customerName?: string; description: string;
  }): Promise<PixCharge>;
  getChargeStatus(est: Establishment, chargeId: string): Promise<ChargeStatus>;
}
```
Onboarding é **específico do provedor** (fora da interface comum): Asaas `createSubaccount`; MP `getOAuthUrl` + `exchangeOAuthCode`.

## Schema (Prisma)

```prisma
enum PaymentProvider { ASAAS  MERCADO_PAGO }

model Establishment {
  // ...existentes...
  paymentProvider PaymentProvider @default(ASAAS)
  paymentOnboarded Boolean        @default(false)
  ownerCpfCnpj    String?         // Asaas: obrigatório na subconta
  // Asaas
  asaasAccountId  String?
  asaasWalletId   String?
  // Mercado Pago (tokens do vendedor via OAuth)
  mpUserId        String?
  mpAccessToken   String?
  mpRefreshToken  String?
  mpPublicKey     String?
}

model Payment {
  // ...existentes...
  provider             PaymentProvider?
  gatewayChargeId      String?  @unique
  pixPayload           String?
  pixQrImage           String?  @db.Text
  confirmedAt          DateTime?
  splitToEstablishment Decimal? @db.Decimal(10, 2)
}
```
Migração via `prisma migrate dev` (ou `migrate diff` + `migrate deploy` se o TTY bloquear, como na Fase 2).

## Variáveis de ambiente (`.env`)

```
# Asaas
ASAAS_API_KEY=
ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=
# Mercado Pago
MP_CLIENT_ID=
MP_CLIENT_SECRET=
MP_BASE_URL=https://api.mercadopago.com
MP_REDIRECT_URI=http://localhost:3000/api/payments/mercadopago/callback
MP_WEBHOOK_SECRET=
```

## Fluxo — checkout Pix (pagamento cheio), qualquer provedor

1. `createOrderAction`. Se `est.paymentOnboarded` **e** `payment.kind==="full"` **e** `method==="PIX"`:
   1. `computeTotals` → `subtotal/platformFee/serviceFee/total`.
   2. `getProvider(est).createPixCharge({ orderId, total, platformFee, ... })`.
   3. Persiste no `Payment`: `provider`, `gatewayChargeId`, `pixPayload`, `pixQrImage`, `splitToEstablishment = total − platformFee`.
   4. Order criado com `status: AWAITING_PAYMENT`; `toClientOrder` inclui `pixPayload`/`pixQrImage`.
2. App: `DoneScreen` detecta `status==="aguardando"` + `pixPayload` → mostra **QR Pix + copia-e-cola** ("Aguardando pagamento").
3. Cliente paga. `getMyOrdersAction` faz **reconciliação**: para pedidos `AWAITING_PAYMENT` com `gatewayChargeId`, chama `reconcileOrder` → `getProvider(est).getChargeStatus` → se `paid`, `confirmChargePaid`. O poller de 5s dispara isso a cada ciclo → a tela vira "Pago — em produção" sozinha. Funciona em **dev sem webhook público**.
4. Painel vê o pedido pago (`IN_PRODUCTION`) → segue para `DELIVERED` como hoje.

Sem onboarding (ou método ≠ Pix): comportamento **atual** (Order direto em `IN_PRODUCTION`). Sem regressão.

### Split por provedor
- **Asaas:** cobrança na conta-plataforma com `split: [{ walletId: est.asaasWalletId, fixedValue: total − platformFee }]`. Jurandir retém `platformFee`.
- **Mercado Pago:** cobrança criada com o **access token do vendedor** (estabelecimento) + `application_fee = platformFee`. O dinheiro vai ao vendedor; a `application_fee` vai para a conta-marketplace (Jurandir).

## Onboarding por provedor

- **Asaas** — `connectAsaasAction(estId)` (assertAdmin): monta dados do cadastro (nome, email, `ownerCpfCnpj`, telefone, endereço), chama `createSubaccount`, persiste `asaasAccountId`/`asaasWalletId`, `paymentOnboarded=true`. Sem CPF/CNPJ → erro pedindo o dado.
- **Mercado Pago** — `getMpConnectUrlAction(estId)` devolve a URL de autorização OAuth (`auth.mercadopago.com.br/authorization?...&redirect_uri=MP_REDIRECT_URI&state=<estId assinado>`). O estabelecimento autoriza → MP redireciona para o callback → `exchangeOAuthCode(code)` troca por `{ access_token, refresh_token, user_id, public_key }`, persiste em `mp*`, `paymentOnboarded=true`.
- UI: botão "Conectar pagamentos" na seção do estabelecimento no admin, com o rótulo do provedor selecionado + badge "Pagamentos ativos".

## Webhooks

- **Asaas** `POST /api/webhooks/asaas`: valida `asaas-access-token === ASAAS_WEBHOOK_TOKEN` (senão 401). Em `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` → `confirmChargePaid(payment.id)`.
- **Mercado Pago** `POST /api/webhooks/mercadopago`: valida assinatura `x-signature`/`x-request-id` com `MP_WEBHOOK_SECRET`. Em `type==="payment"` → `getChargeStatus` do pagamento `data.id`; se `approved` → `confirmChargePaid(data.id)`.
- Ambos: idempotentes (Order já em `IN_PRODUCTION`/`DELIVERED` → no-op), respondem `200` rápido; erro interno logado sem vazar detalhe.

## Confirmação: webhook + reconciliação

O webhook é a fonte **primária**. A **reconciliação no poll** (`reconcileOrder` → `getChargeStatus`) é o
fallback e o que viabiliza teste em **dev** (sem webhook público). Ambos convergem no `confirmChargePaid`
idempotente — nunca duplicam. O poller do client só relê o status persistido; quem consulta o gateway é o servidor.

## Matemática do split (exata)

- `platformFee = round2(subtotal * platformFeePct/100)` → **Jurandir**.
- `serviceFee  = round2(subtotal * serviceFeePct/100)` → embutido no que vai ao estabelecimento.
- `total = round2(subtotal + platformFee + serviceFee)` → o cliente paga isto.
- Split: estabelecimento recebe `round2(total − platformFee)`; Jurandir retém `platformFee`.
- A taxa do gateway é debitada de quem é dono da cobrança (Asaas: conta-plataforma; MP: vendedor). Registro contábil no MVP.

## Tratamento de erro, idempotência e segurança

- **Idempotência:** `externalReference/external_reference = order.id`; `Payment.gatewayChargeId @unique`.
- **Falha ao criar cobrança:** Order **não** é criado (rollback) e a action devolve `{ ok:false, error:"payment" }`; app mostra erro e permite tentar de novo.
- **Tokens MP:** `mpAccessToken`/`mpRefreshToken` só no servidor; refresh sob demanda no `getChargeStatus`/`createPixCharge` se o token expirar (401 → refresh → repete uma vez).
- **Webhooks:** autenticação obrigatória (token Asaas / assinatura MP); idempotentes; `200` rápido.
- **Poller vs webhook:** ver seção acima; o gateway só é consultado server-side.

## Estratégia de testes

- **Unit** (vitest, `fetch` mockado): montagem de payloads e parse de respostas de cada provider; troca OAuth do MP; `getProvider` seleciona o provider certo; cálculo/arredondamento do split; `confirmChargePaid` idempotente; `reconcileOrder`.
- **Integração/E2E** (quando as chaves de sandbox chegarem): onboardar um estabelecimento em cada provider → pedido Pix → QR gerado → **simular pagamento no sandbox** (MP: test users; Asaas: painel/simulação) → reconciliação/webhook → Order `IN_PRODUCTION` → aparece pago no painel.
- Verificação sem tocar `.next`: `tsc --noEmit`, `npm run lint`, `npm test`.
- Nota MP sandbox: marketplace exige **contas distintas** (test user vendedor + test user comprador).

## Dependências externas (do usuário)

- **Asaas:** conta Sandbox + API Key; CPF/CNPJ válido de sandbox para a subconta.
- **Mercado Pago:** aplicação criada no painel de desenvolvedores (Client ID + Client Secret) + test users (vendedor/comprador). Configurar o `MP_REDIRECT_URI`.
- Sem as chaves: código escrito e escalonado; verificação de runtime deferida (padrão Fase 2/Neon).

## Rollout

`paymentProvider` + fallback simulado por estabelecimento permitem ligar Pix real **gradualmente**
(um estabelecimento e um provedor por vez), sem interromper os testes práticos em andamento.
