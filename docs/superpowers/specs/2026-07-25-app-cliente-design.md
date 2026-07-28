# App do Cliente (Fase 4)

O fluxo público mobile-first do cliente: QR → cardápio → checkout → confirmação
→ "meus pedidos". Recriação pixel-perfect de
`design_handoff_jurandir/App do Cliente.dc.html`, já bilíngue (PT/EN).

## Rota

`app/[locale]/[slug]/page.tsx` — rota pública (sem auth), server component.
- `/{slug}?local=…` (PT) e `/en/{slug}?local=…` (EN), conforme `localePrefix: "as-needed"`.
- `slug` é o estabelecimento; `local` (vindo do QR) define o rótulo do lugar
  ("Guarda-sol nº 14"). Segmentos estáticos (`painel`, `login`, `admin`) têm
  prioridade sobre `[slug]`, então não há conflito.
- Sem moldura de celular (o protótipo usa um "phone shell" de demo). O app é uma
  coluna real `max-w-[448px]` centralizada, mobile-first; em desktop aparece como
  um app mobile centralizado sobre o fundo `page`.
- `est` = mock **Quiosque do Mar** (quiosque de praia → `beach = true`).

## Arquitetura

- `lib/data/app.ts` — estabelecimento (conteúdo do tenant, PT), menu (fotos w=600),
  `PM` (ícones/cores próprios: Pix→`smartphone`, USDC→`paid`, Débito→`payments`),
  `CATS`, `CAT_ICON` (Material Symbols, zero-emoji), `POPULAR_NAMES`.
- `lib/app/helpers.ts` — matemática pura: `cartTotal`, `fees` (Jurandir 8% +
  estab. 10%), `shares` (divisão com arredondamento na última parcela),
  `maxInstallments` (só > R$100, mín. R$50/parcela, teto 6, sem juros),
  `makeOrderCode`, tipos `CartLine`/`Share`/`ClientOrder`.
- `components/app/context.tsx` + `ClientApp.tsx` — estado central (step, cart,
  categoria/sub, modo de pagamento, split, pedidos) via Context, espelhando a
  classe `Component` do protótipo em hooks. `paid.length` acompanha `people`
  (ambos em [2, 8]); trocar a contagem reseta os pagamentos.
- Telas em `components/app/screens/`: `QrScreen`, `MenuScreen`, `CheckoutScreen`,
  `DoneScreen`, `MyOrdersScreen`; mais `CartDrawer` e `ClientToast`.

## Pagamento (mock)

- **Pagar tudo:** escolhe método; crédito habilita parcelamento (regras acima).
  O botão processa (`Processando…` 1,4 s) e cria o pedido em `producao`.
- **Dividir conta:** N amigos (2–8), cota igual por pessoa (inclui taxas). Cada um
  paga como quiser. O pedido só vai para a cozinha quando **100% pago**; parcial
  fica `aguardando` e pode ser completado em "Meus pedidos" (`payShare`).
- O pedido guarda um descritor estruturado (`pay` ou `splits`), não uma string —
  o rótulo "Pago via …" / "Dividido · N pessoas" é formatado por `t()` no render.

## i18n (PT + EN)

- Namespace `app` (~100 chaves) em `messages/{pt,en}.json`: todo o chrome de UI,
  com plurais ICU (`resultLabel`, `cartItems`) e rich text (`splitEvenly`,
  `splitFeeNote`, `splitWarn` — plural + `<b>` combinados).
- **Taxonomia** (categorias/subcategorias) reusa os mapas `panel.cat`/`panel.sub`
  — fonte única de verdade, consistente com painel/admin. O estado filtra pela
  chave canônica em PT; só o rótulo é traduzido.
- **Conteúdo do tenant permanece PT** em ambos os locales: nome/tagline/endereço/
  horário do estabelecimento, nomes e descrições de itens, moeda (R$), rótulo do
  local ("Guarda-sol nº 14"), contatos.

## Verificação

Build (rota `ƒ /[locale]/[slug]` dinâmica) + lint limpos. Playwright (viewport
400×860) cobre o fluxo completo em PT — QR → cardápio → busca → carrinho →
checkout (taxas 8%+10%, upsell de sobremesa, observação) → dividir (aviso 100%) →
parcelamento no crédito → pagar → confirmação (código do pedido) → meus pedidos
("Pago") — e o menu em EN. Zero erros de página nos dois idiomas; taxonomia
traduzida (Beverages/Drinks/Beers) com nomes de itens em PT.
