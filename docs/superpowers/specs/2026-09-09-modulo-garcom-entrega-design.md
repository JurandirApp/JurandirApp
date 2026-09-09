# Módulo do Garçom — Novo Fluxo de Entrega dos Pedidos

**Data:** 2026-09-09
**Status:** Design aprovado (aguardando revisão do usuário) → próximo passo: plano de implementação
**Repos afetados:** `jurandir` (backend Next.js + painel) e `jurandir-app` (Flutter cliente/estabelecimento/garçom)

---

## 1. Objetivo

Hoje o pedido é acompanhado só até a cozinha/bar (impresso, status "Preparando"). Este módulo **fecha o ciclo operacional**: acompanha cada produto do balcão até a entrega efetiva na mesa, registrando **quem preparou/disponibilizou, quem retirou, quem entregou e em quais horários**.

Fluxo alto nível:
```
Pedido realizado → Pagamento confirmado → Preparando → Pronto para retirada
→ Em entrega → Entregue
```

## 2. Decisões travadas (do brainstorming)

1. **Garçom = novo papel `WAITER`**, gerenciado pelo DONO no painel do estabelecimento. Loga na tela de login existente (usuário/senha). Identidade individual por garçom.
2. **"Pronto para retirada" é marcado pela cozinha/bar** no painel/app do estabelecimento (não é automático).
3. **Controle por item E por quantidade** — entrega **parcial** dentro de uma mesma linha (ex.: 2 das 5 caipirinhas agora, 3 depois). Fonte da verdade = **contadores de quantidade por estado** no `OrderItem`.
4. **Cliente cadastra nome + telefone no onboarding** (perfil LOCAL no aparelho, **sem** conta no servidor). O **código de entrega = 4 últimos dígitos do telefone** do cliente, o **mesmo** em todas as entregas parciais.
5. **Notificação push real** (FCM + APNs) quando o item fica pronto — notificando **garçom E cliente**.
6. **Auditoria por evento** (`OrderEvent`) é parte central (necessária pra rastrear lotes parciais).

## 3. Princípio de arquitetura

A **entrega é por quantidade**, não por linha nem por pedido inteiro. Cada `OrderItem` (ex.: "Caipirinha ×5") mantém contadores de quantas unidades estão em cada estado. O **pedido** (`Order`) só vira `DELIVERED` quando **todas as linhas** estão 100% entregues. Assim bebida entrega antes da comida sem travar nada.

O **cliente NÃO tem conta no servidor** (mantém o que declaramos à Apple: "consumer é anônimo"). O garçom **tem** conta (`WAITER`) — isso é um **novo tipo de conta**, a ser anotado nas notas de revisão da App Store na próxima submissão.

---

## 4. Modelo de dados (Prisma) — `jurandir/prisma/schema.prisma`

### 4.1 Enum de papéis
```prisma
enum Role {
  ADMIN
  ESTABLISHMENT
  WAITER          // NOVO
}
```

### 4.2 `User` (garçom)
Sem novos campos — reusa `role = WAITER` + `establishmentId` (o garçom pertence a um bar). Login reusa o fluxo atual (`/api/public/login` ou action de login), que passa a aceitar/retornar role WAITER.

### 4.3 `OrderItem` — contadores de quantidade
```prisma
model OrderItem {
  // ...campos atuais (id, orderId, name, qty, unitPrice, options)...
  qtyReady          Int @default(0)   // prontas no balcão
  qtyOutForDelivery Int @default(0)   // pegas pelo garçom, a caminho
  qtyDelivered      Int @default(0)   // entregues e confirmadas
  // preparando = qty - (qtyReady + qtyOutForDelivery + qtyDelivered)  [DERIVADO]
}
```
Invariante: `qtyReady + qtyOutForDelivery + qtyDelivered <= qty` (o restante está "preparando").

### 4.4 `Order`
```prisma
model Order {
  // ...campos atuais (customerName já existe)...
  customerPhone String?   // NOVO — deriva o código (4 últimos dígitos)
  clientId      String?   // NOVO — id local anônimo do aparelho, p/ push ao cliente
  @@index([establishmentId, status])   // já existe
}
```

### 4.5 `OrderEvent` — auditoria/timeline (NOVO)
```prisma
enum OrderEventType {
  PAID
  IN_PRODUCTION       // enviado ao bar
  READY               // item disponibilizado no balcão (qty)
  PICKED              // garçom pegou (qty)
  DELIVERED           // entrega confirmada por código (qty)
}

model OrderEvent {
  id          String         @id @default(cuid())
  orderId     String
  order       Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)
  orderItemId String?        // null p/ eventos de pedido (PAID, IN_PRODUCTION)
  type        OrderEventType
  qty         Int?           // p/ eventos de item (READY/PICKED/DELIVERED)
  waiterId    String?        // User (garçom) que fez PICKED/DELIVERED
  waiter      User?          @relation(fields: [waiterId], references: [id], onDelete: SetNull)
  at          DateTime       @default(now())
  @@index([orderId])
}
```
A timeline do item 7 da spec é reconstruída a partir de `OrderEvent` + timestamps do `Order`/`Payment`.

### 4.6 `DeviceToken` — push (NOVO)
```prisma
model DeviceToken {
  id              String   @id @default(cuid())
  token           String   @unique          // token FCM/APNs (roteia iOS e Android)
  userId          String?  // garçom (role WAITER) — push de "pronto"
  clientId        String?  // cliente anônimo — push de "a caminho / entregue"
  establishmentId String?  // p/ filtrar garçons do bar
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([establishmentId])
  @@index([clientId])
}
```
> Sem campo `platform`: o FCM entrega pra iOS/Android pelo próprio token; segmentar por plataforma fica pra depois se precisar.

> **Migração:** todas as alterações exigem `prisma db push` (rodado pelo usuário, ver política do projeto). Itens/pedidos antigos ganham contadores default 0 e `customerPhone/clientId` null — o fluxo de garçom só se aplica a pedidos novos; pedidos antigos sem telefone caem no fallback de código (ver §7.3).

---

## 5. Backend — endpoints e lógica (`jurandir`)

Todos escopados por estabelecimento. Garçom só enxerga/age no bar dele (via token). Reaproveitar `authEstablishment`/bearer; criar `authWaiter` análogo que exige `role = WAITER`.

### 5.1 Cadastro/gestão de garçom (dono)
- **Action/endpoint** `upsertWaiter` / `deleteWaiter` (escopo estabelecimento): cria `User { role: WAITER, establishmentId }` com nome + login + senha (hash). Reaproveita o padrão de `upsertMenuItem`/`upsertEstablishment`.
- Validação Zod nova: `waiterUpsertSchema { id?, name, user, password? }`.

### 5.2 Cozinha/bar marca pronto
- **`POST /panel/order-items/:id/ready`** `{ qty }` (auth estabelecimento): move `qty` de preparando→ready.
  - Guarda: `qty <= qty - (qtyReady+qtyOutForDelivery+qtyDelivered)`.
  - Efeitos: `qtyReady += qty`; grava `OrderEvent(READY, qty)`; **dispara push** aos garçons do bar (§8).
  - **UI (nos 2):** o botão "marcar pronto" (com stepper de quantidade) entra tanto no **app do estabelecimento** (`jurandir-app`) quanto no **painel web** (`jurandir`) — mesmo endpoint compartilhado.

### 5.3 Garçom — listar prontos
- **`GET /waiter/ready`** (auth garçom): retorna, por item com `qtyReady > 0` do estabelecimento, `{ orderId, orderItemId, produto, mesa (locationLabel), cliente (customerName), qtyReady }`. Ordenar por mais antigo pronto. É o "PRONTOS PARA RETIRADA".

### 5.4 Garçom — pegar (claim atômico)
- **`POST /waiter/order-items/:id/pick`** `{ qty }` (auth garçom): move `qty` de ready→outForDelivery.
  - **Atômico com guarda** (transação): `UPDATE order_item SET qty_ready = qty_ready - :qty, qty_out_for_delivery = qty_out_for_delivery + :qty WHERE id = :id AND qty_ready >= :qty`. Se 0 linhas afetadas → outro garçom já levou (retorna 409 "já retirado"; a lista atualiza no próximo polling).
  - Grava `OrderEvent(PICKED, qty, waiterId)`.
  - Push ao **cliente**: "Seu pedido está a caminho".

### 5.5 Garçom — confirmar entrega (código)
- **`POST /waiter/order-items/:id/deliver`** `{ qty, code }` (auth garçom):
  - Valida `code === últimos4(order.customerPhone)` (ou fallback §7.3). Errado → 422 "código inválido".
  - Guarda atômica: `... SET qty_out_for_delivery -= :qty, qty_delivered += :qty WHERE id=:id AND qty_out_for_delivery >= :qty`.
  - Grava `OrderEvent(DELIVERED, qty, waiterId)`.
  - **Completa o pedido:** se toda linha do pedido tem `qtyDelivered == qty` → `Order.status = DELIVERED`.
  - Push ao cliente: "Entregue ✅" (e, se pedido completo, "Pedido totalmente entregue").

### 5.6 Registro de device token
- **`POST /devices`** `{ token, clientId? }` — se auth garçom, vincula `userId`+`establishmentId`; senão vincula `clientId` (cliente anônimo). Upsert por `token`.

### 5.7 Rastreabilidade (dono)
- **`GET /panel/orders/:id/timeline`** — eventos do pedido (PAID→…→DELIVERED) com garçom e horário.
- **`GET /panel/waiters`** e **`GET /panel/waiters/:id/activity`** — garçons do bar + o que cada um pegou/entregou (agrega `OrderEvent` por `waiterId`).

---

## 6. App do Garçom — `jurandir-app` (área nova, mesmo app)

Roteamento: no login, `role == WAITER` → vai pro **módulo do garçom** (não vê cliente nem painel do dono). Design **uma mão, botões grandes, mínimo de cliques**.

**Telas:**
1. **Login** (reusa a tela existente).
2. **Prontos para retirada** (`GET /waiter/ready`, polling ~4s):
   - Cards grandes: **Produto + Mesa + Nome do cliente** + qtd (ex.: "3 de 5 Caipirinhas · Mesa 01 · Léo").
   - Botão grande **[PEGAR PEDIDO]** (default pega todas as prontas daquela linha; stepper opcional `−/＋` pra levar menos).
   - Item já pego some/da lista (ou aparece "em entrega") — evita dois garçons no mesmo item.
3. **Confirmação de entrega** (abre automático após pegar):
   - "ENTREGA — MESA 01 · Cliente: Léo · Pedido: 3× Caipirinha".
   - Campo de **código [ _ _ _ _ ]** + botão grande **[CONFIRMAR ENTREGA]**.
   - Sucesso → "✅ ENTREGUE" e volta pra lista.

Fluxo ideal: **Visualizou → Pegou → Digita código → Confirma.** Sem menus.

## 7. App do Cliente — mudanças (`jurandir-app`)

### 7.1 Onboarding (1ª abertura)
- Tela pedindo **Nome + Telefone** (e-mail fora agora). Salvo em `shared_preferences` (perfil local). Gera/salva um `clientId` (UUID) local.
- Registra device token via `POST /devices { token, clientId }`.

### 7.2 No pedido
- Payload passa a incluir `customerName`, `customerPhone`, `clientId`.
- Tela do pedido mostra o **código de entrega** bem visível: "Seu código: **4587**".
- Acompanhamento passa a mostrar **status por item e por quantidade**: ex. *"Caipirinha: 3 entregues · 2 preparando"*.

### 7.3 Fallback de código (pedidos sem telefone)
Se `customerPhone` estiver vazio (cliente antigo/anônimo), o backend gera um **código aleatório de 4 dígitos** por pedido, exibido na tela do cliente e usado na validação. (Evita travar entrega de quem não cadastrou telefone.)

## 8. Notificações Push (FCM + APNs)

**Infra (código):** `firebase_core` + `firebase_messaging` no Flutter (+ `flutter_local_notifications` pra exibir em foreground). Backend envia via FCM HTTP v1 (server key/serviço) — helper `lib/push/fcm.ts`.

**Gatilhos:**
| Evento | Quem recebe | Mensagem |
|---|---|---|
| Item `READY` (bar marcou) | Garçons do bar | "🥤 Caipirinha pronta — Mesa 01" |
| Item `PICKED` | Cliente do pedido | "Seu pedido está a caminho 🛎️" |
| Item `DELIVERED` | Cliente do pedido | "Entregue ✅" (+ "Pedido completo" se fechou) |

**Envio:** lookup em `DeviceToken` (garçons por `establishmentId`; cliente por `clientId` do pedido) → FCM. Tokens inválidos são removidos no retorno de erro do FCM.

> **Config necessária (usuário — portais):**
> - **Apple:** habilitar capability **Push Notifications** no App ID `br.app.jurandir`; criar **APNs Auth Key** (`.p8`) em Apple Developer → Keys; subir a `.p8` no Firebase.
> - **Firebase:** criar projeto; adicionar app iOS (`GoogleService-Info.plist`) e Android (`google-services.json`).
> - **Codemagic:** incluir os arquivos do Firebase no build; o entitlement `aps-environment` entra no `Runner.entitlements` (código) e o perfil do `--create` inclui o Push porque o App ID terá a capability — **mesmo padrão do Apple Pay** (fazer a config no portal ANTES de buildar).

## 9. Estados & rastreabilidade

- **`Order.status`** (grosso, interno): `AWAITING_PAYMENT → IN_PRODUCTION → DELIVERED` (quando todas as linhas fecham). Não recebe READY/OUT_FOR_DELIVERY (isso é por-quantidade, não por-pedido).
- **Visão do cliente (6 status da spec):** derivada por item a partir dos contadores + eventos.
- **Timeline (item 7):** montada de `OrderEvent` + `Order.createdAt`/`Payment.confirmedAt`. Exemplo reconstruído: realizado 20:31 · pago 20:32 · enviado ao bar 20:32 · preparando 20:33 · pronto 20:38 · retirado (Garçom João) 20:39 · entregue 20:41.

## 10. Concorrência & tempo real

- **Claim atômico** (UPDATE guardado por `qty_ready >= qty`) em pick/deliver → nunca dois garçons na mesma unidade.
- **Atualização de lista:** polling ~4s (MVP). Push cobre o "avisar" mesmo com app fechado. Websocket/tempo real fica como evolução futura (YAGNI).

---

## 11. Mapa com os 4 itens do escopo cobrado

| Item cobrado | Onde é atendido |
|---|---|
| 1. Cadastro e login do garçom | §4.1/§4.2 (Role WAITER) · §5.1 (CRUD) · §5 (auth) |
| 2. Tela e fluxo inteiro do garçom | §6 |
| 3. Rastreio de todos os garçons no admin | §4.5 (OrderEvent) · §5.7 (timeline + activity) · §7-painel |
| 4. Cadastro do cliente (nome+telefone) | §4.4 · §7.1/§7.2 |
| (+) Notificação de "produto pronto" | §8 (push garçom + cliente) |

## 12. Fora de escopo (YAGNI)

- Tempo real via WebSocket (fica polling + push).
- "Grupo de itens" na entrega (ficou **por item/quantidade**, escolha do usuário).
- Métricas avançadas de desempenho por garçom (tempo médio, ranking) — só o rastreio básico entra.
- E-mail no cadastro do cliente (só nome + telefone agora).

## 13. Ordem de implementação sugerida (para o plano)

1. **Dados & migração:** schema (Role WAITER, contadores, customerPhone/clientId, OrderEvent, DeviceToken) + `prisma db push`.
2. **Backend núcleo:** endpoints bar (ready), garçom (ready/pick/deliver) com claim atômico + completude do pedido + OrderEvent.
3. **Painel do dono:** CRUD de garçom + "marcar pronto" por item + seção Garçons/timeline.
4. **App cliente:** onboarding nome+telefone + enviar no pedido + código visível + status por item.
5. **App garçom:** roteamento por role + lista prontos + pegar + confirmar por código.
6. **Push:** config Apple/Firebase (usuário) + `firebase_messaging` + `POST /devices` + gatilhos READY/PICKED/DELIVERED.

Cada fase é testável isoladamente; a ordem permite validar o backend antes das telas.
