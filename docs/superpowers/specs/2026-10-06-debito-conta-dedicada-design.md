# Débito Pagar.me em Conta Dedicada + Relatório de Repasse — Design

**Data:** 2026-10-06 · **Status:** design (aprovado verbalmente; spec p/ revisão)

## Contexto e problema
O **débito** na Pagar.me **não aceita split**. Hoje o código aplica `buildSplit` em TODOS os métodos, inclusive débito ([pagarme.ts:367]) → a cobrança de débito falha/é inválida pela regra de split. Além disso, o débito marketplace não é roteável por recebedor (sem split não há como direcionar).

## Decisão (Opção B, escolhida pelo usuário)
Todo o débito da Pagar.me vai pra **UMA conta Pagar.me dedicada do Jurandir** (conta B), separada da conta principal (conta A, que processa crédito/Pix com split e recebe as taxas). O dinheiro de todos os bares cai na conta B; o Jurandir repassa via **Pix manual** pra cada bar, guiado por um **relatório** por bar.

**Por que conta B (não um recebedor):** débito não roteia por recebedor (sem split). A única forma de o débito cair numa conta à parte é processá-lo com a **secret key dessa conta**. E como o **token do cartão é amarrado à conta** (criado com a chave pública dela), o **app precisa tokenizar o débito com a chave pública da conta B**.

## Escopo
**Dentro:** débito Pagar.me → conta B (sem split); app tokeniza débito com pk da conta B; relatório de repasse por bar no admin; validação Pagar.me-only.
**Fora:** per-bar accounts (impossível); automação do Pix (v1 é relatório + Pix manual); 3DS do débito (risco separado, ver abaixo); outros gateways (inalterados).

## Config (env / dart_define) — convenção `_TEST` existente
- Backend: **`PAGARME_DEBIT_SECRET_KEY`** (+ `PAGARME_DEBIT_SECRET_KEY_TEST`) = secret key da conta B. Resolvida por `envByMode` (segue o toggle `pagarmeMode` TEST/PRODUCTION, igual à conta A).
- App: **`PAGARME_DEBIT_PUBLIC_KEY`** via `--dart-define` (igual a `PAGARME_PUBLIC_KEY` já é). Chave pública da conta B.
- O usuário cria a conta B na Pagar.me e fornece `sk_B`/`pk_B` (eu não cadastro conta). Conta B tem que poder processar `debit_card`.

## Backend (`jurandir`)

### Seleção de chave por operação
`call()` hoje usa `authHeader()` global ([pagarme.ts:112-114,126-]). Mudança:
- `authHeader(key?: string)` → usa `key ?? secretKey()`.
- `call<T>(path, init?, keyOverride?: string)` → passa `authHeader(keyOverride)`.
- `debitSecretKey() = envByMode("PAGARME_DEBIT_SECRET_KEY")`.

### Cobrança de débito (`createCardTokenPayment`, método `debit`)
- Montar o pedido **SEM split** (`split: undefined` no payment do débito).
- Chamar `call("/orders", {POST, body}, debitSecretKey())` → cai na conta B.
- **Validação:** se `debitSecretKey()` vazio → `throw new PagarmeError(500, "conta de débito Pagar.me não configurada")` (não deixa cobrar débito às cegas na conta A).
- Crédito/Pix: **inalterados** (chave A + split).

### Status / reconciliação do débito
`getChargeStatus(est, chargeId)` ([409-411]) usa a chave global → pra cobrança de débito tem que usar a chave B. 
- Estender a assinatura: `getChargeStatus(est, chargeId, opts?: { debit?: boolean })` (opcional; outros providers ignoram). Pagar.me: `call("/charges/${id}", undefined, opts?.debit ? debitSecretKey() : undefined)`.
- `reconcileByChargeId` (`lib/db/payments.ts:144`) e o caller em `:48` já carregam o `Payment` → passar `{ debit: payment.method === "DEBIT" }` quando `provider === "PAGARME"`.

### Webhook (`app/api/webhooks/pagarme/route.ts`)
- O handler chama `reconcileByChargeId(chargeId)` (re-fetch autoritativo). Com o item acima, o re-fetch de uma cobrança de débito já usa a chave B (via o `Payment.method`). **Nenhuma mudança estrutural no handler.**
- ⚠️ **Assinatura:** `PAGARME_WEBHOOK_SECRET` valida a assinatura da conta A. A conta B tem webhook/segredo próprios. Como o re-fetch é autoritativo (comentário no route: "sem segredo, confiamos no re-fetch"), o caminho seguro é **não depender da assinatura pra conta B** — configurar o webhook da conta B apontando pro mesmo endpoint; se a assinatura de B não bater com o segredo de A, o ideal é deixar `PAGARME_WEBHOOK_SECRET` só pra A e aceitar B pelo re-fetch. (Detalhe de config do usuário; anotar.)

## App (`jurandir-app`)
- `card_tokenizer.dart` hoje tokeniza com `_publicKey = PAGARME_PUBLIC_KEY` (`/tokens?appId=pk`). 
- Mudança: aceitar a chave pública por método — débito usa `PAGARME_DEBIT_PUBLIC_KEY`, crédito usa `PAGARME_PUBLIC_KEY`. O método já flui do checkout (`_payCard(debit:true)`) → `card_sheet` → tokenizer. Passar um flag/`isDebit` até o tokenizer e escolher a pk.
- Se `PAGARME_DEBIT_PUBLIC_KEY` vazio e o método é débito Pagar.me → erro claro (não tokeniza com a chave errada).
- Dart defines de produção ganham `PAGARME_DEBIT_PUBLIC_KEY=pk_...`.

## Relatório de repasse (admin)
- **Fonte de dados:** pedidos de débito **pagos** — `Payment { method: DEBIT, provider: PAGARME, confirmedAt != null }` join `Order` (establishmentId, total, platformFee, splitToEstablishment, createdAt/confirmedAt).
- **Agregação por bar, por período:** `aRepassar = Σ splitToEstablishment` (total − taxa, já gravado por pedido), `taxaJurandir = Σ platformFee`, `qtd`, `bruto = Σ total`.
- **UI:** nova seção admin (ex.: `RepasseDebitoSection.tsx`) ou aba em `FaturamentoSection` — tabela: Bar | Qtd | Bruto | Taxa Jurandir | **A repassar (Pix)**, com seletor de período (hoje/7d/30d/tudo, padrão do admin). Server action `listDebitPayoutAction(period)` (auth admin, `getSession role ADMIN`) → query Prisma agregada.
- Read-only (v1 não dispara Pix).

## Validação (Pagar.me-only)
- Todo o tratamento especial de débito (conta B, sem split, pk_B) **só** quando o método é débito **e** `gatewayDebit == PAGARME`. Outros gateways: débito segue o que já era (ou não é oferecido).
- Guardas: `debitSecretKey()` setado (backend) e `PAGARME_DEBIT_PUBLIC_KEY` setado (app) — senão erro claro, nunca cobra débito na conta errada.

## Riscos / dependências
- ⚠️ **3DS:** débito transparente **sem 3DS** pode ser **recusado pelo emissor**. Se o débito não for "pinless", nenhuma cobrança passa (conta B nunca recebe). Confirmar que o débito autoriza antes de depender disso. (Fora do escopo deste spec; é pré-requisito de negócio.)
- Conta B precisa existir, poder processar `debit_card`, e ter webhook apontando pro endpoint.
- Alinhamento TEST/PRODUCTION: a `pagarmeMode` do backend e a build do app (pk_B test vs prod) têm que casar (token de teste → conta de teste).
- Taxa do débito = a mesma de hoje (`platformFee`/`splitToEstablishment`). Taxa diferente pro débito = ajuste de preço à parte.

## Self-review
- Decisão B coberta (conta B, sem split, pk_B, relatório, Pagar.me-only). ✅
- Pontos de toque mapeados contra o código real (call/authHeader/getChargeStatus/reconcile/webhook/card_tokenizer). ✅
- Sem schema change (relatório deriva de Payment/Order existentes). ✅
- Riscos nomeados (3DS, webhook da conta B, alinhamento de modo). ✅
