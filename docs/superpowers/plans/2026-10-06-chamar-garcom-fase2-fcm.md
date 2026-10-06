# Chamar o Garçom — Fase 2 (FCM push, app fechado) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Quando um chamado é criado, o garçom recebe um **push no celular mesmo com o app fechado/background** (Android + iOS), além do alerta in-app da Fase 1.

**Architecture:** FCM HTTP v1. O backend, ao criar um `HelpRequest`, busca os device tokens dos garçons do bar e envia push via FCM (OAuth com service account, feito com `crypto` nativo — SEM dep npm nova). O app registra o token FCM em `POST /devices` (Plano 1, já existe) e trata foreground/background. Reusa o Plano 5 (`docs/superpowers/plans/2026-09-09-modulo-garcom-5-push.md`).

**Tech Stack:** Node `crypto` + FCM HTTP v1 (backend), `firebase_core`/`firebase_messaging` + `flutter_local_notifications` (app; o local_notifications já entrou na Fase 1).

**Spec:** `docs/superpowers/specs/2026-10-06-chamar-garcom-design.md` (seção "FCM push") + Plano 5.

## Global Constraints
- **Next.js 16** — ler `node_modules/next/dist/docs/` se precisar.
- **SEM dep npm nova no backend** (C: cheio/ENOSPC) — FCM OAuth via `crypto` nativo (assina JWT RS256, troca por access token). **Flutter pub add** grava em `D:` (PUB_CACHE=D:\flutter-pub-cache) → ok; o usuário roda se falhar.
- **Config do Firebase/Apple é do USUÁRIO** (projeto Firebase, `google-services.json`, `GoogleService-Info.plist`, chave APNs, env na Vercel). O executor faz o **código**; esses arquivos são placeholders até o usuário fornecer. ⚠️ A config Apple (capability Push + APNs) tem que estar feita ANTES do build iOS (igual Apple Pay).
- **Push é best-effort:** falha de push NUNCA derruba a criação do chamado nem o poll.
- Segredos (`FCM_SERVICE_ACCOUNT_JSON`) só em env; nunca commitar. `google-services.json`/`plist` seguem o padrão do projeto (entram no app).
- Commits pt-BR `feat(garcom): ...` com a co-autoria do seu ambiente.

## Review Focus
- **Push derruba a criação do chamado** se o FCM falhar: o `notifyWaitersHelp` tem que ser try/catch best-effort → Task 2.
- **Token inválido não é limpo** → acumula erro: `sendPush` apaga token em UNREGISTERED/404 → Task 1.
- **Permissão de notificação pedida pra cliente** (não só garçom): o registro/permissão FCM só roda pro garçom → Task 4.
- **Access token OAuth re-gerado a cada push** (lento): cachear ~55min → Task 1.
- **App não builda sem `google-services.json`** (plugin google-services exige): a Task 3 deixa placeholder + instruções; verificação é `analyze`, build real é do usuário com os arquivos reais.

---

## Task 1: Backend — sender FCM (`lib/push/fcm.ts`) + delete token + teste

**Files:** Create: `lib/push/fcm.ts`, `tests/push/fcm.test.ts`. Modify: `lib/db/devices.ts` (add `deleteDeviceToken`).

**Interfaces produzidas:** `sendPush(tokens: string[], title: string, body: string): Promise<void>` (FCM HTTP v1, best-effort, remove tokens inválidos).

- [ ] **Step 1: `deleteDeviceToken` em `lib/db/devices.ts`:**
```ts
export async function deleteDeviceToken(token: string) {
  await prisma.deviceToken.deleteMany({ where: { token } });
}
```

- [ ] **Step 2: `lib/push/fcm.ts`** (OAuth via crypto nativo, access token cacheado, envio HTTP v1):
```ts
import { createSign } from "crypto";
import { deleteDeviceToken } from "@/lib/db/devices";

type ServiceAccount = { client_email: string; private_key: string; project_id: string };

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try { return JSON.parse(raw) as ServiceAccount; } catch { return null; }
}
const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

let cached: { token: string; exp: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error("FCM OAuth falhou");
  cached = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return j.access_token;
}

/** Envia push pra cada token (FCM HTTP v1). Best-effort; remove tokens inválidos. */
export async function sendPush(tokens: string[], title: string, body: string): Promise<void> {
  const sa = serviceAccount();
  if (!sa || tokens.length === 0) return;
  const pid = process.env.FCM_PROJECT_ID || sa.project_id;
  let at: string;
  try { at = await accessToken(sa); } catch { return; }
  for (const token of tokens) {
    try {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${pid}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token, notification: { title, body },
            android: { priority: "high", notification: { channel_id: "jurandir_chamados", sound: "default" } },
            apns: { payload: { aps: { sound: "default" } } },
          },
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/i.test(t)) await deleteDeviceToken(token);
      }
    } catch { /* best-effort */ }
  }
}
```

- [ ] **Step 3: teste `tests/push/fcm.test.ts`** (mockar `fetch` como os testes de pagamento fazem; gerar um par RSA de teste com `crypto.generateKeyPairSync("rsa",{modulusLength:2048})` pro `private_key` do service account de teste). Casos:
  - `sendPush(["tok1"], "t", "b")` → chama o endpoint OAuth 1x e o `messages:send` com `message.token==="tok1"`, `message.notification.title==="t"`. (Ler o body do fetch mockado.)
  - resposta 404/`UNREGISTERED` no send → chama `deleteDeviceToken` (mockar `@/lib/db/devices`).
  - sem `FCM_SERVICE_ACCOUNT_JSON` → não chama fetch (no-op).

- [ ] **Step 4: tsc + vitest.**
Run: `cd "d:/Projetos 2.0/Jurandir/jurandir" && npx tsc --noEmit && npx vitest run tests/push/fcm.test.ts`
Expected: tsc sem erro; teste verde.

- [ ] **Step 5: commit.**
```bash
git add lib/push/fcm.ts tests/push/fcm.test.ts lib/db/devices.ts
git commit -m "feat(garcom): sender FCM (HTTP v1, OAuth via crypto nativo) + remove token inválido

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Backend — `notifyWaitersHelp` + gatilho no `/waiter/call`

**Files:** Create: `lib/push/notify.ts`. Modify: `app/api/public/waiter/call/route.ts` (o TODO da Fase 1).

**Interfaces:** Consumes `sendPush` (Task 1), `createHelpRequest` (Fase 1). Produces `notifyWaitersHelp(establishmentId, mesa)`.

- [ ] **Step 1: `lib/push/notify.ts`:**
```ts
import { prisma } from "@/lib/db/prisma";
import { sendPush } from "./fcm";

/** Push pros garçons de um bar quando um cliente chama na mesa. Best-effort. */
export async function notifyWaitersHelp(establishmentId: string, mesa: string): Promise<void> {
  const rows = await prisma.deviceToken.findMany({
    where: { establishmentId, userId: { not: null } },
    select: { token: true },
  });
  if (rows.length === 0) return;
  await sendPush(rows.map((r) => r.token), "🔔 Chamado na mesa", `${mesa} precisa de ajuda com o pagamento`);
}
```

- [ ] **Step 2: gatilho na rota.** Em `app/api/public/waiter/call/route.ts`, trocar o comentário `// TODO(Fase 2 / Plano 5): push...` por uma chamada best-effort DEPOIS de `createHelpRequest`, só quando o chamado é NOVO (não reusado) — pra não spammar push em re-tap:
```ts
  const r = await createHelpRequest({ establishmentId, locationLabel, clientId, orderId, reason });
  if (!r.reused) {
    try { await notifyWaitersHelp(establishmentId, locationLabel); } catch { /* best-effort */ }
  }
  return Response.json({ ok: true, reused: r.reused }, { headers: CORS });
```
(Import `notifyWaitersHelp` de `@/lib/push/notify`.)

- [ ] **Step 3: tsc + commit.**
Run: `npx tsc --noEmit` → sem erro.
```bash
git add lib/push/notify.ts "app/api/public/waiter/call"
git commit -m "feat(garcom): push aos garçons quando um chamado é criado (best-effort)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: App — Firebase (deps + init + config placeholders + entitlement)

**Files:** Modify: `pubspec.yaml`, `lib/main.dart`, `android/app/build.gradle.kts` (+ `android/build.gradle.kts`), `ios/Runner/Runner.entitlements`, `ios/Podfile` (se preciso). Create (placeholder): `android/app/google-services.json`, `ios/Runner/GoogleService-Info.plist`.

- [ ] **Step 1: deps.** `cd "d:/Projetos 2.0/Jurandir/jurandir-app" && flutter pub add firebase_core firebase_messaging` (se der ENOSPC → PARE e reporte BLOCKED; o usuário instala). `flutter_local_notifications` já está.

- [ ] **Step 2: Gradle (Android google-services plugin).** Seguir a doc do FlutterFire: adicionar o classpath/plugin `com.google.gms.google-services` no `android/build.gradle.kts` (ou settings) e `apply`/`id("com.google.gms.google-services")` no `android/app/build.gradle.kts`. (Ver a doc oficial do firebase_core pro Flutter — não inventar; seguir o passo a passo.)

- [ ] **Step 3: entitlement iOS.** Em `ios/Runner/Runner.entitlements` (junto do Apple Pay já existente), adicionar:
```xml
	<key>aps-environment</key>
	<string>production</string>
```

- [ ] **Step 4: placeholders dos arquivos Firebase.** Criar `android/app/google-services.json` e `ios/Runner/GoogleService-Info.plist` com um placeholder mínimo **comentado no report** de que o USUÁRIO substitui pelos reais (gerados por `flutterfire configure` ou baixados do console Firebase). ⚠️ O build Android NÃO roda sem um `google-services.json` válido — então a verificação desta task é só `flutter analyze`; o build real é do usuário após colocar os arquivos.

- [ ] **Step 5: init no `main.dart`.** Adicionar `await Firebase.initializeApp();` ANTES do `runApp` (depois do `ensureInitialized`, junto do `AlertService.init()`). Import `package:firebase_core/firebase_core.dart`.

- [ ] **Step 6: analyze + commit.**
Run: `flutter analyze lib/main.dart`
Expected: No issues (pode avisar sobre Firebase não configurado em runtime, mas analyze passa).
```bash
git add pubspec.yaml pubspec.lock lib/main.dart android ios
git commit -m "feat(garcom): firebase_core/messaging + init + entitlement de push (config do usuário pendente)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: App — PushService (token FCM → registro + handlers) + API client

**Files:** Create: `lib/core/push/push_service.dart`. Modify: `lib/core/data/public_api.dart` (registrar device), `lib/features/waiter/presentation/waiter_ready_screen.dart` (chamar o registro no boot do garçom), `lib/main.dart` (background handler top-level).

**Interfaces:** Consumes `AlertService` (Fase 1), `POST /devices` (Plano 1). Produces `PushService.registerWaiter(token)` + o handler foreground.

- [ ] **Step 1: método no `public_api.dart`:**
```dart
  /// Registra o token FCM do garçom (bearer) pra receber push.
  Future<void> registerDeviceWaiter(String token, String fcmToken) async {
    await _dio.post<Map<String, dynamic>>(
      '/devices',
      data: {'token': fcmToken},
      options: Options(headers: {'Authorization': 'Bearer $token'}),
    );
  }
```

- [ ] **Step 2: `lib/core/push/push_service.dart`:**
```dart
import 'package:firebase_messaging/firebase_messaging.dart';
import '../alert/alert_service.dart';

/// Push FCM: pede permissão (só garçom chama isto), pega o token, registra no
/// backend, e mostra o alerta em foreground. Best-effort — nunca lança.
class PushService {
  /// Chamar quando o GARÇOM loga/abre a fila. Pede permissão + registra o token.
  static Future<void> registerWaiter(Future<void> Function(String fcmToken) register) async {
    try {
      await FirebaseMessaging.instance.requestPermission();
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) await register(token);
      FirebaseMessaging.instance.onTokenRefresh.listen((t) { register(t).catchError((_) {}); });
      FirebaseMessaging.onMessage.listen((m) {
        final n = m.notification;
        AlertService.ring(title: n?.title ?? '🔔 Chamado', body: n?.body ?? 'Cliente precisa de ajuda');
      });
    } catch (_) {}
  }
}
```

- [ ] **Step 3: background handler no `main.dart`** (top-level, fora de qualquer classe; FCM exige):
```dart
@pragma('vm:entry-point')
Future<void> _fcmBackgroundHandler(RemoteMessage message) async {
  // Notification messages já são exibidas pelo SO em background; nada a fazer aqui.
}
```
e no `main`, depois do `Firebase.initializeApp()`: `FirebaseMessaging.onBackgroundMessage(_fcmBackgroundHandler);`. Imports: `package:firebase_messaging/firebase_messaging.dart`.

- [ ] **Step 4: chamar o registro no boot do garçom.** No `initState` do `WaiterReadyScreen` (onde a Fase 1 já chama `AlertService.ensurePermission()`), acrescentar o registro FCM:
```dart
    final token = ref.read(authProvider).token;
    if (token != null) {
      PushService.registerWaiter((fcm) => ref.read(publicApiProvider).registerDeviceWaiter(token, fcm));
    }
```
(Import `PushService`. Fazer best-effort — já é try/caught dentro do service.)

- [ ] **Step 5: analyze + commit.**
Run: `cd "d:/Projetos 2.0/Jurandir/jurandir-app" && flutter analyze lib/core/push lib/core/data/public_api.dart lib/features/waiter lib/main.dart`
Expected: No issues.
```bash
git add lib/core/push lib/core/data/public_api.dart lib/features/waiter/presentation/waiter_ready_screen.dart lib/main.dart
git commit -m "feat(garcom): registra token FCM do garçom + push foreground/background

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review
- Cobertura: sender FCM (T1) ✅; notify + gatilho (T2) ✅; Firebase deps/init/entitlement (T3) ✅; token registration + handlers (T4) ✅. Reusa Plano 1 (/devices) + Plano 5 (desenho).
- Review Focus: best-effort (T2 try/catch); token inválido removido (T1); permissão só garçom (T4, só o waiter screen chama); OAuth cacheado (T1); build Android depende de google-services.json real (T3 nota).
- Sem dep npm nova (crypto nativo). Sem schema change (DeviceToken já existe).
- Dependências do executor: doc oficial do FlutterFire (Gradle/Podfile) e FCM HTTP v1 — seguir a doc, não inventar shapes.
- Pré-reqs do usuário: projeto Firebase + google-services.json/plist + APNs + envs Vercel.
