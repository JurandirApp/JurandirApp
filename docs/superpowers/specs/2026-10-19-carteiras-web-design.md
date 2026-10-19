# Apple Pay e Google Pay no site — Design

**Data:** 2026-10-19 · **Status:** aprovado pelo usuário ("pode implementar"; pediu aviso discreto de que Apple Pay é só crédito)

## Intenção
O cliente que pede pelo **site** (QR no navegador, `app/[locale]/[slug]`) também pode pagar com **Apple Pay** e **Google Pay**, dentro da página (sem redirecionar), pelo gateway que o bar escolheu pra carteira no painel (Pagar.me ou PagBank). Hoje só o app tem carteira; o site só tem Pix e crédito hospedado.

## Fatos da documentação (2026-10-19)
- Pagar.me: Google Pay web ✅ (`docs.pagar.me/docs/google-pay-tm-guide`, gateway `pagarme`, `gatewayMerchantId` = conta `acc_…`, Visa/Master na Stone); Apple Pay web ✅ (`/docs/apple-pay-1`: registrar domínio + Merchant Identity Certificate).
- PagBank: Google Pay web ✅ (guia do SDK carrega `pay.js`, gateway `pagbank`, `gatewayMerchantId` = `ACCO_…` da conta); Apple Pay web ✅ (manda seguir "Apple Pay on the Web"); redes Visa/Master no Apple Pay.
- **Carteira = crédito** nos dois (PagBank: `type = CREDIT_CARD`; Pagar.me: só fala em crédito). Débito pela carteira não documentado.

## Decisões
- **Do usuário:** fazer os dois (Apple Pay + Google Pay no site); **aviso discreto "Somente crédito"** junto das carteiras.
- **Minhas (Claude):**
  - Aviso vale pros dois botões (a doc diz que as duas carteiras cobram como crédito). No Apple Pay também restrinjo de verdade: `merchantCapabilities: ["supports3DS", "supportsCredit"]` (a folha da Apple só oferece cartões com função crédito). No Google Pay não existe filtro de débito → só o aviso.
  - Carteiras ficam num bloco próprio **acima** da grade de métodos (não viram novos `PayId`) — o pedido é criado como `CREDIT` (igual ao app), então "Pago via Crédito", relatórios e KPIs não mudam.
  - Só no modo **pagamento inteiro** (não no dividir conta).
  - Fluxo resiliente igual ao app: com o token em mãos, (1) cria o pedido `CREDIT` **sem** checkout hospedado e guarda o id no navegador, (2) cobra por `orderId` (idempotente, `resolveChargeableOrder`). Timeout/erro depois de criar → acompanhamento em "Meus pedidos" (polling já existe).
  - Configuração das carteiras é **calculada no servidor** (env + modo do gateway no admin) e entregue à página — sem `NEXT_PUBLIC_*`, sem build novo pra trocar.
  - Google Pay `environment`: `PRODUCTION` só quando o gateway da carteira está em Produção no admin **e** `GOOGLE_PAY_MERCHANT_ID` existe; senão `TEST`.
  - Apple Pay: `ApplePaySession` nativo do Safari (sem SDK), versão 3; validação do comerciante no NOSSO backend com o Merchant Identity Certificate (mTLS), aceitando só `validationURL` de domínio da Apple (anti-SSRF).
  - Redes: Pagar.me `VISA, MASTERCARD`; PagBank Google Pay `VISA, MASTERCARD, ELO`; Apple Pay `visa, masterCard` (os dois).
  - App: o mesmo aviso "Somente crédito" ao lado de Apple Pay/Google Pay no checkout do app, no próximo build.

## Não-objetivos
Débito pela carteira; carteira no dividir conta; mudar a cobrança de carteira no backend (`payOrderWithWallet`/providers ficam como estão); Mercado Pago.

## Anti-objetivos
- Chave privada do certificado da Apple chegar ao navegador ou a log.
- O endpoint de validação virar proxy pra qualquer URL.
- Cobrar sem o pedido existir antes (pagamento fantasma) ou cobrar duas vezes o mesmo pedido.
- Botão de carteira aparecer onde não funciona (sem Safari/Apple Pay; bar sem gateway de carteira pronto; config ausente).

## Configuração (env na Vercel)
- Apple: `APPLE_PAY_MERCHANT_ID` (default `merchant.br.app.jurandir`), `APPLE_PAY_DISPLAY_NAME` (default `Jurandir`), `APPLE_PAY_DOMAIN` (default = host de `APP_BASE_URL`), `APPLE_PAY_MERCHANT_CERT` e `APPLE_PAY_MERCHANT_KEY` (PEM em base64 — secretos). Sem cert/key → Apple Pay não aparece.
- Google: `GOOGLE_PAY_MERCHANT_ID` (console do Google Pay, ex. `BCR2DN5TXWS3FZBW`), `GOOGLE_PAY_PAGARME_GATEWAY_MERCHANT_ID` (`acc_…`), `GOOGLE_PAY_PAGBANK_GATEWAY_MERCHANT_ID` (`ACCO_…`). Sem o `gatewayMerchantId` do gateway do bar → Google Pay não aparece pra esse bar.

## Passos do usuário (fora do código)
1. Apple Developer → Merchant ID `merchant.br.app.jurandir` → **Merchant Domains**: adicionar `jurandir.app.br`, baixar o arquivo e substituir `public/.well-known/apple-developer-merchantid-domain-association` (eu faço o commit).
2. Apple Developer → mesmo Merchant ID → **Apple Pay Merchant Identity Certificate**: subir o CSR que eu gero, baixar o `.cer` (eu converto e te passo o valor pra Vercel).
3. Google Pay & Wallet Console → adicionar o site `jurandir.app.br` e enviar pra aprovação (até aprovar, só `TEST`).
4. Colar as env vars na Vercel e fazer redeploy.
