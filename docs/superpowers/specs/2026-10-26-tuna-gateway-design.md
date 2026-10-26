# Tuna (7º gateway) — Fase 1: backend — Design

**Data:** 2026-10-26 · **Status:** design (decisões do usuário em chat; spec p/ revisão)
**Contrato da API (pesquisado 2026-10-26):** `docs/tuna/CONTRACT.md` + OpenAPI em `docs/tuna/specs/` (Payment, Token, Merchant).

## Intenção
A Tuna entra como **mais um gateway** no Jurandir, cobrindo os **5 métodos dentro do app e do site** (Pix, crédito, débito com 3DS, Apple Pay, Google Pay), com **split: o dinheiro de cada venda cai na conta de cada bar** e a comissão do Jurandir fica na conta da plataforma. O usuário recebe hoje as credenciais de **staging (homolog)**; depois a Tuna manda os dados do webhook. Objetivo da Fase 1: **todo o backend pronto** (rotas de cobrança, cadastro do bar, webhooks, Tuna selecionável no painel) para testar assim que as credenciais chegarem.

## Decisões do usuário
- **Split** com o dinheiro caindo na conta de cada bar (cada bar = subconta/merchant da Tuna).
- **Cadastro do bar pela API**, a partir do nosso painel (como o recebedor do Pagar.me).
- A Tuna cobre **todos os 5 métodos**.
- **Fase 1 = backend completo**; **Fase 2 = app e site** (tokenização do cartão, 3DS e carteiras pela Tuna).
- **Cadastro do bar "entra em tudo"** (2026-10-26): no painel do site E no app do estabelecimento. Fase 1 entrega o serviço compartilhado + as rotas autenticadas `GET/POST /api/public/establishment/tuna` para o app; a tela no app entra na Fase 2.

## Objetivos (Fase 1)
1. Provider `TUNA` no padrão multi-gateway (`lib/payments/*`): Pix, cartão crédito/débito (com 3DS), Apple Pay/Google Pay, consulta de status, estorno (função de provider).
2. Cadastro do bar na Tuna (`POST /api/Merchant/Register`) pelo painel do bar, com status acompanhado pelo webhook de merchant.
3. Webhooks: pagamento (`/api/webhooks/tuna`) e merchant (`/api/webhooks/tuna/merchant`).
4. Endpoint público de sessão de tokenização (`POST /api/public/tuna/session`) para o app/site (Fase 2) mandarem o cartão **direto pra Tuna**.
5. Tuna selecionável por método no painel; ambiente TEST/PRODUCTION e liberação de cartões/carteiras controlados no admin.

## Não-objetivos (Fase 1)
- Telas do app/site: formulário de cartão Tuna, coleta de dados do 3DS (DDC) e desafio do banco em WebView, botões de carteira usando a Tuna → **Fase 2**.
- Tela de estorno, extratos/repasses (Merchant `Statement`/`Transactions`), link de pagamento (é hospedado — não atende o requisito), cartão salvo.

## Anti-objetivos
- App token da Tuna no app/site, ou dados crus de cartão passando pelo nosso backend.
- Marcar pedido como pago com base só no corpo do webhook (a Tuna não assina; **sempre** reconsultar `Payment/Status`).
- Cobrar débito sem 3DS.
- Quebrar o app publicado: enquanto o app não souber tokenizar pela Tuna, **nenhum bar pode escolher Tuna para crédito/débito/carteiras**.
- Cobrar duas vezes o mesmo pedido (usar `Idempotency-Key` + `partnerUniqueId` = código do pedido).

## Contrato (resumo; detalhes em `docs/tuna/CONTRACT.md`)
- Hosts: Payment/Merchant `https://engine.tunagateway.com`; Token `https://token.tunagateway.com`. As chaves públicas de demo estão mortas; a conta `-homolog` (credenciais que a Tuna vai mandar) provavelmente usa os **mesmos hosts de produção** — por isso os hosts são configuráveis por env.
- Auth servidor: headers `x-tuna-account` e `x-tuna-apptoken`; JSON. **Erros de negócio vêm com HTTP 200 e `code` negativo**; HTTP 400 só para corpo malformado.
- `Payment/Init`: `partnerUniqueID` (único por conta), `tokenSession` (obrigatório p/ cartão e carteira), `customer`, `paymentItems.items[]` (com `split{merchantId, amount?}`), `paymentData{paymentMethods[], amount, countryCode:"BR", callbackUrl}`. Métodos: `"1"` crédito, `"7"` crédito 3DS, `"8"` débito 3DS, `"D"` Pix. Carteiras: `"1"` + `cardInfo.tokenProvider "GooglePay"|"ApplePay"` + token cru.
- Status geral: `"2"`/`"8"` pago; `"4"`/`"5"`/`"6"` falhou/cancelado/abandonado; `"P"`/`"0"` pendente; `"3"`/`"9"` estornado; `"7"` chargeback.
- Pix: resposta em `methods[].pixInfo.{qrCopyPaste, qrContent, qrImage}` (ler as chaves sem diferenciar maiúsculas; `qrImage` pode ser URL).
- 3DS: o app gera o token (`Token/Generate`) e recebe `authenticationInformation{accessToken, deviceDataCollectionUrl, referenceId, transactionId}`; roda o DDC; o backend chama `Init` com `authenticationInformation{code: sessionId, referenceId, transactionId}`; se a resposta trouxer `methods[0].threeDSInfo{url, token, paRequest}`, o app abre o desafio do banco (POST com `JWT`) e o backend confirma por `Status`/webhook.
- Merchant: `POST /api/Merchant/Register` com `externalId` (NOSSO id do bar), CNPJ/CPF, razão social, chave Pix, conta bancária, endereço, contato, representante legal, `condition` (plano de taxas definido pela Tuna). Aprovação **assíncrona (até 48 h)** via webhook de merchant (`message.code` = `SRVMerchantRegisterOk|Rejected|Error|Blocked`, `merchantStatusId` `0`/`1`/`2`/`3`/`P`).
- Webhook: sem assinatura; só um Bearer/cabeçalho opcional configurado no Console. Responder 200.
- Idempotência: header `Idempotency-Key` em POST (replay ≥ 24 h).

## Desenho

### Dados (aditivo; ALTER pontual no Neon, sem `db push`)
- `enum PaymentProvider` += `TUNA`.
- `Establishment`: `tunaMerchantExternalId String?` (nosso id enviado à Tuna, ex.: `jur_<establishment.id>`), `tunaMerchantId String?` (id numérico da Tuna), `tunaMerchantEnv PaymentEnv?` (em qual ambiente — TEST/homolog ou PRODUCTION — o cadastro foi feito), `tunaPixStatus String?` e `tunaCardStatus String?` (`analysis` | `active` | `rejected` | `blocked` | `error`, um por grupo de provedor de split), `tunaKycLevel String?`, `tunaContractAcceptedAt DateTime?` (prova do aceite).
- `AppSetting`: `tunaMode PaymentEnv @default(TEST)`, `tunaCardsEnabled Boolean @default(false)`.

### Ambiente do cadastro x modo (decisão minha, pós-revisão)
- Homolog e produção são **contas diferentes** na Tuna: um bar cadastrado em homolog não existe em produção. O cadastro guarda `tunaMerchantEnv`, e o bar só conta como pronto quando `tunaMerchantEnv === tunaMode` atual. Ao virar o modo, os bares precisam se cadastrar de novo (o painel mostra "cadastrar" de novo).
- **Enquanto `tunaMode = TEST`**, a Tuna (card de cadastro no painel e opção nos métodos) só aparece para os bares listados em `TUNA_TEST_SLUGS` (mesma ideia do Google Pay no site). Assim nenhum bar real manda dados para a homolog e nenhum cliente real recebe Pix da conta de teste. Em PRODUCTION aparece para todos.
- Os dois ambientes mandam webhook para as mesmas URLs: o ambiente de cada notificação é identificado pelo segredo Bearer que bateu (`TUNA_*_WEBHOOK_SECRET` = produção, `TUNA_*_WEBHOOK_SECRET_TEST` = homolog); notificação de merchant de outro ambiente que não o do cadastro do bar é ignorada.

### Status por método (decisão minha, pós-revisão)
- A Tuna manda **uma notificação de merchant por provedor de split** (Pix: serviços 69/71/86/88/93/101; Cartão: 41/63), em qualquer ordem. Por isso o status é separado: `tunaPixStatus` (vem dos provedores de Pix) e `tunaCardStatus` (dos de cartão). Basta **um** provedor do grupo aprovado (`SRVMerchantRegisterOk`) para o grupo ficar `active`; rejeição/bloqueio de um provedor não derruba um grupo já ativo por outro provedor. `kycLevel 0` ("Pix limitado") é aceito para Pix.
- Pronto para cobrar: **Pix** quando `tunaPixStatus = active`; **crédito/débito/carteiras** quando `tunaCardStatus = active` **e** `tunaCardsEnabled`. Identificação do grupo por `serviceId` (lista acima) com fallback pelo `serviceName` (contém "PIX" → Pix; "Cart"/"Card" → cartão). Confirmar a lista de serviços com a Tuna.

### CPF do pagador (decisão minha, pós-revisão)
- O site e a rota de carteira não coletam CPF; só os fluxos de cartão/Pix do app coletam. Regra para a Tuna: usar o CPF do pagador quando houver; **sem CPF em PRODUÇÃO, omitir o documento** (não inventar CPF de ninguém); em TESTE usar `TUNA_TEST_CPF`. Se a Tuna recusar Pix/carteira sem documento, a coleta de CPF no site entra na Fase 2. Pergunta adicionada à lista da Tuna.

### Aceite do contrato (decisão minha, pós-revisão)
- Checkbox obrigatório no modal ("Li e aceito as condições de credenciamento da Tuna para receber os pagamentos com divisão automática."), enviado como `acceptedContract: true`, e `tunaContractAcceptedAt` gravado no cadastro.

### Ambiente e credenciais (convenção do repo: TESTE = `_TEST`, PRODUÇÃO = sem sufixo)
`TUNA_ACCOUNT`, `TUNA_APPTOKEN`, `TUNA_ENGINE_URL` (default `https://engine.tunagateway.com`), `TUNA_TOKEN_URL` (default `https://token.tunagateway.com`) — todos com variante `_TEST`, resolvidos pelo modo do admin (`AppSetting.tunaMode`, cache 30 s, igual PagBank). `TUNA_WEBHOOK_SECRET` (Bearer do webhook de pagamento) e `TUNA_MERCHANT_WEBHOOK_SECRET` (Bearer do webhook de merchant). `TUNA_MERCHANT_CONDITION` (chave do plano de taxas que a Tuna informar) e `TUNA_MERCHANT_MCC` (default `5812`). `TUNA_TEST_CPF` (só em TESTE, quando o pedido não tem CPF). `TUNA_TEST_SLUGS` (bares que enxergam a Tuna enquanto o modo é TESTE). Os segredos de webhook têm variante `_TEST` (homolog).

### Provider `lib/payments/tuna.ts`
- Cliente HTTP com os headers de auth, `Idempotency-Key` em todo POST de cobrança/estorno, timeout, e `TunaError` (status HTTP + `code` da Tuna + mensagem). `code` negativo com HTTP 200 = **falha definitiva** (a Tuna processou e recusou); rede/timeout/5xx = **incerto** — entra em `isDefiniteGatewayFailure` (`lib/payments/gateway-errors.ts`).
- `createPixCharge`: `Init` com `"D"` e `pix{name, document, documentType:"CPF", expirationSeconds: PIX_EXPIRES_MIN*60}`; `partnerUniqueID` = `order.code`; split no item; `callbackUrl` = `${APP_BASE_URL}/api/webhooks/tuna`. Devolve `chargeId` = `paymentKey`, `pixPayload` = copia-e-cola, `pixQrImage` (base64 se vier; se vier URL, baixar e converter como o PagBank faz; senão vazio).
- `createCardTokenPayment`: crédito `"1"` (ou `"7"` quando vierem dados de 3DS), débito **sempre** `"8"` e **exige** dados de 3DS (sem eles: erro antes de chamar a Tuna). `cardInfo{token, tokenProvider:"Tuna", brandName, tokenSingleUse:1, saveCard:false, billingInfo{document, documentType:"CPF"}}`, `tokenSession` e, se houver, `authenticationInformation{code: sessionId, referenceId, transactionId}`. Se a resposta trouxer `threeDSInfo`, devolve `pending` **com o desafio** (`challenge{url, token, paRequest}`) para o app abrir.
- `createWalletPayment`: `"1"` com `tokenProvider` `GooglePay`/`ApplePay` e o token cru; o provider cria a `tokenSession` (NewSession) no servidor antes do `Init`.
- `getChargeStatus`: `Payment/Status {paymentKey}` → `paid` (`2`/`8`), `failed` (`3`,`4`,`5`,`6`,`7`,`9`), `pending` (resto).
- `refundTunaPayment(paymentKey, amount?, barShare?)`: `Payment/Cancel` (total ou parcial; no parcial manda `Splits[{MerchantID, Amount}]`). Só função de provider + teste (sem tela).
- **Split no `Init`:** um item com o valor total do pedido e `split{merchantId: est.tunaMerchantExternalId, amount: total − comissão}`; o restante (comissão) fica na conta da plataforma. A conta exata da liquidação está **não confirmada** → confirmar com a Tuna no 1º teste.
- `customer`: nome com sobrenome, e-mail `pedido-<código>@jurandir.app.br` (padrão do PagBank), CPF do pagador quando houver (senão `TUNA_TEST_CPF` só em TESTE; em PRODUÇÃO sem CPF → o documento é omitido, sem erro — ver "CPF do pagador").

### Cadastro do bar (painel do bar)
- Card "Tuna" em Conexões com o status (não cadastrado / em análise / ativo / recusado) e o botão "Cadastrar na Tuna" → modal com os campos do `Register` (CNPJ ou CPF, razão social, nome fantasia, chave Pix + tipo, conta bancária (banco, agência, conta com dígito, corrente/poupança), endereço, contato, representante legal, inscrição estadual default `ISENTO`, aceite do contrato).
- Server action: valida (zod), chama `Register` com `externalId = jur_<establishment.id>`, `condition`, `mccCode`, `countryId:1`, `acceptedContract:true`; grava `tunaMerchantExternalId`, `tunaMerchantId`, `tunaMerchantEnv = tunaMode`, `tunaPixStatus = tunaCardStatus = analysis`, `tunaContractAcceptedAt`. Erro da Tuna → mensagem clara no modal.
- Pronto para cobrar: ver "Status por método" (cadastro do ambiente atual + grupo ativo).

### Webhooks
- `POST /api/webhooks/tuna` (pagamento): se `TUNA_WEBHOOK_SECRET` existir, exige `Authorization: Bearer <secret>` (comparação em tempo constante; senão 401). Lê `paymentKey`, loga `[tuna/webhook]` só com ids/status, e chama `reconcileByChargeId(paymentKey)` (que reconsulta a Tuna). Erro transitório ao reconciliar → 500 (a Tuna re-tenta); demais → 200.
- `POST /api/webhooks/tuna/merchant`: checagem com `TUNA_MERCHANT_WEBHOOK_SECRET` (produção) ou `_TEST` (homolog) — o que bater define o ambiente; ignora se o ambiente não for o do cadastro do bar. Atualiza o bar pelo `externalId` e pelo grupo do provedor (ver "Status por método"): `SRVMerchantRegisterOk` → `active` (e `kycLevel`), `Rejected` → `rejected`, `Blocked` → `blocked`, `Error` → `error` (sem rebaixar um grupo já `active`); eventos de repasse (`SRVMerchantPayment*`) só logados.
- Sem nenhum segredo configurado para o ambiente, aceita (como os outros webhooks do repo), mas a segurança do pagamento continua vindo da reconsulta do `Status`.

### Sessão de tokenização (para a Fase 2)
`POST /api/public/tuna/session { orderId }` → só pedido `AWAITING_PAYMENT`, pagamento com `provider = TUNA`, sem cobrança iniciada; método cartão exige `tunaCardsEnabled`. Chama `Token/NewSession {customer{id: order.code, email}}` (+ `Is3dsTest: true` em TESTE) e devolve `{ sessionId, tokenUrl, env }`. O app/site mandam o cartão direto pra `tokenUrl/api/Token/Generate`.
- `POST /api/public/orders/card` passa a aceitar (opcional, aditivo) `tuna { sessionId, brand?, threeDs?{ referenceId, transactionId } }` e devolver (opcional) `challenge { url, token, paRequest }`. O app publicado não manda nem lê esses campos.

### Painel, admin e capacidades
- `GATEWAY_CAP.TUNA` = os 5 métodos. Liberação: **Pix** quando o bar está `active`; **crédito, débito, Apple Pay, Google Pay** só se `AppSetting.tunaCardsEnabled` (padrão desligado — liga quando a Fase 2 estiver nas lojas), mesma mecânica da chave do débito PagBank.
- Painel: Tuna na lista de gateways, nota "em análise"/"cadastro pendente" conforme o status.
- Admin → Pagamentos: card **Tuna** com Teste/Produção (`tunaMode`) e o interruptor "Cartões e carteiras pela Tuna" (`tunaCardsEnabled`). Rota pública de admin de modos passa a aceitar `tuna`.

## Restrições
- `main` = produção; trabalhar na branch `feat/tuna-gateway` (criada a partir da `main` local, que tem 25 commits ainda não pushados). Push/merge só com o OK do usuário.
- Alterações de banco: ALTER pontual (aditivo) no Neon antes do deploy — já autorizado pelo usuário para esse tipo de mudança.
- Retrocompatível com o app publicado e com o site: rotas existentes só ganham campos opcionais.
- Sem credenciais ainda: tudo testado com `fetch` simulado; 1º teste real assim que a conta homolog chegar.

## Perguntas para a Tuna (o usuário encaminha)
1. Credenciais da conta homolog e em quais hosts ela funciona.
2. Webhook: política de reenvio; existe assinatura além do Bearer configurável?
3. Validade da `tokenSession` (só o CVV tem `validFor` documentado).
4. Pix: validade padrão, chaves exatas da resposta (`qrContent`/`qrImage`) e como simular pagamento na homolog.
5. Débito: código `"8"` (guia) ou `"2"` (exemplo deles)? Existe débito sem 3DS?
6. Google Pay: qual `gatewayMerchantId` usar.
7. Apple Pay: quem gera o certificado de processamento e como fica o Apple Pay dentro do app.
8. Split: conta exata da liquidação; o `split.merchantId` é o nosso `externalId`?; qual `condition` (plano de taxas) usar no cadastro e o MCC certo para bar.
9. O que faz o `AdvancedCapture` (e se precisamos dele).
10. Pix e carteiras são aceitos **sem o CPF** do pagador?
11. Lista oficial dos `serviceId` de split (Pix x Cartão) e qual combinação de aprovações libera cada método.

## Decisões tomadas por mim (Claude)
- `externalId` do bar = `jur_<establishment.id>`.
- Chave `tunaCardsEnabled` (desligada) protegendo o app publicado; Pix pela Tuna liberado assim que o bar estiver ativo (Pix é gerado no servidor e funciona no app/site atuais).
- `Idempotency-Key` e `partnerUniqueID` = código do pedido (cada tentativa no app/site já gera pedido novo).
- Split por valor (bar = total − comissão), não por percentual.
- MCC default `5812` (configurável).

## Fica a critério de quem implementar
- Estrutura interna do `tuna.ts` (helpers, nomes privados), formato exato dos logs, textos do modal (seguir o padrão do modal do Pagar.me), testes seguindo `tests/payments/pagbank.test.ts` (stub de `fetch`).
