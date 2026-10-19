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
