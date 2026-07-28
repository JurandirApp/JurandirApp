# Impressora térmica — agente local (ESC/POS de rede) — Design

**Data:** 2026-07-27
**Status:** Aprovado (arquitetura: agente local) — pronto para plano de implementação

## Objetivo

Imprimir a **comanda do pedido** numa impressora térmica de rede (ESC/POS, porta 9100) no
estabelecimento, quando o pedido é confirmado. Como o app roda na nuvem e a impressora fica na LAN
do bar, a ponte é feita por um **agente local** que puxa jobs da nuvem e envia ao equipamento.

## Escopo

**Dentro (MVP):**
- Fila de impressão na nuvem (`PrintJob`) + gatilho ao pedido entrar em `IN_PRODUCTION`.
- Renderizador ESC/POS puro (`renderTicket`) — a nuvem produz os bytes; o agente é "burro".
- Endpoints: `GET /api/print/jobs` (agente puxa) e `POST /api/print/ack` (confirma), autenticados por token do agente.
- Agente local: um script Node (`agent/jurandir-print-agent.mjs`) só com built-ins.
- Config no admin: gerar/rotacionar o **token do agente**, campo **IP da impressora**, botão **"imprimir teste"**, flag `printEnabled`.

**Fora (adiado — explícito):**
- Teste físico com impressora real (o usuário não tem; só o cliente dele) → validação por bytes/preview.
- Empacotar o agente como instalador/.exe (roda via `node` por ora).
- Múltiplas impressoras por estabelecimento, monitoramento de status/online, gaveta de dinheiro, logo/imagem na comanda, reimpressão manual pela UI.
- Impressão via navegador (Web Serial/ePOS) e serviços pagos (PrintNode) — descartados na fase de design.

## Global Constraints

- **Next.js 16.2.11** (App Router, route handlers). Não rodar `npm run build` com o `dev` do usuário no :3000.
- **Sem git**; verificação por `tsc --noEmit` + `npm run lint` + `npm test`.
- Sem novas dependências no app nem no agente (usar built-ins: `net`, `fetch` global do Node 18+).
- Segredos (token do agente) só no servidor; o token é per-estabelecimento e opaco.
- Comanda em pt-BR; acentos normalizados (sem diacríticos) no MVP para segurança de code page — CP850 fica como melhoria.
- Dinheiro em pt-BR (`money`/centavos como no resto do app).

## Arquitetura (unidades e limites)

1. **`lib/print/escpos.ts`** — `renderTicket(ticket: TicketData): Uint8Array`. Função **pura** (sem I/O), única que conhece o protocolo ESC/POS. Testável por bytes.
2. **`lib/print/ticket.ts`** — `orderToTicket(order): TicketData`: monta o modelo de comanda a partir do pedido (código, itens, local, totais, hora).
3. **`lib/db/print.ts`** — `enqueuePrintJob(orderId)`, `takePendingJobs(establishmentId, limit)`, `ackJob(jobId, ok, error?)`. Fila idempotente.
4. **`app/api/print/jobs/route.ts`** (GET) e **`app/api/print/ack/route.ts`** (POST) — autenticam pelo header `x-print-token`, resolvem o estabelecimento pelo token.
5. **`lib/actions/admin.ts`** — `setPrinterConfigAction`, `regeneratePrintTokenAction`, `testPrintAction` (todas `assertAdmin`).
6. **`agent/jurandir-print-agent.mjs`** — loop de polling + envio TCP; config por env.

## Schema (Prisma)

```prisma
enum PrintJobStatus { PENDING  PRINTED  FAILED }
enum PrintJobKind   { ORDER  TEST }

model PrintJob {
  id              String         @id @default(cuid())
  establishmentId String
  establishment   Establishment  @relation(fields: [establishmentId], references: [id], onDelete: Cascade)
  orderId         String?
  kind            PrintJobKind   @default(ORDER)
  status          PrintJobStatus @default(PENDING)
  payloadB64      String         @db.Text // bytes ESC/POS em base64
  attempts        Int            @default(0)
  error           String?
  createdAt       DateTime       @default(now())
  printedAt       DateTime?

  @@index([establishmentId, status])
}

model Establishment {
  // ...existentes...
  printAgentToken String?  @unique
  printerIp       String?
  printEnabled    Boolean  @default(false)
  printJobs       PrintJob[]
}
```
Migração via `prisma db push` (aditivo), como nas fases anteriores.

## Renderizador ESC/POS (`lib/print/escpos.ts`)

```ts
export type TicketData = {
  establishment: string;
  code: string;
  number: number;
  location: string;      // mesa/guarda-sol
  customer?: string;
  timeLabel: string;     // "14:32"
  items: { qty: number; name: string; total: number }[]; // total em número (R$)
  subtotal: number; platformFee: number; serviceFee: number; total: number;
  note?: string;
};

export function renderTicket(t: TicketData): Uint8Array;
```
Sequência: `ESC @` (init) → título centralizado em corpo duplo (nome + "COMANDA") → código/nº/hora/local/cliente
→ linha → itens (`qty x nome ....... R$`) → linha → subtotal/taxa Jurandir/taxa serviço/**TOTAL** em negrito
→ observação (se houver) → avanço de papel → **corte** (`GS V 0`). Texto normalizado sem diacríticos (helper `ascii()`).
Comandos concretos: init `1B 40`, center `1B 61 01`, left `1B 61 00`, bold on/off `1B 45 01/00`,
double-size `1D 21 11` / normal `1D 21 00`, feed n `1B 64 n`, cut `1D 56 00`.

## Fila (`lib/db/print.ts`)

- `enqueuePrintJob(orderId)`: carrega o pedido + estabelecimento; **só enfileira se `printEnabled`**; **idempotente** (não cria se já existe `PrintJob` `kind=ORDER` para esse `orderId`). Renderiza via `orderToTicket` + `renderTicket`, grava `payloadB64`.
- `takePendingJobs(establishmentId, limit=5)`: retorna jobs `PENDING` (ordem `createdAt`).
- `ackJob(jobId, ok, error?)`: `ok` → `PRINTED` + `printedAt`; senão `attempts++`, grava `error`; ao atingir `attempts>=5` → `FAILED`.

## Gatilho

Chamar `enqueuePrintJob(orderId)` quando o pedido entra em produção:
- em `confirmChargePaid` (após virar `IN_PRODUCTION`);
- em `createOrder`, no caminho simulado que já nasce `IN_PRODUCTION`.
Idempotência garante que reprocessos não dupliquem.

## Endpoints (autenticados por `x-print-token`)

- **`GET /api/print/jobs`** → resolve estabelecimento pelo header `x-print-token` (senão 401); devolve `{ jobs: [{ id, payloadB64 }] }` (PENDING, limite 5).
- **`POST /api/print/ack`** → header `x-print-token` + body `{ jobId, ok, error? }` → valida que o job pertence ao estabelecimento do token → `ackJob`.
Ambos respondem rápido; erros não vazam detalhe. O token é o segredo (opaco, per-estabelecimento).

## Agente local (`agent/jurandir-print-agent.mjs`)

Node puro (built-ins `net`, `fetch`, `Buffer`). Config por env (arquivo `.env` ao lado):
```
JURANDIR_API_URL=https://<seu-deploy>        # ou http://<ip-do-dev>:3000 na rede local
PRINT_AGENT_TOKEN=<token gerado no admin>
PRINTER_IP=192.168.0.50
PRINTER_PORT=9100                              # padrão ESC/POS
POLL_MS=3000
```
Loop: a cada `POLL_MS`, `GET /api/print/jobs` (header `x-print-token`) → para cada job: `net.connect(PRINTER_PORT, PRINTER_IP)`, escreve `Buffer.from(payloadB64, "base64")`, fecha → `POST /api/print/ack` com `ok`/erro. Log simples no stdout. Reconecta/segue em erro (o job continua PENDING até `ack ok`). Um `README.md` no `agent/` explica como rodar (`node jurandir-print-agent.mjs`).

## Config no admin

Na `CadastrosSection` (ou modal do estabelecimento): campo **IP da impressora**, botão **Gerar token do agente** (mostra o token uma vez), toggle **Impressão ativa**, botão **Imprimir teste** (`testPrintAction` enfileira um `PrintJob kind=TEST` com uma comanda de exemplo). Ações:
- `setPrinterConfigAction(estId, { printerIp, printEnabled })`
- `regeneratePrintTokenAction(estId) → { token }` (token aleatório opaco)
- `testPrintAction(estId)` (enfileira TEST)

## Erro, idempotência e segurança

- **Idempotência:** um `PrintJob ORDER` por pedido; `ack ok` → `PRINTED` (não reaparece no GET).
- **Falha de impressão:** agente faz `ack` com erro → `attempts++`; em 5 falhas → `FAILED` (visível para diagnóstico). Job não some até imprimir ou falhar de vez.
- **Token:** opaco, `@unique`, só no servidor; rotacionável. GET/ACK validam pertencimento do job ao estabelecimento do token.
- **Sem exposição de porta no bar:** o agente é cliente (sai pra internet); nada de inbound.

## Testes

- **Unit (vitest):** `renderTicket` — asserção dos bytes-chave (init `1B40`, corte `1D5600`, presença do código/itens); `orderToTicket` — mapeamento correto; `ackJob` — transições PENDING→PRINTED e attempts→FAILED (com Prisma real, ou teste de `renderTicket`/`orderToTicket` puros — segue o padrão do repo: DB fica na E2E deferida).
- **Sem impressora física:** validação por bytes + um **preview** (o `testPrintAction` + inspeção do `payloadB64` decodificado). Impressão real fica no cliente (deferida).
- Verificação sem tocar `.next`: `tsc --noEmit`, `npm run lint`, `npm test`.

## Dependência externa (do usuário/cliente)

- Uma impressora térmica de **rede** ESC/POS com IP fixo na LAN + uma máquina sempre-ligada (o PC do caixa serve) rodando o agente.
- Sem hardware agora: entregamos nuvem + agente + config; o teste físico roda no cliente.
