# Apple Pay × multi-gateway (Pagar.me / PagBank)

## TL;DR
- **Pix e cartão**: roteiam por gateway **por estabelecimento**, sem restrição
  (`gatewayPix` / `gatewayCredit` / `gatewayDebit`). Bar A pode usar Pagar.me e
  bar B PagBank ao mesmo tempo. O app descobre o gateway do bar e tokeniza certo.
- **Apple Pay**: é a **exceção**. Por limitação da **Apple** (não do Jurandir),
  cada **Apple Merchant ID** só funciona de forma confiável com **UM** processador.

## Por que o Apple Pay é diferente
O token do Apple Pay é criptografado pela Apple com o **Payment Processing
Certificate** vinculado ao **Merchant ID**. A Apple permite até 2 certificados por
Merchant ID, mas **isso é pra ROTAÇÃO**, não pra dois processadores: a Apple decide
com qual cert criptografar (na prática, o **mais recente**), e você não controla
isso por transação. Logo, com certs de **dois gateways** no mesmo Merchant ID, só
um consegue decriptografar de forma confiável — o outro falha.

## Estado atual (2026-10-01)
- Merchant ID **`merchant.br.app.jurandir`** → cert de **PagBank** (produção).
  Ciclo feito: `POST /wallets/apple-pay/csr` → cert criado na Apple → `.cer`
  enviado em `POST /wallets/apple-pay/cer`. **NÃO regerar o CSR** (rotaciona a
  chave e invalida o cert atual).
- Portanto, **todo Apple Pay vai pro PagBank**. O cert antigo da Pagar.me nesse
  Merchant ID ficou dormente (a Apple usa o mais recente = PagBank); pode ser
  revogado pra deixar estado limpo (opcional).
- Google Pay: amarrado à Pagar.me no build (`PAY_GATEWAY=pagarme`); o PagBank não
  faz Google Pay.

## Como ter Apple Pay por estabelecimento em gateways diferentes (se precisar)
Solução = **um Merchant ID por gateway**:
1. Criar um 2º Apple Merchant ID (ex.: `merchant.br.app.jurandir.pagarme`).
2. Fazer o ciclo do certificado desse gateway nesse Merchant ID (CSR do gateway →
   Apple → `.cer` → gateway). Cada Merchant ID fica com **um** cert.
3. Adicionar **os dois** Merchant IDs no entitlement de Apple Pay do app
   (`com.apple.developer.in-app-payments` aceita vários).
4. No app, escolher o `merchantIdentifier` conforme o `gatewayApplePay` do bar
   (hoje `wallet_config.dart` usa um fixo: `APPLE_MERCHANT_ID`). Precisa expor
   `applePayGateway` por estabelecimento (o backend já manda em `gateways.applePay`)
   e o app selecionar o Merchant ID certo.

Decisão por último: só vale o trabalho se existir motivo real pra um bar usar Apple
Pay pela Pagar.me. Como a migração pro PagBank foi **por causa do antifraude da
Pagar.me no Apple Pay**, o normal é manter **todo Apple Pay no PagBank** (um
Merchant ID) e deixar Pix/cartão no multi-gateway por bar.
