# Multi-gateway por método (Mercado Pago + Pagar.me)

**Data:** 2026-07-30

## Contexto

A fundação multi-provider já existe: `PaymentProvider` (interface em `lib/payments/types.ts`),
`getProvider()` (hoje fixo no MP), enum `PaymentProvider` no schema, `Payment.provider`/
`gatewayChargeId`, e reconciliação (`reconcileByChargeId`, webhook MP). Falta: escolher o
gateway **por método** e implementar o Pagar.me.

## Modelo de conta (decisão do usuário)

- **Mercado Pago:** cada estabelecimento conecta a **conta dele** (OAuth); comissão via
  `application_fee`. (Inalterado.)
- **Pagar.me:** a **plataforma** tem UMA conta (secret key no `.env`). Cada estabelecimento é
  um **recebedor** (`recipient`). O cliente paga na conta-marketplace e o **split** manda
  `total − comissão` pro recebedor do bar e a comissão pro recebedor da plataforma. O bar
  arca com a taxa de processamento (recebedor `liable` + `charge_processing_fee`). Pagar.me
  **não tem OAuth** — por isso é recebedor, não "conectar conta".

## Fase 0 — Roteamento por método + config

**Schema** (`prisma db push`, aditivo):
- `enum PaymentProvider` += `PAGARME`.
- `Establishment` += `gatewayPix / gatewayCredit / gatewayDebit  PaymentProvider @default(MERCADO_PAGO)`.
- `Establishment` += `pagarmeRecipientId String?`, `pagarmeRecipientStatus String?`.

**Roteamento** (`lib/payments/index.ts`):
- `resolveGateway(est, method): PaymentProvider` → lê o campo `gateway<Method>`.
- `getProviderByName(name): PaymentProvider` → objeto do provider (MP / Pagar.me / Asaas).
- `getProvider(est, method)` → `getProviderByName(resolveGateway(est, method))`.
- Na criação do pedido gravamos `payment.provider = resolveGateway(...)`; a reconciliação
  (`reconcileByChargeId`, `reconcileOrder`, `payOrderWithCard`) roteia pelo `payment.provider`
  já gravado (`getProviderByName`). Atualizo os call sites em `orders.ts` e `db/payments.ts`.

**Painel → Config → Pagamentos:** subseção "Onde cai cada pagamento" com 3 seletores
(Pix / Crédito / Débito → MP ou Pagar.me). Travas: MP exige conta conectada (e Pix exige
`mpPixReady`); Pagar.me exige recebedor criado. **Crédito/Débito via Pagar.me = "em breve"**
(desabilitado) — Fase 1 entrega só o Pix do Pagar.me.

## Fase 1 — Pagar.me: Pix + recebedor + webhook

**Provider** (`lib/payments/pagarme.ts`, implementa a interface):
- `createPixCharge`: `POST /orders` — `items` (centavos), `customer`, `payments[0]` =
  `{ payment_method: "pix", pix: { expires_in }, split: [...] }`. Split em `flat`/centavos:
  bar (`total − comissão`, `liable:true`, `charge_processing_fee:true`) + plataforma
  (comissão, `liable:false`). Resposta: `charges[0].id/status` e
  `charges[0].last_transaction.qr_code` (copia-e-cola) + `qr_code_url` (imagem). Como o
  contrato `PixCharge` espera base64, busco o `qr_code_url` e converto (fallback "").
- `getChargeStatus`: `GET /charges/{id}` → `mapStatus`.
- Auth: Basic `base64(secretKey + ":")`. Env: `PAGARME_SECRET_KEY`,
  `PAGARME_PLATFORM_RECIPIENT_ID`, `PAGARME_BASE_URL`, `PAGARME_WEBHOOK_SECRET`.

**Recebedor** (onboarding no painel):
- `createPagarmeRecipient(input)` → `POST /recipients` (`default_bank_account` +
  `register_information` PF/PJ) → grava `pagarmeRecipientId`/`pagarmeRecipientStatus`.
- Form no Config: tipo (PF/PJ), nome, documento, email, telefone, nascimento/abertura,
  banco, agência, conta+dígito, tipo de conta. Só depois disso o Pix por Pagar.me libera.

**Webhook** (`app/api/webhooks/pagarme/route.ts`):
- Valida um segredo compartilhado (basic-auth/token). Extrai o `charge id` do evento
  (`charge.paid` etc.) e chama `reconcileByChargeId(chargeId)` — que consulta o status no
  provider certo (autoritativo) e confirma o pedido. Mesmo padrão do webhook do MP.

## Testes

- `tests/payments/pagarme.test.ts` (fetch mockado): `createPixCharge` monta o split certo
  (soma = total, centavos, recebedores certos) e mapeia o QR; `getChargeStatus` mapeia status.
- `tests/payments/provider.test.ts`: `resolveGateway`/`getProviderByName` roteiam por método.

## Fora de escopo (Fase 1)

Crédito/Débito via Pagar.me (débito exige 3DS) — selecionáveis só quando implementados.
