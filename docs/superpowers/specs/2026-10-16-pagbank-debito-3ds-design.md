# Débito PagBank com autenticação 3DS — Design

**Data:** 2026-10-16 · **Status:** design (resumo aprovado verbalmente pelo usuário; spec p/ revisão)

## Intenção
O Jurandir só quer gateways com pagamento **dentro do app** (nada de página externa) cobrindo **débito, crédito, Pix, Apple Pay e Google Pay**. O PagBank já faz Pix, crédito, Apple Pay e Google Pay dentro do app; **falta o débito**. O PagBank exige **autenticação 3DS obrigatória** no débito, e o 3DS dele só existe como **SDK JavaScript web** (não há SDK nativo Android/iOS). Este design adiciona o débito PagBank com 3DS rodando **numa tela embutida (WebView) dentro do app**, para o PagBank virar um gateway completo (5 métodos).

## Objetivos
- Cliente paga **débito via PagBank sem sair do app**: digita o cartão na nossa folha de cartão (igual ao crédito PagBank), autentica no banco dentro do app, pedido confirmado.
- Bar pode escolher **PagBank** para **Débito** no painel (matriz método × gateway).
- O débito PagBank entra no relatório **"Repasse Débito"** do admin.

## Não-objetivos
- **Split no débito.** A doc do PagBank diz que a divisão do pagamento só vale para crédito, Pix e boleto ("Como utilizar a divisão do pagamento"); a tabela de erros diz que `liable` só vale pra crédito e que 3DS não combina com split com `liable`. **Decisão do usuário:** o débito PagBank cai **na conta PagBank do Jurandir** (a do `PAGBANK_TOKEN`), repasse ao bar **manual por Pix**, guiado pelo relatório — igual ao débito Pagar.me ([2026-10-06-debito-conta-dedicada-design.md](2026-10-06-debito-conta-dedicada-design.md)).
- 3DS no crédito (continua sem 3DS).
- Mexer em Apple Pay / Google Pay / Pix / crédito, no débito Pagar.me ou no Mercado Pago.
- Automatizar o Pix de repasse.

## Anti-objetivos (falha mesmo que "funcione")
- Mandar o cliente pro navegador / página externa.
- Dados crus do cartão (número/CVV) saírem do aparelho rumo ao NOSSO servidor, ou aparecerem em log (app, página ou backend).
- Cobrar débito sem 3DS, ou mandar `splits`/`liable` num `DEBIT_CARD`.
- Repetir o "pagamento fantasma": cobrança feita e app travado sem confirmar. Manter o fluxo resiliente atual (pedido criado ANTES da cobrança, cobrança por `orderId`, polling em `/pagamento`).

## Contrato do PagBank (pesquisado 2026-10-16)
Fontes: SDK oficial `pagseguro.min.js` lido direto; plugin oficial WooCommerce do PagBank (`DebitCardPaymentGateway`); módulo Magento oficial; espelho markdown da doc (`DominaSys/web-package-pagbank-php-sdk/docs-pagbank`); PRs com testes reais em sandbox. Cópias em `scratchpad/pb3ds/` (fora do repo).

1. **Sessão 3DS** (backend, token secreto): `POST https://sdk.pagseguro.com/checkout-sdk/sessions` (sandbox: `https://sandbox.sdk.pagseguro.com/...`), `Authorization: Bearer <PAGBANK_TOKEN>`, sem body → **201** `{ session, expires_at (epoch ms) }`, validade 30 min. (Probe em produção 2026-10-16 → 201 OK.)
2. **SDK JS** `https://assets.pagseguro.com.br/checkout-sdk-js/rc/dist/browser/pagseguro.min.js`:
   - `PagSeguro.setUp({ session, env: 'PROD' | 'SANDBOX' })`
   - `PagSeguro.authenticate3DS({ data: { customer:{name,email,phones:[{country:'55',area,number,type:'MOBILE'}]}, paymentMethod:{ type:'DEBIT_CARD', installments:1, card:{ number, expMonth:'MM', expYear:'YYYY', holder:{name} } }, amount:{ value:<centavos>, currency:'BRL' }, billingAddress:{ street, number, complement, regionCode:'UF', country:'BRA', city, postalCode }, dataOnly:false }, beforeChallenge: ({open}) => open() })`
   - O SDK criptografa o cartão sozinho (sem CVV) com a chave dele. Retorno: `{ status, id, authenticationStatus }`.
     - `AUTH_FLOW_COMPLETED` → usar `id` (`3DS_…`) no pedido.
     - `AUTH_NOT_SUPPORTED` → cartão não elegível → **débito não pode seguir**.
     - `CHANGE_PAYMENT_METHOD` → PagBank negou → pedir outro método.
     - Promise rejeitada → `PagSeguroError` (`err.detail.errorMessages`; sessão expirada = 403).
     - **Não confiar em `authenticationStatus`** do SDK; quem decide é a resposta da cobrança.
   - Desafio do banco: modal **dentro da página** (Cardinal Songbird, iframe `*.cardinalcommerce.com`/`*.cardinaltrusted.com` + página do banco). No **SANDBOX** o "desafio" é um `window.confirm(...)`.
   - ⚠️ `beforeChallenge`: se `open()` não for chamado, a promise nunca resolve → sempre chamar `open()`.
3. **Cobrança** `POST /orders` (Bearer, mesmo token): `charges[].payment_method = { type:'DEBIT_CARD', installments:1, capture:true, card:{ encrypted:<blob NOVO com CVV, chave pública do PagBank>, ... }, authentication_method:{ type:'THREEDS', id:'3DS_…' } }`. **Sem `splits`.**
   - O blob `encrypted` é **de uso único** → o cartão é criptografado **duas vezes**: uma pelo SDK (3DS) e outra pelo app (`pagbank_encrypt.dart`, já existente) pra cobrança.
   - **`amount` e `installments` da cobrança têm que ser IGUAIS aos do 3DS**, senão `400 INVALID AUTHENTICATION_METHOD.ID`.
   - Resposta síncrona: `PAID` / `DECLINED` (+ `payment_method.authentication_method.status`, `payment_response`).
4. **Sandbox — cartões de teste 3DS** (o `amount.value` tem que ser igual ao "valor" do cartão): autenticado sem desafio Visa 4000000000002701 (2701), MC 5200000000001005 (1005); **com desafio** MC 5200000000001096 (1096), Visa 4000000000002503 (2503); não autenticado 4000000000002925 (2925). Relatos de 502/500 instáveis no sandbox do 3DS.

## Desenho

### Fluxo (app, débito com `gatewayFor('debit') == 'PAGBANK'`)
1. `_payCard(debit:true)` busca a chave pública (já existe) e abre a **folha do cartão**. Para débito PagBank, a folha devolve, além do `token` (encrypted com CVV) e do `billing`, os **dados crus do cartão só em memória** (`number, expMonth, expYear, holder`) e o endereço **estruturado** (`street`=logradouro, `number`, `complement`=bairro, `city`, `state`, `postalCode`) — tudo que ela já coleta hoje.
2. Cria o pedido (`createOrder`, DEBIT) — inalterado.
3. Pede a sessão: **novo** `POST /api/public/pagbank/3ds-session { orderId }`.
4. Abre a **tela de autenticação** (WebView em tela cheia, header "Confirmação do banco", spinner até o banco aparecer) carregando a **página 3DS hospedada no nosso domínio**; injeta os dados (sessão, env, cartão, valor, cliente, endereço) via JS; recebe o resultado por um canal JS.
5. Resultado:
   - `AUTH_FLOW_COMPLETED` → `createCardOrder(orderId, token, method:'debit', authenticationId: id, billing, customerDocument)` → fluxo atual (paid → `/done`; pending/erro → `/pagamento`; failed → aviso de recusado).
   - `AUTH_NOT_SUPPORTED` / `CHANGE_PAYMENT_METHOD` → aviso: "Esse cartão de débito não pode ser usado aqui. Pague com crédito ou Pix." → volta ao checkout (pedido pendente reaproveitado/substituído pelo `_replacePending` atual).
   - Cancelou / erro / timeout → aviso genérico, pode tentar de novo. **Não cobra.**
6. Dados crus do cartão descartados ao fim (não persistir, não logar).

### Backend (`jurandir`)
- **`POST /api/public/pagbank/3ds-session`** (novo, público como as outras `/api/public`): body `{ orderId }`. Só atende pedido existente, `AWAITING_PAYMENT`, `payment.method = DEBIT`, `payment.provider = PAGBANK` (senão 4xx). Cria a sessão no PagBank (host conforme o modo TEST/PRODUCTION do toggle do admin) e devolve `{ session, env:'SANDBOX'|'PROD', amount:<centavos do total do pedido>, customer:{ name, email, phones? } }` — **o mesmo `amount` e o mesmo cliente que a cobrança vai usar** (`cents(order.total)`, `buildCustomer`).
- **Página 3DS** hospedada no nosso HTTPS (ex.: route handler que devolve HTML estático, fora do middleware de i18n): carrega o SDK do PagBank, expõe uma função `start(params)` chamada pelo app, roda `setUp` + `authenticate3DS` (com `beforeChallenge` chamando `open()` e avisando o app), devolve o resultado (`status`, `id`, ou erro sanitizado) pelo canal JS. **Não envia nada a nenhum servidor além do SDK do PagBank; não loga dados do cartão.**
- **`pagbank.ts`**:
  - `createCardTokenPayment` com `method:'debit'`: deixa de lançar; exige `authenticationId` (sem ele → erro 422 claro). Payload `DEBIT_CARD` + `installments:1` + `capture:true` + `card.encrypted` (+ holder como no crédito) + `authentication_method:{type:'THREEDS', id}`.
  - `createOrder`: **nunca** monta `splits` para `DEBIT_CARD` (hoje sempre chama `buildSplits`).
  - Atualizar o comentário do cabeçalho (débito agora suportado, sem split).
- **Tipos / rota de cartão**: `authenticationId?` em `CardTokenPaymentInput`, no body de `POST /api/public/orders/card` e em `payOrderWithCardToken`.
- **`capabilities.ts`**: `PAGBANK.debit = true` → o painel passa a permitir PagBank no Débito (nada mais muda no painel).
- **Relatório "Repasse Débito"**: `listDebitPayout` passa a incluir `provider ∈ {PAGARME, PAGBANK}` e agrupa por **(bar, gateway)** — uma linha por bar por gateway, com coluna **Gateway**, porque o dinheiro está em contas diferentes. Ajustar o texto "Débitos Pagar.me…" (pt/en) e o espelho no app admin (`DebitPayoutRow` + tela).
- Webhook PagBank e reconciliação: inalterados (já tratam qualquer `CHAR_`).

### Chave geral "Débito PagBank" (decisão do usuário, 2026-10-16)
Problema: o app **já publicado** (build 22) tem o código de cartão PagBank e roteia por `gatewayFor('debit')`. Se um bar escolher PagBank no débito, o app antigo criptografa o cartão e chama `/orders/card` com `method:'debit'` **sem** `authenticationId` → recusa ("Pagamento não aprovado"). O backend não distingue app antigo de novo.
**Decisão:** uma **chave geral no admin**, **desligada por padrão**, que o admin só liga quando o app novo estiver nas lojas. Quem não atualizar depois disso vê recusa no débito desses bares (pode pagar com crédito/Pix) — aceito pelo usuário.
- Persistir no singleton `AppSetting` (como `pagbankMode`/`pagarmeMode`), ex.: `pagbankDebitEnabled Boolean @default(false)` → precisa `prisma db push` (aditivo).
- Desligada ⇒ PagBank **não selecionável** no Débito do painel (a capability efetiva do débito PagBank = `GATEWAY_CAP.PAGBANK.debit && chave ligada`) e `POST /api/public/pagbank/3ds-session` recusa com erro claro (o app novo mostra "débito indisponível no momento, use crédito, Pix ou carteira").
- Controle no admin web, seção **Pagamentos** (onde já ficam os toggles Teste/Produção do Pagar.me e do PagBank).
- Isso também permite o backend ir pra produção (necessário pra página 3DS estar no HTTPS) **antes** do sandbox estar validado e antes de o PagBank liberar a whitelist, sem expor a opção a ninguém.

### Android e iPhone juntos (decisão do usuário, 2026-10-16)
O débito PagBank sai **nas duas plataformas** no mesmo release. Implicações:
- A WebView tem que funcionar no **WKWebView do iOS** também: JS, armazenamento, iframes de `*.cardinalcommerce.com`/`*.cardinaltrusted.com`/banco; atenção a cookies de terceiros (o iOS bloqueia por padrão — o fluxo Cardinal em iframe pode depender deles) e ao `window.confirm` do sandbox (tratar com diálogo nosso nas duas plataformas).
- O usuário **não tem iPhone nem Mac**: o teste no iPhone é via **TestFlight** com alguém que tenha iPhone. O build do iPhone ainda está sendo corrigido para o crash de abertura do iPadOS 27 (builds 24/25 recusados) — o plugin novo entra nesse build; não pode quebrar a abertura do app.
- Plano de teste tem que separar Android (emulador/celular do usuário) e iPhone (TestFlight).

### App (`jurandir-app`)
- Dependência de WebView (o app não tem nenhuma hoje). A WebView precisa: JS + DOM storage, **cookies de terceiros no Android**, não bloquear iframes/navegação de `*.cardinalcommerce.com`, `*.cardinaltrusted.com` e domínios de banco, e **tratar `window.confirm`** (sandbox) com um diálogo nosso — sem handler, o Android responde "não" e o 3DS falha calado.
- Nova tela de autenticação 3DS (descrita no fluxo) + `createCardOrder(..., authenticationId)` + folha do cartão devolvendo os dados extras + texto da folha sem "direto pro Pagar.me".
- Timeout geral na tela (ex.: 5 min) → tratado como erro, sem cobrar.

## Restrições
- **Produção bloqueada hoje:** `POST /orders` em produção → `403 whitelist access required` (homologação pendente; usuário vai pedir liberação + inclusão de débito 3DS e Apple Pay). Validação completa = **sandbox**; produção depois da liberação, com débito real de valor baixo.
- Sandbox do 3DS é instável (relatos de 502/500); desafio no sandbox é só o `window.confirm`.
- Relatos de contas onde o 3DS volta `AUTH_NOT_SUPPORTED` em 100% até o PagBank liberar → pedir confirmação ao PagBank.
- `main` do backend = produção (deploy automático) → trabalhar em branch, push/merge só com OK do usuário. App: push é sempre do usuário.
- Mudanças no backend têm que ser **retrocompatíveis** com o app já publicado: com a chave geral desligada nada muda pra ele (ver "Chave geral").
- Web (QR no navegador): fora do escopo — o débito no checkout web já não funciona com nenhum gateway de cartão do app.

## Decisões tomadas por mim (Claude)
- Página 3DS no **nosso domínio HTTPS** (não HTML local na WebView): origem estável e confiável pro Cardinal, e dá pra corrigir sem build novo do app.
- Dados do cartão entram na página **via injeção JS**, nunca por URL/querystring.
- O **backend** dita `amount` e `customer` do 3DS (evita divergência com a cobrança → `INVALID AUTHENTICATION_METHOD.ID`).
- Relatório agrupado por (bar, gateway).

## Fica a critério de quem implementar
- Pacote de WebView e detalhes de configuração por plataforma.
- Caminho/rota exatos da página 3DS e da sessão; formato exato das mensagens do canal JS.
- Visual da tela de autenticação (seguir o padrão visual do checkout).
- Testes: seguir os padrões de `tests/payments/pagbank.test.ts` (substituir o teste "débito é recusado (PagBank exige 3DS)").
- Evidências do sandbox pra uma nova homologação do PagBank (requests/responses reais), se o PagBank pedir.
