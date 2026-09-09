# Módulo do Garçom — Plano 5: Notificações Push (FCM + APNs)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Push real avisando o **garçom** quando um item fica pronto e o **cliente** quando o pedido está a caminho/entregue.

**Architecture:** Firebase Cloud Messaging (FCM) roteia iOS (via APNs) e Android por um único token. O app registra o token em `POST /devices` (Plano 1). O backend, nos eventos READY/PICKED/DELIVERED, busca os tokens (garçons por `establishmentId`, cliente por `clientId`) e envia via FCM HTTP v1. iOS exige capability Push + APNs Key (config Apple, no molde do Apple Pay).

**Tech Stack:** Firebase (FCM HTTP v1), `firebase_core`/`firebase_messaging`/`flutter_local_notifications` (Flutter), Node (backend sender).

**Spec:** `docs/superpowers/specs/2026-09-09-modulo-garcom-entrega-design.md` (§8).
**Depende de:** Plano 1 (`DeviceToken`, `registerDevice`, `POST /devices`, e os `TODO(Plano 5)` nas ops `markItemReady`/`pickItem`/`deliverItem`).

## Global Constraints
- Herda constraints do Plano 1.
- **Config em portais é do USUÁRIO** (Firebase, Apple Developer). O executor faz o **código** (entitlement, deps Flutter, sender). Igual ao Apple Pay: **a config Apple precisa estar feita ANTES do build iOS**, senão a assinatura falha.
- Segredos do FCM (service account JSON / credenciais HTTP v1) via env — nunca commitar. `GoogleService-Info.plist`/`google-services.json` entram no app (não são segredo, mas seguem o padrão do projeto).

---

## File Structure
**Config (usuário, documentada aqui):** Firebase project + apps iOS/Android; APNs Auth Key `.p8`; capability Push no App ID; env do FCM na Vercel.
**Criar (backend):** `lib/push/fcm.ts` (sender), `lib/push/notify.ts` (lookup de tokens + mensagens por evento).
**Modificar (backend):** `lib/db/delivery.ts` (disparar push nos eventos), as rotas que chamam essas ops (nada extra se o push for dentro das funções de DB).
**Criar/Modificar (app):** `jurandir-app/ios/Runner/Runner.entitlements` (`aps-environment`), `jurandir-app/lib/core/push/push_service.dart` (init + token + registro + foreground), `main.dart` (init), `pubspec.yaml` (deps), arquivos Firebase (`google-services.json`, `GoogleService-Info.plist`), `codemagic.yaml` (incluir arquivos Firebase se necessário).

---

## Task 1: Config Apple + Firebase (usuário) e entitlement Push (código)

**Files:** Modify: `jurandir-app/ios/Runner/Runner.entitlements`.

- [ ] **Step 1 (USUÁRIO — Apple Developer):** App ID `br.app.jurandir` → habilitar capability **Push Notifications**. Em **Keys**, criar uma **APNs Auth Key** (`.p8`) e guardar Key ID + Team ID.
- [ ] **Step 2 (USUÁRIO — Firebase):** criar projeto Firebase; adicionar app **iOS** (`GoogleService-Info.plist`) e **Android** (`google-services.json`); em Project Settings → Cloud Messaging, subir a **APNs Auth Key** (`.p8` + Key ID + Team ID).
- [ ] **Step 3 (CÓDIGO):** adicionar o entitlement de push ao `Runner.entitlements` (junto do Apple Pay já existente):

```xml
	<key>aps-environment</key>
	<string>production</string>
```
(TestFlight/produção usam `production`; o ambiente sandbox de APNs é decidido pela assinatura — para builds de distribuição, `production` é o correto.)

- [ ] **Step 4:** colocar `GoogleService-Info.plist` em `ios/Runner/` e `google-services.json` em `android/app/`. Confirmar no `codemagic.yaml` que esses arquivos estão no repo/checkout (ou injetados como env-file). Commit (código + arquivos Firebase).

```bash
cd ../jurandir-app && git add ios/Runner/Runner.entitlements ios/Runner/GoogleService-Info.plist android/app/google-services.json
git commit -m "feat(garcom): entitlement de push + arquivos Firebase"
```

> ⚠️ Não builde o iOS antes do Step 1 estar feito (capability Push no App ID), senão a assinatura falha — mesmo padrão do Apple Pay.

---

## Task 2: Firebase Messaging no app (deps + init + registro de token)

**Files:** Modify: `pubspec.yaml`, `main.dart`, `android/`+`ios/` (config Gradle/pods do Firebase). Create: `jurandir-app/lib/core/push/push_service.dart`.

**Interfaces:** Consumes: `POST /devices` (Plano 1); `clientProfileProvider` (Plano 3, pro `clientId`); `authProvider` (token do garçom).

- [ ] **Step 1:** adicionar deps: `firebase_core`, `firebase_messaging`, `flutter_local_notifications` (o usuário roda `flutter pub add` se der ENOSPC). Configurar Gradle (google-services plugin) e Podfile conforme docs do FlutterFire.
- [ ] **Step 2:** `main.dart` → `await Firebase.initializeApp()` antes do `runApp`.
- [ ] **Step 3:** `push_service.dart`:

```dart
// Pede permissão (iOS), pega o token FCM, registra no backend, e trata foreground.
class PushService {
  static Future<void> registerToken(Ref ref) async {
    await FirebaseMessaging.instance.requestPermission();
    final token = await FirebaseMessaging.instance.getToken();
    if (token == null) return;
    final auth = ref.read(authProvider);
    if (auth.role == 'WAITER' && auth.token != null) {
      await ref.read(publicApiProvider).registerDeviceWaiter(auth.token!, token);
    } else {
      final clientId = ref.read(clientProfileProvider).clientId;
      await ref.read(publicApiProvider).registerDeviceClient(token, clientId);
    }
  }
  // FirebaseMessaging.onMessage → mostrar via flutter_local_notifications (foreground).
}
```

- [ ] **Step 4:** métodos em `public_api.dart`: `registerDeviceWaiter(token, fcmToken)` (bearer → `POST /devices {token: fcmToken}`), `registerDeviceClient(fcmToken, clientId)` (`POST /devices {token: fcmToken, clientId}`). Chamar `PushService.registerToken` no boot (após login do garçom; após onboarding do cliente) e no refresh do token (`onTokenRefresh`).
- [ ] **Step 5:** `flutter analyze lib/core/push` → No issues. Commit.

```bash
git add lib/core/push pubspec.yaml lib/main.dart lib/core/data/public_api.dart android ios
git commit -m "feat(garcom): firebase messaging + registro de token"
```

---

## Task 3: Sender FCM no backend

**Files:** Create: `lib/push/fcm.ts`, `lib/push/notify.ts`.

**Interfaces:**
- Produces: `sendPush(tokens: string[], title: string, body: string): Promise<void>` (FCM HTTP v1, remove tokens inválidos); `notifyItemReady(establishmentId, item)`, `notifyClient(clientId, title, body)`.

- [ ] **Step 1: `fcm.ts`** — envia via FCM HTTP v1 usando um **service account** (env `FCM_SERVICE_ACCOUNT_JSON` + `FCM_PROJECT_ID`). Obtém access token OAuth (google-auth) e faz `POST https://fcm.googleapis.com/v1/projects/{projectId}/messages:send` por token. Em erro `UNREGISTERED`/`INVALID_ARGUMENT`, apagar o token (`prisma.deviceToken.delete`). Testar o parser da resposta com um vitest de unidade (mockando fetch, como em `tests/payments/pagarme.test.ts`).
- [ ] **Step 2: `notify.ts`**:

```ts
import { prisma } from "@/lib/db/prisma";
import { sendPush } from "./fcm";

export async function notifyWaitersReady(establishmentId: string, produto: string, mesa: string) {
  const rows = await prisma.deviceToken.findMany({ where: { establishmentId, userId: { not: null } }, select: { token: true } });
  await sendPush(rows.map((r) => r.token), "Pedido pronto 🛎️", `${produto} — ${mesa}`);
}
export async function notifyClient(clientId: string | null, title: string, body: string) {
  if (!clientId) return;
  const rows = await prisma.deviceToken.findMany({ where: { clientId }, select: { token: true } });
  await sendPush(rows.map((r) => r.token), title, body);
}
```

- [ ] **Step 3:** `npx vitest run tests/push/fcm.test.ts` (o teste do parser) → PASS. `npx tsc --noEmit` → sem erro. Commit.

```bash
cd ../jurandir && git add lib/push tests/push
git commit -m "feat(garcom): sender FCM + lookup de tokens por evento"
```

---

## Task 4: Ligar os gatilhos nos eventos (READY/PICKED/DELIVERED)

**Files:** Modify: `lib/db/delivery.ts` (substituir os `TODO(Plano 5)`).

**Interfaces:** Consumes: `notifyWaitersReady`, `notifyClient` (Task 3). Precisa do `clientId`/`customerName` do pedido nas funções.

- [ ] **Step 1: `markItemReady`** — após gravar READY com sucesso, buscar `produto`(name)+`mesa`(locationLabel) e chamar `notifyWaitersReady(establishmentId, name, mesa)`. (Fazer o push **fora** da transação, best-effort — falha de push nunca derruba a operação.)
- [ ] **Step 2: `pickItem`** — após PICKED, `notifyClient(order.clientId, "Seu pedido está a caminho 🛎️", "{name} indo até você")`.
- [ ] **Step 3: `deliverItem`** — após DELIVERED, `notifyClient(order.clientId, "Entregue ✅", orderDone ? "Pedido totalmente entregue" : "{name} entregue")`.
- [ ] **Step 4:** embrulhar cada `notify*` em try/catch (best-effort). `npx tsc --noEmit` → sem erro. Commit.

```bash
git add lib/db/delivery.ts
git commit -m "feat(garcom): disparar push nos eventos READY/PICKED/DELIVERED"
```

---

## Task 5: Env + Codemagic + verificação de ponta a ponta

- [ ] **Step 1 (USUÁRIO):** setar na **Vercel**: `FCM_SERVICE_ACCOUNT_JSON` (JSON do service account do Firebase, Secure) e `FCM_PROJECT_ID`.
- [ ] **Step 2:** confirmar que o `codemagic.yaml` inclui `GoogleService-Info.plist`/`google-services.json` no build (ou injeta via env-file) e que o perfil `--create` já traz a capability Push (App ID configurado no Task 1).
- [ ] **Step 3 (verificação):** build 1.0.x no TestFlight + um device Android → marcar um item pronto no painel → confirmar que o garçom recebe o push; pegar/entregar → confirmar push no cliente. Ajustar textos se necessário.

---

## Self-Review (cobertura — fatia push)
- **§8 push ao garçom no READY** → Task 3 (`notifyWaitersReady`) + Task 4 Step 1. ✅
- **§8 push ao cliente no PICKED/DELIVERED** → Task 4 Steps 2-3. ✅
- **§8 device tokens (garçom por establishmentId, cliente por clientId)** → Task 2 (registro) + Task 3 (lookup). ✅
- **§8 config Apple/Firebase/Codemagic** → Task 1 + Task 5. ✅
- **Best-effort (push nunca derruba a operação)** → Task 4 Step 4. ✅
- **Consistência:** `sendPush`, `notifyWaitersReady`, `notifyClient` usados igual; `registerDeviceWaiter/Client` batem com `POST /devices`. ✅
- **Dependências do executor:** docs do FlutterFire (Gradle/Podfile) e do FCM HTTP v1 (OAuth via service account) — seguir a documentação oficial; não inventar shapes. Anotado.
