# Deploy no Vercel — Jurandir

App Next.js único (front + back). O banco é Neon (já na nuvem). Só configurar e subir.

## 1. Build — já ajustado ✅
O `package.json` já roda `prisma generate && next build` (o Vercel precisa gerar o client do Prisma). Nada a fazer.

## 2. Subir o projeto
- Suba o código pro GitHub e, no Vercel, **New Project → importe o repositório**. O root do projeto é a pasta `jurandir/` (aponte o "Root Directory" pra ela se o repo tiver mais coisa em volta).
- Framework: **Next.js** (detecta sozinho). Build Command / Output: deixa o padrão.

## 3. Variáveis de ambiente (Vercel → Settings → Environment Variables)
Cole cada uma. **Os valores secretos você copia do seu `.env` local** — não estão aqui de propósito.

| Variável | Valor |
|---|---|
| `DATABASE_URL` | copie do `.env` (Neon **pooled**, com `pgbouncer=true`) |
| `DIRECT_URL` | copie do `.env` (Neon **direct**) |
| `AUTH_SECRET` | copie do `.env` |
| `MP_BASE_URL` | `https://api.mercadopago.com` |
| `MP_CLIENT_ID` | copie do `.env` |
| `MP_CLIENT_SECRET` | copie do `.env` |
| `MP_ACCESS_TOKEN` | copie do `.env` (o `APP_USR-…` de **produção**) |
| `MP_WEBHOOK_SECRET` | copie do `.env` (pode deixar vazio por enquanto) |
| `CLOUDINARY_CLOUD_NAME` | copie do `.env` |
| `CLOUDINARY_API_KEY` | copie do `.env` |
| `CLOUDINARY_API_SECRET` | copie do `.env` |
| **`APP_BASE_URL`** | **`https://jurandir.app.br`** (domínio de produção) |
| **`MP_REDIRECT_URI`** | **`https://jurandir.app.br/api/payments/mercadopago/callback`** |
| `PAGBANK_BASE_URL` | Production: `https://api.pagseguro.com` · Preview: `https://sandbox.api.pagseguro.com` |
| `PAGBANK_TOKEN` | Production: token da conta PagBank (Vendas → Integrações) · Preview: token do Portal do Desenvolvedor |
| `PAGBANK_PLATFORM_ACCOUNT_ID` | `ACCO_…` da conta da plataforma (recebe a comissão no split). Vazio = sem split |
| `PAGBANK_CLIENT_ID` / `PAGBANK_CLIENT_SECRET` | da aplicação Connect (criada uma vez com `POST /oauth2/application`) |
| `PAGBANK_REDIRECT_URI` | `https://jurandir.app.br/api/payments/pagbank/callback` (igual ao cadastrado na aplicação) |

> **Opcionais** (não precisa em produção): `MP_TEST_PUBLIC_KEY`, `MP_TEST_ACCESS_TOKEN` (só sandbox) e todas as `ASAAS_*` (Asaas não é mais usado — MP é o gateway fixo).

### Carteiras no site (Apple Pay / Google Pay — só crédito)
Sem estas variáveis os botões simplesmente não aparecem (o resto do checkout segue igual).

| Variável | Significado |
|---|---|
| `APPLE_PAY_MERCHANT_ID` | Merchant ID da Apple (padrão `merchant.br.app.jurandir`) |
| `APPLE_PAY_DISPLAY_NAME` | Nome mostrado na folha do Apple Pay (padrão `Jurandir`) |
| `APPLE_PAY_DOMAIN` | Domínio verificado na Apple (`jurandir.app.br`; se vier URL, vale só o host). Padrão: host do `APP_BASE_URL`. O botão só aparece nesse domínio |
| `APPLE_PAY_MERCHANT_CERT` | **Secreto.** Merchant Identity Certificate da Apple, PEM em base64 numa linha |
| `APPLE_PAY_MERCHANT_KEY` | **Secreto.** Chave privada desse certificado, PEM em base64 numa linha |
| `GOOGLE_PAY_MERCHANT_ID` | Merchant ID do console do Google Pay & Wallet (ex. `BCR2DN…`). Sem ele o Google Pay nunca roda em PRODUCTION |
| `GOOGLE_PAY_PAGARME_GATEWAY_MERCHANT_ID` (+ `_TEST`) | `gatewayMerchantId` do Pagar.me (conta `acc_…`). O `_TEST` vale quando o Pagar.me está em TEST no admin (cai no sem sufixo se não existir) |
| `GOOGLE_PAY_PAGBANK_GATEWAY_MERCHANT_ID` (+ `_TEST`) | `gatewayMerchantId` do PagBank (conta `ACCO_…`). Mesma regra do `_TEST` pelo modo do PagBank no admin |
| `GOOGLE_PAY_TEST_SLUGS` | Slugs de bares (separados por vírgula) que veem o Google Pay em TEST. Os demais só veem em PRODUCTION (gateway em Produção + `GOOGLE_PAY_MERCHANT_ID`) |

> **Têm que bater:** `PAGARME_GOOGLE_PAY_MERCHANT_ID` = `GOOGLE_PAY_MERCHANT_ID` e `PAGARME_APPLE_PAY_MERCHANT_ID` = `APPLE_PAY_MERCHANT_ID` — as `PAGARME_*` vão no payload da cobrança do Pagar.me e dizem qual merchant/certificado usar pra descriptografar o token.

**Certificado da Apple (Merchant Identity):** a Apple entrega `merchant_id.cer` em DER. Converta com `openssl x509 -inform der -in merchant_id.cer -out merchant_id.pem`, gere o base64 de uma linha de cada PEM (certificado e chave privada), por exemplo `base64 -w0 merchant_id.pem`, e cole em `APPLE_PAY_MERCHANT_CERT` / `APPLE_PAY_MERCHANT_KEY`. Nunca commitar esses arquivos. A verificação do domínio está em `public/.well-known/README.md`.

### Sobre as 2 últimas (a URL de produção)
O domínio de produção é **`https://jurandir.app.br`** (apontado pro Vercel via DNS). Use ele nas duas — é pra lá que o cliente volta depois de pagar (back_urls) e é o callback do OAuth do marketplace.

### Tuna (Pix, cartões e carteiras com split)
O ambiente da Tuna (Teste/Produção) é escolhido no **admin → Pagamentos → Tuna** (padrão Teste; sem deploy, e a troca vale em até ~30 s, porque cada instância do servidor guarda o modo em cache por 30 s). Por isso cadastre as variáveis com e sem `_TEST` no ambiente **Production** da Vercel: o admin é que decide qual usar.

> **Ordem de deploy:** as colunas da Tuna têm que existir no banco **antes** de subir este código: o valor `TUNA` no enum `PaymentProvider`, os campos `Establishment.tuna*` e `AppSetting.tunaMode` / `AppSetting.tunaCardsEnabled`. Já foram aplicadas no Neon em 2026-10-26; num banco novo, aplique antes do deploy.

- **Credenciais (`TUNA_ACCOUNT` / `TUNA_APPTOKEN`) NÃO caem no sem sufixo.** Em Teste o servidor lê **só** `TUNA_ACCOUNT_TEST` / `TUNA_APPTOKEN_TEST` (a conta `-homolog`); em Produção, só `TUNA_ACCOUNT` / `TUNA_APPTOKEN`. Motivo: a homologação da Tuna usa **os mesmos hosts** da produção, e quem define o ambiente é a conta. Se Teste usasse a credencial de produção, "Teste" faria cobranças e cadastros **reais**. Sem as `_TEST`, toda chamada à Tuna em Teste falha antes de sair do servidor e **nada é cobrado** (o mesmo vale pra Produção sem as credenciais sem sufixo).
- **Hosts (`TUNA_ENGINE_URL` / `TUNA_TOKEN_URL`)**: em Teste lê `NOME_TEST` e cai no `NOME` se o `_TEST` não existir; em Produção lê só `NOME`. Sem nenhum, usa o padrão abaixo.
- **Os segredos de webhook seguem uma terceira regra** (ver abaixo).

| Variável | Significado |
|---|---|
| `TUNA_ACCOUNT` (+ `_TEST`) | **Secreto.** Conta da Tuna (header `x-tuna-account`). Sem sufixo = conta principal (Produção); `_TEST` = conta `-homolog`, **obrigatória pra Teste funcionar** (sem fallback). Console → Settings → Integration |
| `TUNA_APPTOKEN` (+ `_TEST`) | **Secreto.** App token da Tuna (header `x-tuna-apptoken`), de cada conta, com a mesma regra (o `_TEST` é obrigatório pra Teste). Fica só no servidor — nunca vai pro app nem pro site |
| `TUNA_ENGINE_URL` (+ `_TEST`) | Host da API de pagamento e de cadastro (merchant). Padrão `https://engine.tunagateway.com` — só preencha se a Tuna indicar outro host |
| `TUNA_TOKEN_URL` (+ `_TEST`) | Host da API de token (o app/site manda o cartão direto pra ele, com a sessão gerada no servidor). Padrão `https://token.tunagateway.com` |
| `TUNA_WEBHOOK_SECRET` | **Secreto.** Segredo Bearer do webhook de **pagamento** — conta de produção |
| `TUNA_WEBHOOK_SECRET_TEST` | **Secreto.** Segredo Bearer do webhook de **pagamento** — conta `-homolog` |
| `TUNA_MERCHANT_WEBHOOK_SECRET` | **Secreto. OBRIGATÓRIO antes de ligar a Tuna em Produção.** Segredo Bearer do webhook de **cadastro do bar (merchant)** — conta de produção |
| `TUNA_MERCHANT_WEBHOOK_SECRET_TEST` | **Secreto.** Segredo Bearer do webhook de **cadastro do bar (merchant)** — conta `-homolog` |
| `TUNA_MERCHANT_CONDITION` | Chave do plano de taxas (`condition`) que a Tuna informar. Vale pros dois ambientes (sem `_TEST`). **Sem ela o cadastro do bar na Tuna não roda** (o painel mostra "Cadastro na Tuna indisponível no momento.") |
| `TUNA_MERCHANT_MCC` | MCC usado no cadastro do bar. Padrão `5812` (restaurantes). Vale pros dois ambientes (sem `_TEST`) |
| `TUNA_TEST_CPF` | CPF (só os dígitos contam) mandado como documento do cliente **só em Teste**: quando o pedido não tem CPF/CNPJ válido do pagador (11 ou 14 dígitos) e **sempre** nos pagamentos por carteira (Apple Pay / Google Pay), que não mandam documento. Em Produção, nesses casos o documento é simplesmente omitido (nunca inventamos CPF) |
| `TUNA_TEST_SLUGS` | Slugs dos bares, separados por vírgula (espaços e maiúsculas/minúsculas são ignorados), que enxergam a Tuna enquanto ela está em **Teste** (card de cadastro no painel e a Tuna como opção nos métodos). Os outros bares não veem a Tuna em Teste; vazio = nenhum bar vê. Em Produção a Tuna aparece pra todos e esta variável é ignorada |

**Segredos de webhook (como funcionam):**
- Produção e homologação postam nas **mesmas URLs**. O servidor compara o `Authorization: Bearer <segredo>` com os **dois** segredos (`NOME` e `NOME_TEST`, lado a lado — aqui não existe o "cai no sem sufixo"): o que bater define de qual ambiente veio a notificação. Nenhum bateu → `401`.
- **O segredo de produção e o de teste TÊM que ser diferentes.** Se forem iguais, toda notificação conta como PRODUÇÃO.
- Gere cada segredo como um valor aleatório longo (ex.: `openssl rand -hex 32`) e cole o MESMO valor na Vercel e no Console da Tuna da conta correspondente (produção ou `-homolog`). Se configurar o segredo de um ambiente, configure o do outro também; senão as notificações do outro ambiente levam `401`.
- **No Console, escolha a autorização por Bearer / header `Authorization`**, não "header customizado": o servidor só lê o `Authorization`. O header que chega tem que ser `Authorization: Bearer <segredo>` (só `<segredo>`, sem o prefixo, também é aceito). Se o Console já coloca o prefixo `Bearer`, cole **só o segredo**; senão o header vira `Bearer Bearer <segredo>` e toda notificação leva `401`.
- **Sem nenhum segredo configurado**, toda notificação é aceita. A exceção é o webhook de cadastro (merchant): com a Tuna em **Produção** e sem segredo de merchant, ele responde `401` a tudo, e os bares ficam presos em "em análise". Por isso **`TUNA_MERCHANT_WEBHOOK_SECRET` é obrigatório antes de virar a Tuna pra Produção.**
- O corpo do webhook de pagamento nunca marca pedido como pago: o servidor sempre re-consulta o status do pagamento na Tuna. O webhook de cadastro não tem API pra re-consultar, então quem o protege é o segredo (mais um motivo pra ele ser obrigatório em produção).

**URLs de webhook a cadastrar no Console da Tuna** (Console → Settings → Webhook, nas duas contas — produção e `-homolog` —, cada uma com o seu segredo):
```
Pagamento:           https://jurandir.app.br/api/webhooks/tuna
Cadastro (merchant): https://jurandir.app.br/api/webhooks/tuna/merchant
```
(O de pagamento também vai em cada cobrança, montado a partir do `APP_BASE_URL`; cadastre no Console mesmo assim.)

> **⚠️ Ordem de liberação — "Cartões e carteiras pela Tuna" (admin → Pagamentos):** deixe **DESLIGADO** até o app e o site com a tokenização da Tuna serem a versão publicada nas lojas. Versões antigas do app instaladas nos celulares não conseguem tokenizar o cartão na Tuna, e os pedidos de cartão delas pela Tuna seriam recusados como "não aprovado". Com a chave desligada, a Tuna só serve Pix (que funciona no app e no site atuais).
>
> **Cadastro do bar é por ambiente:** cadastros feitos com a Tuna em Teste não valem em Produção. Ao virar pra Produção, cada bar precisa se cadastrar de novo (e esperar a aprovação da Tuna, até 48 h).
>
> **Trocar o modo da Tuna ou DESLIGAR os cartões devolve os bares que deixaram de estar prontos pro gateway padrão, automaticamente**, só nos métodos afetados: Mercado Pago no Pix, crédito e débito; Pagar.me no Apple Pay e no Google Pay. Exemplos: ao virar pra Produção, todo bar cadastrado só em Teste sai da Tuna em todos os métodos; ao desligar os cartões, saem crédito, débito e carteiras, e o Pix pela Tuna continua. O admin mostra quantos bares mudaram. **Nada volta sozinho pra Tuna:** quando o bar estiver pronto de novo (cadastro aprovado no modo atual, ou cartões religados), ele precisa escolher a Tuna outra vez no painel. Além disso, cada cobrança confere a prontidão na hora: um bar que não está pronto no modo atual é recusado antes de qualquer chamada à Tuna.
>
> **⚠️ Sem rollback depois da primeira linha com `TUNA`:** assim que qualquer linha do banco guardar o provedor `TUNA` (a rota de um bar, um pagamento ou uma parte de conta dividida), **NÃO** volte o deploy pra uma versão sem a Tuna. O Prisma Client dessa versão não conhece o valor `TUNA` do enum e quebra ao ler essas linhas, o que derruba, por exemplo, a listagem de bares. Tirar a Tuna das rotas dos bares não resolve: os pagamentos e as partes já gravados continuam com `TUNA`.

## 4. Registrar o Redirect URI no Mercado Pago
No painel do MP → app **JurandirDev** → **Configurações da aplicação** → **Redirect URIs**, adicione **exatamente** o mesmo valor do `MP_REDIRECT_URI`:
```
https://jurandir.app.br/api/payments/mercadopago/callback
```
(Tem que bater caractere por caractere, incluindo o `https://`.)

## 5. Testar o marketplace split
1. Login no painel de um bar → **Config → Pagamentos → Conectar Mercado Pago**.
2. Autoriza logado como a **Conta Teste Vendedor** do MP.
3. Volta conectado → pedidos passam a cair na conta do bar (95%) e a comissão (5%) na plataforma.

## Notas
- **Agente de impressão** roda **local** (na máquina do bar), não no Vercel — só aponta o `JURANDIR_API_URL` dele pra URL do deploy.
- **Webhook do MP**: o `notification_url` já aponta pra `APP_BASE_URL/api/webhooks/mercadopago`. Em produção o MP passa a chamar esse endpoint (hoje a confirmação também roda por polling).
- **Migrations**: o schema já está no Neon (via `prisma db push`). Se mudar o schema depois, roda `npx prisma db push` apontando pro mesmo banco.
