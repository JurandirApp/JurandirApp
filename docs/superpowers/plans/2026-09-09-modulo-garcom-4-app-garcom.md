# Módulo do Garçom — Plano 4: App do garçom (fluxo inteiro)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A área do garçom no app: login por role, lista de "prontos para retirada" (fonte grande, uma mão), pegar item (claim), e confirmar entrega por código.

**Architecture:** Mesmo app Flutter. No login, `role == WAITER` roteia pra `/waiter` (o garçom não vê cliente nem painel). As telas consomem as rotas do garçom (bearer) do Plano 1, com **polling ~4s** na lista. Fluxo: Visualizou → Pegou → Digita código → Confirma. Botões grandes, mínimo de toques.

**Tech Stack:** Flutter/Riverpod, go_router, dio.

**Spec:** `docs/superpowers/specs/2026-09-09-modulo-garcom-entrega-design.md`
**Depende de:** Plano 1 (rotas `GET /waiter/ready`, `POST /waiter/order-items/:id/pick`, `POST /waiter/order-items/:id/deliver`; login retornando role WAITER).

## Global Constraints
- Herda constraints do Plano 1. App: seguir padrões de `jurandir-app/lib/features/*`, `public_api.dart` (bearer via `authProvider` token), Riverpod. `flutter analyze` limpo.
- UX: **uma mão**, botões grandes, sem menus. Fonte grande em Produto + Mesa + Cliente.
- O token do garçom sai do fluxo de login existente (o mesmo `authProvider`), só que com `role == 'WAITER'`.

---

## File Structure
**Criar:**
- `jurandir-app/lib/features/waiter/data/waiter_models.dart` — `ReadyItem`.
- `jurandir-app/lib/features/waiter/data/waiter_api.dart` — provider que chama as rotas do garçom (ou métodos em `public_api.dart`).
- `jurandir-app/lib/features/waiter/presentation/waiter_ready_screen.dart` — lista de prontos.
- `jurandir-app/lib/features/waiter/presentation/waiter_deliver_screen.dart` — confirmação por código.
**Modificar:**
- `jurandir-app/lib/core/data/public_api.dart` — `waiterReady/waiterPick/waiterDeliver`.
- o roteador (`go_router`) — rota `/waiter` + gate por role.
- o pós-login (onde decide a home por role hoje) — WAITER → `/waiter`.

---

## Task 1: Métodos de API do garçom

**Files:** Modify: `jurandir-app/lib/core/data/public_api.dart`. Create: `jurandir-app/lib/features/waiter/data/waiter_models.dart`.

**Interfaces:**
- Produces: `ReadyItem { orderId, orderItemId, name, mesa, cliente, qtyReady }`; métodos `waiterReady(token) → List<ReadyItem>`, `waiterPick(token, itemId, qty) → bool`, `waiterDeliver(token, itemId, qty, code) → ({bool ok, String? error, bool orderDone})`.

- [ ] **Step 1: `waiter_models.dart`**

```dart
class ReadyItem {
  final String orderId, orderItemId, name, mesa, cliente;
  final int qtyReady;
  const ReadyItem({required this.orderId, required this.orderItemId, required this.name,
    required this.mesa, required this.cliente, required this.qtyReady});
  factory ReadyItem.fromJson(Map<String, dynamic> j) => ReadyItem(
    orderId: (j['orderId'] as String?) ?? '', orderItemId: (j['orderItemId'] as String?) ?? '',
    name: (j['name'] as String?) ?? '', mesa: (j['mesa'] as String?) ?? '',
    cliente: (j['cliente'] as String?) ?? '', qtyReady: (j['qtyReady'] as num?)?.toInt() ?? 0);
}
```

- [ ] **Step 2: métodos em `public_api.dart`** (bearer via header, igual `establishmentOrders`)

```dart
Future<List<ReadyItem>> waiterReady(String token) async {
  final res = await _dio.get<Map<String, dynamic>>('/waiter/ready',
    options: Options(headers: {'Authorization': 'Bearer $token'}));
  return ((res.data!['items'] as List?) ?? const []).cast<Map<String, dynamic>>().map(ReadyItem.fromJson).toList();
}
Future<bool> waiterPick(String token, String itemId, int qty) async {
  try {
    final res = await _dio.post<Map<String, dynamic>>('/waiter/order-items/$itemId/pick',
      data: {'qty': qty}, options: Options(headers: {'Authorization': 'Bearer $token'}));
    return (res.data?['ok'] as bool?) ?? false;
  } on DioException { return false; } // 409 = já retirado
}
Future<({bool ok, String? error, bool orderDone})> waiterDeliver(String token, String itemId, int qty, String code) async {
  try {
    final res = await _dio.post<Map<String, dynamic>>('/waiter/order-items/$itemId/deliver',
      data: {'qty': qty, 'code': code}, options: Options(headers: {'Authorization': 'Bearer $token'}));
    final d = res.data!;
    return (ok: (d['ok'] as bool?) ?? false, error: null, orderDone: (d['orderDone'] as bool?) ?? false);
  } on DioException catch (e) {
    final err = (e.response?.data is Map) ? (e.response!.data['error'] as String?) : null;
    return (ok: false, error: err ?? 'erro', orderDone: false);
  }
}
```

- [ ] **Step 3:** `flutter analyze lib/core/data lib/features/waiter/data` → No issues. Commit.

```bash
cd ../jurandir-app && git add lib/core/data/public_api.dart lib/features/waiter/data
git commit -m "feat(garcom): API do garcom no app (ready/pick/deliver)"
```

---

## Task 2: Roteamento por role (WAITER → /waiter)

**Files:** Modify: o roteador `go_router` (rota `/waiter`), e o ponto pós-login onde a home é escolhida por role.

**Interfaces:** Consumes: `authProvider` (token + role).

- [ ] **Step 1:** localizar onde hoje o app decide a tela por role (ADMIN/ESTABLISHMENT/cliente) após login. Adicionar: `role == 'WAITER'` → `context.go('/waiter')`.
- [ ] **Step 2:** registrar a rota `/waiter` → `WaiterReadyScreen` no `go_router`. Guard: se não autenticado como WAITER, redireciona pro login.
- [ ] **Step 3:** `flutter analyze` (arquivos do router) → No issues. Commit.

```bash
git add lib/app_router.dart lib/features/auth  # ajustar aos caminhos reais
git commit -m "feat(garcom): roteamento por role WAITER"
```

---

## Task 3: Tela "Prontos para retirada" (lista + pegar)

**Files:** Create: `jurandir-app/lib/features/waiter/presentation/waiter_ready_screen.dart`.

**Interfaces:** Consumes: `waiterReady`, `waiterPick` (Task 1); `authProvider` (token).

- [ ] **Step 1:** `ConsumerStatefulWidget` com **polling ~4s** (`Timer.periodic` recarregando `waiterReady`), igual ao padrão de `pix_screen.dart`. Estado de loading/erro/vazio ("Nenhum pedido pronto agora").
- [ ] **Step 2:** cards **grandes**: `Produto` (ex.: "3× Caipirinha") em destaque + `Mesa` + `Cliente`, e um botão grande **[PEGAR PEDIDO]** ocupando a largura. Default pega `qtyReady` inteiro da linha; um stepper opcional `−/＋` permite pegar menos (mín 1, máx qtyReady).
- [ ] **Step 3:** ao tocar PEGAR: `waiterPick(token, itemId, qty)`. Se `true` → `context.push('/waiter/deliver', extra: <dados do item + qty>)` (abre a confirmação **automaticamente**). Se `false` → toast "Outro garçom já pegou" + refresh.
- [ ] **Step 4:** `flutter analyze lib/features/waiter/presentation/waiter_ready_screen.dart` → No issues. Commit.

```bash
git add lib/features/waiter/presentation/waiter_ready_screen.dart
git commit -m "feat(garcom): tela de prontos para retirada (lista + pegar)"
```

---

## Task 4: Tela de confirmação de entrega (código)

**Files:** Create: `jurandir-app/lib/features/waiter/presentation/waiter_deliver_screen.dart`. Modify: `go_router` (rota `/waiter/deliver`).

**Interfaces:** Consumes: `waiterDeliver` (Task 1). Recebe via `extra`: `{ orderItemId, name, mesa, cliente, qty }`.

- [ ] **Step 1:** tela grande: "ENTREGA — {mesa}", "Cliente: {cliente}", "Pedido: {qty}× {name}". Campo de **código** de 4 dígitos (`inputMode: number`, `maxLength: 4`, fonte grande) + botão grande **[CONFIRMAR ENTREGA]**.
- [ ] **Step 2:** ao confirmar: `waiterDeliver(token, itemId, qty, code)`.
  - `ok == true` → "✅ ENTREGUE" (+ se `orderDone` → "Pedido totalmente entregue"); volta pra lista (`context.go('/waiter')`).
  - `error == 'code'` → "Código inválido, confira com o cliente" (não sai da tela).
  - outros erros → toast genérico.
- [ ] **Step 3:** garantir operação **uma mão**: botões ocupando largura, alvo de toque ≥ 56px, sem navegação extra.
- [ ] **Step 4:** `flutter analyze lib/features/waiter` → No issues. Commit.

```bash
git add lib/features/waiter/presentation/waiter_deliver_screen.dart lib/app_router.dart
git commit -m "feat(garcom): tela de confirmacao de entrega por codigo"
```

---

## Self-Review (cobertura — fatia app do garçom)
- **§6 login por role** → Task 2. ✅
- **§6 lista prontos (Produto+Mesa+Cliente, fonte grande, polling)** → Task 3. ✅
- **§6 pegar (claim + abre confirmação automático)** → Task 3 Step 3. ✅
- **§6 confirmar por código** → Task 4. ✅
- **Concorrência visível (outro garçom já pegou)** → Task 3 Step 3 (409 → toast + refresh). ✅
- **Consistência:** `waiterReady/waiterPick/waiterDeliver` e `ReadyItem` usados igual nas telas. ✅
- **Dependência do executor:** caminhos reais do `go_router` e do ponto de decisão de home por role; confirmar como o token do garçom fica disponível (mesmo `authProvider`). Anotado nas Tasks 2-3.
