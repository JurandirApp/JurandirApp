# Chamar o Garçom / Pedir Ajuda no Pagamento — Design

**Data:** 2026-10-06 · **Status:** design (aguardando revisão do usuário)

## Contexto e objetivo

Quando o cliente tem problema no pagamento (gateway falha, erro, trava), ele precisa de um **fallback que não dependa dos gateways**: um botão que **chama o garçom/estabelecimento até a mesa** pra resolver presencialmente (maquininha, Pix na mão, anotar). O estabelecimento tem que ser **avisado de forma que perceba** — inclusive com o **app fechado** (decisão do usuário: "com app fechado vai ter que ser obrigatório").

## Decisões (travadas com o usuário)

1. **Quem é alertado:** o **garçom/estabelecimento** (ir até a mesa). Não é suporte do Jurandir.
2. **Onde aparece o botão:** **sempre visível na tela de pagamento** (e mais destacado quando dá erro).
3. **Alerta com app aberto:** **som + vibração** in-app (não depende de FCM).
4. **Alerta com app fechado:** **FCM push** (obrigatório) — Android **e** iPhone.
5. **Custo:** nenhum serviço pago novo (FCM é grátis; APNs sai da conta Apple já paga).

## Escopo

**Dentro:**
- Botão "Chamar o garçom" no checkout (cliente).
- Registro do chamado no backend (modelo `HelpRequest`).
- Chamado visível pro **garçom** (app, poll 4s que já existe) e pro **estabelecimento** (painel web, poll 15s que já existe), com **som + vibração** quando chega.
- **FCM push** (Android + iOS) pra avisar com o app fechado — reusa o **Plano 5** (`docs/superpowers/plans/2026-09-09-modulo-garcom-5-push.md`), que nunca foi implementado.
- Marcar chamado como "atendido".

**Fora (agora):**
- Chat/ligação com o cliente.
- Botão em todas as telas (só no pagamento, por ora).
- Os pushes de entrega (READY/PICKED/DELIVERED) do Plano 5 — a infra que vamos implementar os habilita como **bônus**, mas ligá-los é um passo à parte, não parte desta feature.

## Arquitetura (reaproveitando o que existe)

Hoje é **tudo polling** (garçom 4s, painel 15s) e **não há push** (infra FCM só pela metade: `DeviceToken` + `POST /devices` prontos, mas nada envia). A feature:
- **App aberto:** o chamado entra no poll que **já roda** (garçom 4s, painel 15s) → banner + som + vibração. Zero infra nova.
- **App fechado:** implementar o FCM do Plano 5 (config + registro de token + sender) + uma mensagem nova pro chamado.
- **Roteamento do chamado:** `establishmentId` + `locationLabel` (a "mesa", texto livre que já viaja no pedido). Sem FK de mesa (não existe).

## Modelo de dados (backend, Prisma)

```prisma
enum HelpStatus { PENDING HANDLED }
enum HelpReason { PAYMENT GENERAL }

model HelpRequest {
  id              String      @id @default(cuid())
  establishmentId String
  establishment   Establishment @relation(fields: [establishmentId], references: [id], onDelete: Cascade)
  locationLabel   String      // "Mesa 5" (do pedido / selectedLocal)
  clientId        String?
  orderId         String?
  reason          HelpReason  @default(PAYMENT)
  status          HelpStatus  @default(PENDING)
  createdAt       DateTime    @default(now())
  handledAt       DateTime?
  handledByUserId String?
  @@index([establishmentId, status])
}
```
`prisma db push` (aditivo/seguro). `Establishment` ganha a relação inversa `helpRequests HelpRequest[]`.

**Anti-spam (dedup):** ao criar, se já existe um `HelpRequest` PENDING pro mesmo `establishmentId`+`locationLabel`, **reusa** (idempotente) em vez de criar outro — evita chamado duplicado e flood. Cooldown adicional no app (botão desabilita ~60s após o toque).

## Backend

**`lib/db/help.ts`** (lógica):
- `createHelpRequest({ establishmentId, locationLabel, clientId?, orderId?, reason })` → dedup + cria. Retorna o registro.
- `listPendingCalls(establishmentId)` → PENDING do bar.
- `handleCall(id, userId)` → marca HANDLED (handledAt, handledByUserId).

**Rotas** (convenções do projeto: `dynamic="force-dynamic"`, CORS+OPTIONS, zod, `Response.json({ok:...})`):
- `POST /api/public/waiter/call` — **anônima** (cliente), igual às `orders/*`. Body: `{ establishmentId, locationLabel, clientId?, orderId?, reason? }`. Cria o chamado + dispara push best-effort. 422 se faltar campo.
- `GET /api/public/waiter/calls` — **authWaiter**. Lista PENDING do `establishmentId` do garçom.
- `POST /api/public/waiter/calls/[id]/handle` — **authWaiter**. Marca HANDLED.
- `GET /api/public/panel/calls` + `POST /api/public/panel/calls/[id]/handle` — sessão do painel (estabelecimento). Mesma lógica de `lib/db/help.ts`.

## Flutter — cliente (botão)

- `checkout_screen.dart`, área de pagamento: botão fixo **"Precisa de ajuda? Chamar o garçom"** (sempre visível). Nos caminhos de erro (dialog da carteira, toasts de recusa, `card_wait_screen` timeout) → versão mais destacada do mesmo CTA.
- Toque → `publicApi.callWaiter(establishmentId, locationLabel, clientId?, orderId?, reason)` → snackbar "Avisamos o garçom, ele já vem até a sua mesa 👍" + desabilita ~60s (cooldown local).
- Exige `locationLabel` (mesa). Já capturado no QR/checkout; se vazio, reusa `_askTable()`.

## Flutter — garçom (alerta in-app)

- `waiter_ready_screen.dart`: no mesmo `Timer.periodic(4s)`, buscar também `GET /waiter/calls`.
- Chamado novo (id inédito desde o último tick) → **banner vermelho no topo** ("🔔 Mesa 5 — cliente precisa de ajuda com o pagamento" + horário) + **`HapticFeedback.heavyImpact()`** (repetido) + **som de alerta**.
- Som: via `flutter_local_notifications` (que já entra pro FCM) com canal de alta importância (som+vibração), disparado localmente ao detectar chamado novo — mesmo caminho do push, funciona em foreground.
- Botão **"Atendido"** no banner → `POST /waiter/calls/[id]/handle` → some. Se tiver `orderId`, toque abre o pedido.

## Estabelecimento — painel web

- `PanelApp.tsx` poll (15s): buscar `GET /panel/calls` → banner + som (`Audio()`) + `navigator.vibrate()` onde suportado. Botão "Atendido" → handle.
- ⚠️ Limites do browser: autoplay de som exige interação prévia do usuário na aba; `navigator.vibrate` não funciona em desktop nem Safari/iOS. O painel num tablet/celular Android do bar funciona bem; anotar a limitação.

## FCM push (app fechado) — reusa o Plano 5

Implementar **Plano 5 Tasks 1–3** (config Apple/Firebase = usuário; entitlement + deps + registro de token + sender = código) e adicionar:
- `notify.ts`: **`notifyWaitersHelp(establishmentId, mesa, reason)`** (espelha `notifyWaitersReady`): título "🔔 Chamado na mesa", corpo "Mesa X precisa de ajuda com o pagamento", prioridade alta.
- Gatilho: dentro de `createHelpRequest` (ou na rota `/waiter/call`), best-effort (try/catch — push nunca derruba a criação do chamado).
- `POST /devices` já existe; falta o app **registrar o token** (Plano 5 Task 2) — hoje nada registra.

## Setup de conta (usuário — eu não tenho acesso)

Igual ao Plano 5 Task 1/5:
1. **Firebase**: criar projeto; app Android (`google-services.json`) + iOS (`GoogleService-Info.plist`).
2. **Apple Developer**: App ID `br.app.jurandir` → capability **Push**; criar **APNs Auth Key (.p8)** (Key ID + Team ID) → subir no Firebase.
3. **Vercel**: `FCM_SERVICE_ACCOUNT_JSON` (Secure) + `FCM_PROJECT_ID`.
⚠️ A config Apple precisa estar feita **antes** do build iOS (igual ao Apple Pay), senão a assinatura falha.

## Fases (pra testar incremental)

- **Fase 1 — in-app (sem Firebase):** modelo + rotas + botão do cliente + banner/som/vibração no garçom (poll) + painel. **Funciona com app aberto. Testável JÁ** (inclusive no Xiaomi), sem depender de nada externo.
- **Fase 2 — FCM (app fechado):** Plano 5 Tasks 1–3 + `notifyWaitersHelp`. Android testa no Xiaomi; **iOS exige APNs + build TestFlight** (loop lento).

## Riscos / pontos de atenção

- **iOS push** só testa em iPhone físico via TestFlight (mesmo ritmo lento do Apple Pay).
- **Som no painel web**: autoplay/vibrate limitados por browser.
- **Confiabilidade do alerta**: o push pode ser perdido (silencioso/modo não perturbe). Por isso o in-app (app aberto, banner persistente + som) é a camada mais confiável durante o expediente; o push cobre o app fechado.
- **ENOSPC (C: cheio)**: `flutter pub add` das deps Firebase pode falhar; o usuário roda se precisar.

## Self-review
- Decisões 1–5 cobertas: ✅ botão no pagamento (cliente), ✅ alerta garçom+painel, ✅ som+vibração in-app, ✅ FCM app-fechado (Plano 5), ✅ custo zero.
- Reuso: Plano 5 (FCM), poll 4s/15s existentes, `DeviceToken`/`POST /devices`, `locationLabel`, convenções de rota. Sem reinventar.
- Sem placeholder/TBD. Escopo focado (1 feature). Fases permitem entregar valor cedo.
