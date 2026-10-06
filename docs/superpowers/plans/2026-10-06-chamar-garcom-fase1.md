# Chamar o Garçom — Fase 1 (in-app) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botão "Chamar o garçom" no pagamento que registra um chamado e faz o garçom (app) e o estabelecimento (painel) serem avisados com banner + som + vibração — funcionando com o app **aberto** (poll que já existe), sem Firebase.

**Architecture:** Novo modelo `HelpRequest` (chamado por mesa). Cliente cria o chamado numa rota pública anônima; o chamado entra no **poll de 4s** do app do garçom e no **poll de 15s** do painel web, que já existem. Alerta in-app = `HapticFeedback` + `flutter_local_notifications` (local, sem FCM). Fase 2 (FCM/app fechado) é outro plano e reusa o Plano 5.

**Tech Stack:** Next.js 16 + Prisma/Neon + zod (backend), Flutter + Riverpod + Dio + flutter_local_notifications (app), React (painel).

**Spec:** `docs/superpowers/specs/2026-10-06-chamar-garcom-design.md`

## Global Constraints

- **Next.js 16 ≠ o que você conhece:** antes de mexer em rota/API, ler o guia em `node_modules/next/dist/docs/` (regra do `AGENTS.md`). Rotas seguem o padrão existente: `export const dynamic = "force-dynamic"`, objeto `CORS`, `OPTIONS()` 204, `Response.json({...}, { headers: CORS })`, validação zod com `.safeParse` (422 em falha).
- **Auth:** rotas do garçom usam `authWaiter(req)` → `{ userId, establishmentId } | null` (401 se null); **exige `waiterModuleEnabled`** no bar. Rotas do painel usam `authEstablishment(req)` → sessão com `establishmentId!`. Rotas do cliente são **anônimas** (sem bearer; dados no body).
- **DB I/O não é unit-testado** neste projeto (só lógica pura em `tests/`). `lib/db/*` é verificado por `npx tsc --noEmit` + teste real no device/painel.
- **Mesa = `locationLabel`** (texto livre no pedido). É a chave de roteamento do chamado (+ `establishmentId`).
- **Instalação de deps:** C: cheio (ENOSPC) — o **usuário** roda `flutter pub add` / `npm i` quando o plano pedir.
- **`prisma db push`** toca o banco Neon compartilhado (produção). A mudança aqui é **aditiva** (tabela/enums/coluna nova nullable) = segura. Confirmar com o usuário antes de rodar.
- **Commits frequentes**, 1 por task. Mensagens em pt-BR no padrão `feat(garcom): ...`.

## Review Focus

- **Spam de chamado** (cliente toca "chamar" várias vezes): a criação faz **dedup** (reusa o PENDING da mesma mesa) e o app aplica **cooldown ~60s** no botão → Task 1 (dedup) + Task 4 (cooldown).
- **Mesa ausente** (cliente não veio do QR / sem `locationLabel`): o botão **pede a mesa** antes de chamar (reusa `_askTable()`), nunca envia vazio → Task 4.
- **Bar sem módulo do garçom**: `authWaiter` retorna 401 (sem app do garçom), então o chamado **tem que aparecer no painel** do estabelecimento → Task 2 (rotas de painel) + Task 6.
- **Alerta best-effort**: falha de som/notificação local **não** pode quebrar o fluxo nem o poll → Task 5 (try/catch em volta do alerta).
- **Atender em corrida** (dois garçons tocam "Atendido" no mesmo chamado): `handleCall` é **idempotente** (já HANDLED → ok, sem erro) → Task 1.

---

## Task 1: Backend — modelo `HelpRequest` + lógica (`lib/db/help.ts`)

**Files:**
- Modify: `prisma/schema.prisma` (enums + model + relação inversa em `Establishment`)
- Create: `lib/db/help.ts`

**Interfaces:**
- Produces:
  - `createHelpRequest(input: { establishmentId: string; locationLabel: string; clientId?: string | null; orderId?: string | null; reason?: "PAYMENT" | "GENERAL" }): Promise<{ id: string; reused: boolean }>`
  - `listPendingCalls(establishmentId: string): Promise<Array<{ id: string; locationLabel: string; reason: string; createdAt: Date; orderId: string | null }>>`
  - `handleCall(id: string, userId: string | null, establishmentId: string): Promise<{ ok: boolean }>`

- [ ] **Step 1: adicionar enums + model no schema.** Em `prisma/schema.prisma`, no bloco de enums, adicionar:

```prisma
enum HelpStatus { PENDING HANDLED }
enum HelpReason { PAYMENT GENERAL }
```

e o model (perto dos outros models de pedido):

```prisma
model HelpRequest {
  id              String        @id @default(cuid())
  establishmentId String
  establishment   Establishment @relation(fields: [establishmentId], references: [id], onDelete: Cascade)
  locationLabel   String
  clientId        String?
  orderId         String?
  reason          HelpReason    @default(PAYMENT)
  status          HelpStatus    @default(PENDING)
  createdAt       DateTime      @default(now())
  handledAt       DateTime?
  handledByUserId String?

  @@index([establishmentId, status])
}
```

- [ ] **Step 2: relação inversa no `Establishment`.** No model `Establishment`, adicionar a linha (junto das outras relações `[]`):

```prisma
  helpRequests  HelpRequest[]
```

- [ ] **Step 3: validar + gerar o client.**

Run: `cd "d:/Projetos 2.0/Jurandir/jurandir" && npx prisma validate && npx prisma generate`
Expected: "The schema is valid" + "Generated Prisma Client".

- [ ] **Step 4: escrever `lib/db/help.ts`.**

```ts
import { prisma } from "./prisma";

/** Cria um chamado. DEDUP: se já existe um PENDING pra mesma mesa no bar,
 *  reusa (evita flood e alerta duplicado). */
export async function createHelpRequest(input: {
  establishmentId: string;
  locationLabel: string;
  clientId?: string | null;
  orderId?: string | null;
  reason?: "PAYMENT" | "GENERAL";
}): Promise<{ id: string; reused: boolean }> {
  const existing = await prisma.helpRequest.findFirst({
    where: { establishmentId: input.establishmentId, locationLabel: input.locationLabel, status: "PENDING" },
    select: { id: true },
  });
  if (existing) return { id: existing.id, reused: true };
  const created = await prisma.helpRequest.create({
    data: {
      establishmentId: input.establishmentId,
      locationLabel: input.locationLabel,
      clientId: input.clientId ?? null,
      orderId: input.orderId ?? null,
      reason: input.reason ?? "PAYMENT",
    },
    select: { id: true },
  });
  return { id: created.id, reused: false };
}

/** Chamados PENDING de um bar, mais antigos primeiro. */
export async function listPendingCalls(establishmentId: string) {
  return prisma.helpRequest.findMany({
    where: { establishmentId, status: "PENDING" },
    select: { id: true, locationLabel: true, reason: true, createdAt: true, orderId: true },
    orderBy: { createdAt: "asc" },
  });
}

/** Marca atendido. Idempotente e escopado ao bar: só afeta um PENDING do bar;
 *  se já foi atendido (ou não é do bar), devolve ok:true sem erro. */
export async function handleCall(id: string, userId: string | null, establishmentId: string): Promise<{ ok: boolean }> {
  await prisma.helpRequest.updateMany({
    where: { id, establishmentId, status: "PENDING" },
    data: { status: "HANDLED", handledAt: new Date(), handledByUserId: userId },
  });
  return { ok: true };
}
```

- [ ] **Step 5: tsc.**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 6: `prisma db push` (aditivo — CONFIRMAR com o usuário antes).**

Run: `npx prisma db push`
Expected: cria a tabela `HelpRequest` + enums; "Your database is now in sync".

- [ ] **Step 7: commit.**

```bash
git add prisma/schema.prisma lib/db/help.ts
git commit -m "feat(garcom): modelo HelpRequest + lógica de chamado (criar/listar/atender)"
```

---

## Task 2: Backend — validação + rotas (cliente, garçom, painel)

**Files:**
- Modify: `lib/validation.ts` (schema `helpCallSchema`)
- Create: `app/api/public/waiter/call/route.ts` (POST, anônima — cliente)
- Create: `app/api/public/waiter/calls/route.ts` (GET, authWaiter)
- Create: `app/api/public/waiter/calls/[id]/handle/route.ts` (POST, authWaiter)
- Create: `app/api/public/panel/calls/route.ts` (GET, authEstablishment)
- Create: `app/api/public/panel/calls/[id]/handle/route.ts` (POST, authEstablishment)

**Interfaces:**
- Consumes: `createHelpRequest`, `listPendingCalls`, `handleCall` (Task 1); `authWaiter` (`@/lib/auth/waiter`), `authEstablishment` (`@/lib/auth/bearer`).
- Produces (consumido pelo app/painel):
  - `POST /api/public/waiter/call` body `{ establishmentId, locationLabel, clientId?, orderId?, reason? }` → `{ ok: true, reused: boolean }`
  - `GET /api/public/waiter/calls` → `{ calls: [{ id, locationLabel, reason, createdAt, orderId }] }`
  - `POST /api/public/waiter/calls/[id]/handle` → `{ ok: true }`
  - `GET /api/public/panel/calls` → `{ calls: [...] }` (idem)
  - `POST /api/public/panel/calls/[id]/handle` → `{ ok: true }`

- [ ] **Step 1: schema em `lib/validation.ts`.** Adicionar:

```ts
export const helpCallSchema = z.object({
  establishmentId: z.string().min(1),
  locationLabel: z.string().min(1).max(80),
  clientId: z.string().optional(),
  orderId: z.string().optional(),
  reason: z.enum(["PAYMENT", "GENERAL"]).optional(),
});
```

- [ ] **Step 2: rota do cliente `app/api/public/waiter/call/route.ts`.**

```ts
import { createHelpRequest } from "@/lib/db/help";
import { helpCallSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/** POST — cliente chama o garçom até a mesa (fallback de pagamento). Anônima. */
export async function POST(req: Request): Promise<Response> {
  const parsed = helpCallSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "invalid" }, { status: 422, headers: CORS });
  const { establishmentId, locationLabel, clientId, orderId, reason } = parsed.data;
  const r = await createHelpRequest({ establishmentId, locationLabel, clientId, orderId, reason });
  // TODO(Fase 2 / Plano 5): push aos garçons (notifyWaitersHelp) aqui, best-effort.
  return Response.json({ ok: true, reused: r.reused }, { headers: CORS });
}
```

- [ ] **Step 3: rota do garçom (listar) `app/api/public/waiter/calls/route.ts`.**

```ts
import { authWaiter } from "@/lib/auth/waiter";
import { listPendingCalls } from "@/lib/db/help";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: Request): Promise<Response> {
  const s = await authWaiter(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  const calls = await listPendingCalls(s.establishmentId);
  return Response.json({ calls }, { headers: CORS });
}
```

- [ ] **Step 4: rota do garçom (atender) `app/api/public/waiter/calls/[id]/handle/route.ts`.**

```ts
import { authWaiter } from "@/lib/auth/waiter";
import { handleCall } from "@/lib/db/help";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const s = await authWaiter(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  const { id } = await ctx.params;
  const r = await handleCall(id, s.userId, s.establishmentId);
  return Response.json({ ok: r.ok }, { headers: CORS });
}
```

- [ ] **Step 5: rotas do painel.** `app/api/public/panel/calls/route.ts` (GET) e `app/api/public/panel/calls/[id]/handle/route.ts` (POST) = cópias das Steps 3/4 trocando `authWaiter`→`authEstablishment` (import `@/lib/auth/bearer`) e `s.establishmentId`→`s.establishmentId!`. (A lógica `listPendingCalls`/`handleCall` é a mesma; muda só o guard de auth, pra cobrir bares sem módulo do garçom.)

- [ ] **Step 6: tsc + commit.**

Run: `npx tsc --noEmit` → sem erro.

```bash
git add lib/validation.ts "app/api/public/waiter/call" "app/api/public/waiter/calls" "app/api/public/panel/calls"
git commit -m "feat(garcom): rotas de chamado (cliente cria; garçom/painel listam e atendem)"
```

---

## Task 3: Flutter — métodos no `public_api.dart` + modelo `HelpCall`

**Files:**
- Modify: `jurandir-app/lib/core/data/public_api.dart`

**Interfaces:**
- Consumes: as rotas da Task 2; `_dio` (instance já configurada com baseUrl `/api/public`).
- Produces (consumido pelas Tasks 4-5):
  - `class HelpCall { final String id; final String locationLabel; final String reason; final String? orderId; }` + `HelpCall.fromJson`
  - `Future<bool> callWaiter({ required String establishmentId, required String locationLabel, String? clientId, String? orderId, String reason = "PAYMENT" })`
  - `Future<List<HelpCall>> waiterCalls(String token)`
  - `Future<void> handleWaiterCall(String token, String id)`

- [ ] **Step 1: modelo `HelpCall`** (topo do arquivo, junto dos outros modelos, ou logo antes de `class PublicApi`):

```dart
class HelpCall {
  final String id;
  final String locationLabel;
  final String reason;
  final String? orderId;
  const HelpCall({required this.id, required this.locationLabel, required this.reason, this.orderId});
  factory HelpCall.fromJson(Map<String, dynamic> j) => HelpCall(
        id: j['id'] as String,
        locationLabel: (j['locationLabel'] as String?) ?? '',
        reason: (j['reason'] as String?) ?? 'PAYMENT',
        orderId: j['orderId'] as String?,
      );
}
```

- [ ] **Step 2: métodos na classe `PublicApi`** (seguindo o padrão `_dio` + `Options(headers: {'Authorization': 'Bearer $token'})`):

```dart
  /// Cliente chama o garçom até a mesa. Retorna true se o backend aceitou.
  Future<bool> callWaiter({
    required String establishmentId,
    required String locationLabel,
    String? clientId,
    String? orderId,
    String reason = 'PAYMENT',
  }) async {
    final res = await _dio.post<Map<String, dynamic>>('/waiter/call', data: {
      'establishmentId': establishmentId,
      'locationLabel': locationLabel,
      if (clientId != null) 'clientId': clientId,
      if (orderId != null) 'orderId': orderId,
      'reason': reason,
    });
    return res.data?['ok'] == true;
  }

  /// Chamados PENDING do bar do garçom.
  Future<List<HelpCall>> waiterCalls(String token) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/waiter/calls',
      options: Options(headers: {'Authorization': 'Bearer $token'}),
    );
    final list = (res.data?['calls'] as List?) ?? const [];
    return list.map((e) => HelpCall.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Garçom marca o chamado como atendido.
  Future<void> handleWaiterCall(String token, String id) async {
    await _dio.post<Map<String, dynamic>>(
      '/waiter/calls/$id/handle',
      options: Options(headers: {'Authorization': 'Bearer $token'}),
    );
  }
```

- [ ] **Step 3: analyze + commit.**

Run: `cd "d:/Projetos 2.0/Jurandir/jurandir-app" && flutter analyze lib/core/data/public_api.dart`
Expected: No issues.

```bash
git add lib/core/data/public_api.dart
git commit -m "feat(garcom): API client do chamado (callWaiter/waiterCalls/handleWaiterCall)"
```

---

## Task 4: Flutter — botão "Chamar o garçom" no checkout (cliente)

**Files:**
- Modify: `jurandir-app/lib/features/checkout/presentation/checkout_screen.dart`

**Interfaces:**
- Consumes: `callWaiter` (Task 3); `_cartEst()` (estabelecimento do carrinho, já existe), `selectedLocalProvider` (a mesa), `_askTable()` (já existe, pede a mesa), `clientProfileProvider` (clientId, se houver), `_toast()` (já existe).

- [ ] **Step 1: estado de cooldown.** No `_CheckoutScreenState`, adicionar campo:

```dart
  bool _calling = false; // cooldown do "chamar garçom"
```

- [ ] **Step 2: handler `_callWaiter`.** Adicionar o método (usa a mesa já capturada; se vazia, pede com `_askTable()` — mesma regra do pagamento):

```dart
  Future<void> _callWaiter() async {
    if (_calling) return;
    final est = _cartEst();
    final estId = est?.id;
    if (estId == null) { _toast('Abra o cardápio de um bar pra chamar o garçom.'); return; }
    var mesa = ref.read(selectedLocalProvider) ?? '';
    if (mesa.trim().isEmpty) {
      await _askTable();
      if (!mounted) return;
      mesa = ref.read(selectedLocalProvider) ?? '';
      if (mesa.trim().isEmpty) return; // cancelou
    }
    setState(() => _calling = true);
    try {
      final ok = await ref.read(publicApiProvider).callWaiter(
            establishmentId: estId,
            locationLabel: mesa,
            clientId: ref.read(clientProfileProvider).clientId,
          );
      if (!mounted) return;
      _toast(ok ? 'Avisamos o garçom, ele já vem até a sua mesa 👍' : 'Não foi possível chamar agora. Tente de novo.');
    } catch (_) {
      if (mounted) _toast('Não foi possível chamar agora. Tente de novo.');
    }
    // cooldown de 60s pra não spammar (o backend ainda deduplica).
    Future.delayed(const Duration(seconds: 60), () { if (mounted) setState(() => _calling = false); });
  }
```

> Confirmar os nomes exatos: `_cartEst()`, `selectedLocalProvider`, `_askTable()`, `clientProfileProvider.clientId`, `publicApiProvider`. Se `clientId` tiver outro getter, ajustar.

- [ ] **Step 3: botão sempre visível na área de pagamento.** Logo acima da barra "Pagar" (no `build`, perto de `_payBar`/`_payGrid`), adicionar um `TextButton`/link discreto:

```dart
  Widget _callWaiterLink() => Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 4),
        child: TextButton.icon(
          onPressed: _calling ? null : _callWaiter,
          icon: Icon(Symbols.room_service, size: 18, color: _calling ? AppColors.inkA(0.35) : AppColors.ink),
          label: Text(
            _calling ? 'Garçom avisado ✓' : 'Precisa de ajuda? Chamar o garçom',
            style: AppText.body(size: 13, weight: FontWeight.w700, color: _calling ? AppColors.inkA(0.4) : AppColors.ink),
          ),
        ),
      );
```

Inserir `_callWaiterLink()` na coluna de pagamento (sempre visível, decisão do usuário).

- [ ] **Step 4: destacar no erro.** Nos caminhos de recusa (o toast "Pagamento não aprovado…" em `_onWallet`/`_payCard`, e o dialog da carteira), acrescentar uma ação/CTA que chama `_callWaiter()` — ex.: trocar o `_toast('Pagamento não aprovado…')` por um SnackBar com `SnackBarAction(label: 'Chamar garçom', onPressed: _callWaiter)`. (Manter a mensagem; só somar a ação.)

- [ ] **Step 5: analyze + commit.**

Run: `flutter analyze lib/features/checkout/presentation/checkout_screen.dart`
Expected: No issues.

```bash
git add lib/features/checkout/presentation/checkout_screen.dart
git commit -m "feat(garcom): botão 'Chamar o garçom' no checkout (sempre visível + no erro de pagamento)"
```

---

## Task 5: Flutter — alerta do chamado na tela do garçom (banner + vibração + som)

**Files:**
- Modify: `jurandir-app/pubspec.yaml` (+ `flutter_local_notifications`)
- Create: `jurandir-app/lib/core/alert/alert_service.dart`
- Modify: `jurandir-app/lib/main.dart` (init do alerta)
- Modify: `jurandir-app/lib/features/waiter/presentation/waiter_ready_screen.dart`

**Interfaces:**
- Consumes: `waiterCalls`, `handleWaiterCall`, `HelpCall` (Task 3); `authProvider.token`.
- Produces: `AlertService.ring({ required String title, required String body })` (vibra + toca som local, best-effort) e `AlertService.init()`.

- [ ] **Step 1: adicionar a dep (USUÁRIO roda por causa do ENOSPC):**

Run: `cd "d:/Projetos 2.0/Jurandir/jurandir-app" && flutter pub add flutter_local_notifications`
Expected: entra em `pubspec.yaml` + `pub get` ok.

- [ ] **Step 2: `lib/core/alert/alert_service.dart`** — envolve haptics + notificação local (som+vibração), tudo best-effort:

```dart
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Alerta local (sem FCM): vibração + som de notificação, pra chamar a atenção
/// do garçom com o app ABERTO. Best-effort — nunca lança.
class AlertService {
  static final _plugin = FlutterLocalNotificationsPlugin();
  static const _channelId = 'jurandir_chamados';

  static Future<void> init() async {
    try {
      const android = AndroidInitializationSettings('@mipmap/ic_launcher');
      const ios = DarwinInitializationSettings();
      await _plugin.initialize(const InitializationSettings(android: android, iOS: ios));
      await _plugin
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(const AndroidNotificationChannel(
            _channelId, 'Chamados',
            description: 'Chamados de clientes na mesa',
            importance: Importance.max, playSound: true, enableVibration: true,
          ));
    } catch (_) {}
  }

  static Future<void> ring({required String title, required String body}) async {
    try { HapticFeedback.heavyImpact(); } catch (_) {}
    try {
      await _plugin.show(
        DateTime.now().millisecondsSinceEpoch ~/ 1000,
        title, body,
        const NotificationDetails(
          android: AndroidNotificationDetails(
            _channelId, 'Chamados',
            importance: Importance.max, priority: Priority.high,
            playSound: true, enableVibration: true, category: AndroidNotificationCategory.call,
          ),
          iOS: DarwinNotificationDetails(presentSound: true, presentAlert: true),
        ),
      );
    } catch (_) {}
  }
}
```

- [ ] **Step 3: init no boot.** Em `lib/main.dart`, antes do `runApp`, chamar `await AlertService.init();` (envolto em try/catch já no service). Import do service.

- [ ] **Step 4: buscar chamados no poll do garçom.** Em `waiter_ready_screen.dart`:
  - Adicionar estado: `List<HelpCall> _calls = const []; final Set<String> _seenCallIds = {};`.
  - No `_load`, após carregar `orders`, buscar também os chamados e disparar o alerta pra ids inéditos:

```dart
      final calls = await ref.read(publicApiProvider).waiterCalls(token);
      final novos = calls.where((c) => !_seenCallIds.contains(c.id)).toList();
      if (!mounted) return;
      setState(() { _calls = calls; });
      for (final c in calls) { _seenCallIds.add(c.id); }
      if (novos.isNotEmpty && _orders != null) { // não toca no 1º load (evita barulho ao abrir)
        AlertService.ring(title: '🔔 Chamado na mesa', body: '${novos.first.locationLabel} precisa de ajuda com o pagamento');
      }
```

  (Buscar `waiterCalls` dentro do mesmo try do `waiterOrders`; se falhar, o catch atual já trata.)

- [ ] **Step 5: handler atender.** Método:

```dart
  Future<void> _handleCall(HelpCall c) async {
    final token = ref.read(authProvider).token;
    if (token == null) return;
    setState(() => _calls = _calls.where((x) => x.id != c.id).toList());
    try { await ref.read(publicApiProvider).handleWaiterCall(token, c.id); } catch (_) {}
  }
```

- [ ] **Step 6: banner no topo da fila.** No `_body()` (antes da `ListView`/estados), se `_calls.isNotEmpty`, renderizar um bloco de banners vermelhos: cada chamado = card `AppColors.danger`/`dangerBg` com "🔔 ${c.locationLabel} — precisa de ajuda com o pagamento" + botão **"Atendido"** → `_handleCall(c)`. (Usar `BrutalCard`/estilo existente; cor de alerta do `AppColors`.)

- [ ] **Step 7: analyze + teste no device (Xiaomi).**

Run: `flutter analyze lib/features/waiter lib/core/alert lib/main.dart`
Expected: No issues.
Verificação manual: logar como garçom (bar com módulo on) → num outro device/app, cliente toca "Chamar o garçom" → em ≤4s o banner aparece + vibra + som. Tocar "Atendido" → some.

- [ ] **Step 8: commit.**

```bash
git add pubspec.yaml lib/core/alert lib/main.dart lib/features/waiter/presentation/waiter_ready_screen.dart
git commit -m "feat(garcom): alerta de chamado na fila do garçom (banner + vibração + som)"
```

---

## Task 6: Painel web — banner de chamado

**Files:**
- Modify: `jurandir/components/panel/PanelApp.tsx` (ou o componente que detém o poll de 15s / render do topo)

**Interfaces:**
- Consumes: `GET /api/public/panel/calls` + `POST /api/public/panel/calls/[id]/handle` (Task 2), com a sessão do painel (mesmo mecanismo que as outras chamadas do painel fazem — reusar o helper/fetch já usado por `PedidosSection`/`markItemReadyAction`).

- [ ] **Step 1: buscar chamados no poll de 15s.** No mesmo `setInterval(poll, 15000)` do `PanelApp.tsx`, somar um fetch de `/panel/calls` e guardar em estado `calls`. Tocar som/vibrar ao detectar id novo (mesma lógica de "id inédito" do app): `new Audio(...).play()` (best-effort, pode ser bloqueado até 1ª interação) + `navigator.vibrate?.(400)`.

- [ ] **Step 2: banner no topo do painel.** Se `calls.length > 0`, renderizar faixa vermelha com cada chamado ("🔔 Mesa X — ajuda no pagamento") + botão "Atendido" → POST handle → remove do estado.

- [ ] **Step 3: verificar + commit.**

Run: `cd "d:/Projetos 2.0/Jurandir/jurandir" && npx tsc --noEmit` → sem erro. (E `npm run build` se o fluxo do projeto pedir.)
Verificação manual: abrir o painel de um bar **sem** módulo do garçom → cliente chama → em ≤15s a faixa aparece.

```bash
git add components/panel/PanelApp.tsx
git commit -m "feat(garcom): banner de chamado no painel do estabelecimento"
```

---

## Self-Review

- **Cobertura do spec (Fase 1):** botão no checkout (Task 4) ✅; chamado no backend/modelo (Task 1) ✅; rotas cliente+garçom+painel (Task 2) ✅; alerta garçom banner+som+vibração (Task 5) ✅; painel (Task 6) ✅; API client (Task 3) ✅. Fase 2 (FCM/app fechado) fora deste plano (reusa Plano 5). ✅
- **Placeholders:** nenhum — todo passo tem código/comando real. Pontos marcados "confirmar nome exato" (Task 4 Step 2) são verificações de símbolo existente, não TODO de implementação.
- **Consistência de tipos:** `createHelpRequest`/`listPendingCalls`/`handleCall` (Task 1) batem com o uso nas rotas (Task 2); `HelpCall`/`callWaiter`/`waiterCalls`/`handleWaiterCall` (Task 3) batem com Tasks 4-5; shape `{ calls: [...] }` consistente backend↔app.
- **Review Focus:** spam→dedup (Task 1 Step 4) + cooldown (Task 4 Step 2); mesa ausente→`_askTable` (Task 4 Step 2); bar sem módulo→rotas de painel (Task 2 Step 5) + Task 6; alerta best-effort→try/catch (Task 5 Step 2); atender em corrida→`updateMany` idempotente (Task 1 Step 4). Cada um verificado manualmente no device/painel (o projeto não unit-testa I/O de DB nem UI).
- **Padrões do codebase:** rotas (CORS/OPTIONS/zod/Response.json), auth (authWaiter/authEstablishment), `lib/db/*` sem unit-test, Dio+Options no app, Riverpod/go_router, AppColors/AppText/BrutalCard. Seguidos.
