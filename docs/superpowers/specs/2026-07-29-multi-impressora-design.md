# Multi-impressora + comanda de produção sem valor + agente local (Windows/USB)

Data: 2026-07-29
Status: aprovado (implementação em andamento)

## Problema

Hoje a impressão é **1 impressora por estabelecimento** e a comanda **mostra preços**
(Subtotal/Taxa/TOTAL). O bar precisa de **várias impressoras por estação** (Bar, Cozinha…),
cada uma imprimindo **só os itens dela**, em **comandas de produção sem nenhum valor** (o
cliente já pagou no app). O agente que faz a ponte com a impressora **ainda não existe**.

## Decisões (confirmadas com o dono)

- Todas as comandas de produção saem **sem valor** (nem via de caixa).
- O mapa **categoria → impressora** é **configurável no painel** por cada bar.
- Construir também o **agente local**.
- Impressoras são **USB num PC Windows** (não são de rede).

## Arquitetura

A nuvem (Vercel) não fala com a impressora. Um **agente local** (Node) roda no PC do bar,
puxa as comandas pendentes da API, e imprime. Como as impressoras são **USB no Windows**, o
agente manda os bytes ESC/POS em modo **RAW** pelo **spooler do Windows** (via PowerShell
`WritePrinter`, datatype RAW) — **sem dependência nativa** (evita `node-gyp`/ENOSPC). Cada
impressora é identificada pelo **nome dela no Windows**. O modelo já suporta **rede** (TCP
porta 9100) pra outros bares no futuro.

## Modelo de dados

`Printer` (novo):
- `id`, `establishmentId`
- `name` — "Bar", "Cozinha"
- `connection` — "USB" | "NETWORK"
- `target` — USB: nome da impressora no Windows; NETWORK: IP
- `port` — Int, default 9100 (só NETWORK)
- `categories` — String[] (categorias do menu que roteiam pra cá)
- `isDefault` — Boolean (recebe itens sem categoria mapeada)
- `active` — Boolean

`PrintJob` ganha `printerId String?` (+ relation). O token do agente (`printAgentToken`) e o
liga/desliga (`printEnabled`) continuam **1 por estabelecimento** — um agente gerencia todas.
`printerIp` no Establishment vira legado (mantido pra não quebrar, não usado).

## Roteamento (no enqueue)

`enqueuePrintJob(orderId)`:
1. Carrega o pedido + itens; junta `OrderItem.menuItemId → MenuItem.category`.
2. Carrega as impressoras ativas do estabelecimento.
3. Agrupa itens por impressora: a impressora cujo `categories` contém a categoria do item;
   item sem match → impressora `isDefault`.
4. Pra cada impressora com itens → cria um `PrintJob` (com `printerId`) renderizando a
   **comanda de produção sem valor** só com os itens daquela estação.
5. Idempotência passa a ser por **(orderId, printerId)**.

## Comanda de produção (sem valor)

`renderPrepTicket(data)`: cabeçalho com **estação** (nome da impressora, ex.: COZINHA) +
estabelecimento, `Pedido CODE #N`, local, hora, cliente; itens em **destaque** (qtd × nome,
tamanho dobrado); **observação** em caixa; corte. **Sem** subtotal/taxas/total.
O `renderTicket` atual (com preço) fica só pro TEST/legado.

## Agente local (Windows/USB)

Pasta `agent/`:
- `agent.mjs` — Node puro. Config por `config.json` (JURANDIR_URL, PRINT_TOKEN, pollMs).
  Loop: `GET /api/print/jobs` (header `x-print-token`) → pra cada job {id, payloadB64,
  connection, target, port}: decodifica base64 → USB: chama `raw-print.ps1 -Printer target`;
  NETWORK: TCP `target:port` → `POST /api/print/ack` (ok/erro).
- `raw-print.ps1` — P/Invoke `winspool.drv` (OpenPrinter/StartDocPrinter RAW/WritePrinter)
  pra mandar bytes crus pra impressora nomeada.
- `README.md` — como instalar Node, achar o nome da impressora no Windows, configurar e rodar.

## API

`GET /api/print/jobs` passa a devolver, por job: `id, payloadB64, connection, target, port`
(vem do `printer` do job; fallback pro legado quando `printerId` é null).
`POST /api/print/ack` inalterado.

## Painel

Config de impressão vira **lista de impressoras** (add/editar/remover: nome, conexão, alvo,
categorias [multi-select das categorias do menu], padrão, ativo). Mantém: gerar token,
liga/desliga automático, **imprimir teste por impressora**.

## Fora de escopo (agora)

- Via de caixa com preço.
- Empacotar o agente como `.exe`.
- Descoberta automática de impressoras.
