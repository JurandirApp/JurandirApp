# Apple Pay no SITE para bares na Tuna — checklist

Bares cujo gateway do Apple Pay é **TUNA** usam outro Merchant ID da Apple:
`merchant.br.app.jurandir.tuna`. O **Payment Processing Certificate** dele já
existe (foi gerado com o CSR da Tuna, e o app já usa). Para o **site** falta o
**Merchant Identity Certificate** desse merchant (é ele que o nosso servidor usa
na validação do comerciante, `POST /api/public/applepay/session`, com
`merchant: "tuna"`), mais o domínio registrado nesse merchant.

Enquanto `APPLE_PAY_TUNA_MERCHANT_CERT` / `APPLE_PAY_TUNA_MERCHANT_KEY` não
existirem na Vercel, o botão do Apple Pay **não aparece** nos bares da Tuna
(`appleTunaCertReady = false`). Nada muda para Pagar.me/PagBank.

## 1. Gerar chave + CSR (fora do repositório)

```bash
cd "D:/Projetos 2.0/Jurandir"        # NUNCA dentro do repo
openssl req -new -newkey rsa:2048 -nodes \
  -keyout applepay_tuna_identity.key \
  -out applepay_tuna_identity.csr \
  -subj "/CN=merchant.br.app.jurandir.tuna/C=BR"
```

Guarde o `.key`: ele não pode ser regenerado e é o par do certificado.

## 2. Portal da Apple (manual)

1. developer.apple.com → Certificates, Identifiers & Profiles → **Identifiers**
   → filtro **Merchant IDs** → `merchant.br.app.jurandir.tuna`.
2. Em **Apple Pay Merchant Identity Certificate** → **Create Certificate** →
   envie `applepay_tuna_identity.csr` → **Download** (`merchant_id.cer`).
   (Não confundir com o **Payment Processing Certificate**, que é o da Tuna e
   NÃO deve ser recriado: recriar quebra o Apple Pay do app.)
3. Ainda nesse Merchant ID → **Merchant Domains** → **Add Domain** →
   `jurandir.app.br` → baixe o arquivo de associação (ver seção 4) → depois do
   deploy clique **Verify**.

## 3. Converter para PEM e configurar a Vercel

```bash
openssl x509 -inform der -in merchant_id.cer -out applepay_tuna_identity.pem
base64 -w0 applepay_tuna_identity.pem   # → APPLE_PAY_TUNA_MERCHANT_CERT
base64 -w0 applepay_tuna_identity.key   # → APPLE_PAY_TUNA_MERCHANT_KEY
```

Vercel → Project → Settings → Environment Variables (Production):

| Variável | Valor |
|---|---|
| `APPLE_PAY_TUNA_MERCHANT_CERT` | base64 de uma linha do PEM do certificado (secreto) |
| `APPLE_PAY_TUNA_MERCHANT_KEY` | base64 de uma linha da chave privada (secreto) |
| `APPLE_PAY_TUNA_MERCHANT_ID` | opcional; padrão `merchant.br.app.jurandir.tuna` |

`APPLE_PAY_DOMAIN` (ou o host de `APP_BASE_URL`) é compartilhado com o merchant
padrão: tem de ser `jurandir.app.br`. Redeploy depois de salvar.

Teste: Safari (iPhone/Mac com cartão na Wallet) → `https://jurandir.app.br/<slug-de-um-bar-tuna>`
→ checkout → o botão Apple Pay aparece; ao tocar, a folha abre (validação OK).
Falha na validação aparece nos logs da Vercel como
`[applepay/session] apple status … (merchant tuna)`.

## 4. Arquivo de associação de domínio — o que deu e o que não deu para confirmar

**Como é servido hoje:** arquivo estático
`public/.well-known/apple-developer-merchantid-domain-association`, servido pela
Vercel em `https://jurandir.app.br/.well-known/apple-developer-merchantid-domain-association`
(o `proxy.ts` do next-intl ignora caminhos com ponto, então não há
redirecionamento de idioma nesse caminho).

**Atenção — confirmado no repositório:** o arquivo commitado é um **PLACEHOLDER**
(texto pedindo para colar o arquivo gerado no Mercado Pago). Ou seja, pelo
repositório, o domínio **não** está verificado nem para o merchant padrão — a não
ser que a verificação tenha sido feita com um arquivo nunca commitado. Conferir
abrindo a URL acima em produção e o status em *Merchant Domains* no portal.

**Dois merchants no mesmo domínio:** só existe UM arquivo nesse caminho fixo.
- A Apple permite registrar o mesmo domínio em mais de um Merchant ID.
- **Não consegui confirmar** se o arquivo baixado para
  `merchant.br.app.jurandir.tuna` é idêntico ao de `merchant.br.app.jurandir`.
  Relatos indicam que o arquivo é emitido por conta (team) de desenvolvedor e se
  repete entre merchants da mesma conta, mas isso não está documentado pela Apple.
- Como verificar: baixe os dois arquivos (seção 2, passo 3, em cada Merchant ID)
  e compare (`fc /b a b` no Windows ou `cmp a b`).
  - **Iguais:** commite esse conteúdo no lugar do placeholder, deploy, e clique
    **Verify** nos dois merchants.
  - **Diferentes:** não dá para servir os dois no mesmo caminho. Opções: (a)
    verificar um merchant, depois trocar o arquivo e verificar o outro (a Apple
    revalida o domínio periodicamente, então o primeiro pode cair depois —
    arriscado); (b) servir o site dos bares Tuna num subdomínio próprio (ex.:
    `tuna.jurandir.app.br`) com o arquivo da Tuna — exige que a página E o
    `initiativeContext` usem esse host (hoje há um único `APPLE_PAY_DOMAIN`;
    precisaria de um `APPLE_PAY_TUNA_DOMAIN`, não implementado).

## 5. Como a cobrança funciona (já implementado)

- `walletWebConfig`: gateway Apple Pay = TUNA + `appleTunaCertReady` + domínio →
  `applePay.merchant = "tuna"`, `merchantIdentifier = merchant.br.app.jurandir.tuna`.
- `WalletButtons` manda `merchant` na validação; o servidor escolhe o
  certificado (`APPLE_PAY_TUNA_MERCHANT_*`). Merchant `tuna` sem certificado →
  503 (nunca usa o certificado padrão).
- O token (`event.payment.token`) segue o caminho de carteira existente:
  `chargeWalletAction` → `payOrderWithWallet` → Tuna `createWalletPayment`
  (`walletType: "apple_pay"`, `tokenProvider: "ApplePay"`, token = `paymentData`).
