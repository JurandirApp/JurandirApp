# Módulo do Garçom — Plano 3: App do cliente (onboarding + status por item + código)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Capturar nome+telefone do cliente (perfil local, sem conta no servidor), enviar isso no pedido, mostrar o código de entrega, e exibir o acompanhamento por item/quantidade.

**Architecture:** O cliente continua **anônimo no servidor** (mantém o que declaramos à Apple). O perfil (nome, telefone, `clientId` UUID) mora em `shared_preferences`. O pedido passa a carregar `customerName`/`customerPhone`/`clientId`. O acompanhamento por item lê os contadores que o backend passa a expor em `toClientOrder`.

**Tech Stack:** Flutter/Riverpod, dio, shared_preferences, uuid.

**Spec:** `docs/superpowers/specs/2026-09-09-modulo-garcom-entrega-design.md`
**Depende de:** Plano 1 (contadores no `OrderItem`, `Order.customerPhone/clientId`; fallback de código via `Order.number`).

## Global Constraints
- Cliente **sem login/conta** — perfil só local (`shared_preferences`), coerente com a submissão da App Store.
- Seguir os padrões de `jurandir-app/lib/features/*` e `jurandir-app/lib/core/data/` (Riverpod Notifier/Provider, `public_api.dart`). Verificar com `flutter analyze`.
- Backend: alterações mínimas em `toClientOrder`/`ClientOrder` seguem o padrão do repo `jurandir` (`npx tsc --noEmit`, vitest verde exceto as 2 falhas pré-existentes).

---

## File Structure
**Modificar (backend):** `lib/app/helpers.ts` (type `ClientOrder.items`), `lib/app/adapters.ts` (`toClientOrder` inclui contadores por item).
**Criar (app):** `jurandir-app/lib/core/data/client_profile.dart` (perfil local + clientId), `jurandir-app/lib/features/onboarding/presentation/profile_onboarding_screen.dart`.
**Modificar (app):** `jurandir-app/lib/core/data/models.dart` (`ClientOrderItem` + contadores), `jurandir-app/lib/features/checkout/presentation/checkout_screen.dart` (`_orderPayload`), `jurandir-app/lib/features/checkout/presentation/pix_screen.dart` (código), `jurandir-app/lib/features/pedidos/presentation/pedidos_screen.dart` (status por item), roteador/gate de onboarding, `pubspec.yaml` (uuid se necessário).

---

## Task 1: Backend — contadores por item no pedido do cliente

**Files:** Modify: `lib/app/helpers.ts`, `lib/app/adapters.ts`

**Interfaces:** Produces: `ClientOrder.items[]` passa a ter `{ name, qty, price, options?, ready, outForDelivery, delivered }`.

- [ ] **Step 1:** em `lib/app/helpers.ts`, estender o item de `ClientOrder`:

```ts
items: { name: string; qty: number; price: number; options?: string[];
         ready: number; outForDelivery: number; delivered: number }[];
```

- [ ] **Step 2:** em `lib/app/adapters.ts` `toClientOrder`, incluir no `DbOrder.items` os campos `qtyReady/qtyOutForDelivery/qtyDelivered` e mapear:

```ts
items: o.items.map((i) => ({
  name: i.name, qty: i.qty, price: num(i.unitPrice), options: optionLabels(i.options),
  ready: i.qtyReady, outForDelivery: i.qtyOutForDelivery, delivered: i.qtyDelivered,
})),
```
(Adicionar os campos ao type `DbOrder.items` do adapter. Garantir que `getOrdersByIds`/`ORDER_INCLUDE` traz esses campos — `items: true` já traz todos os escalares.)

- [ ] **Step 3:** ajustar o teste `tests/app/adapters.test.ts` (o item passa a ter os 3 contadores; base de teste ganha `qtyReady:0` etc.). Run `npx vitest run tests/app/adapters.test.ts` → PASS. `npx tsc --noEmit` → sem erro. Commit.

```bash
git add lib/app/helpers.ts lib/app/adapters.ts tests/app/adapters.test.ts
git commit -m "feat(garcom): contadores por item no pedido do cliente (toClientOrder)"
```

---

## Task 2: Perfil local do cliente (nome + telefone + clientId)

**Files:** Create: `jurandir-app/lib/core/data/client_profile.dart`. Modify: `pubspec.yaml` (garantir `uuid`), `jurandir-app/lib/core/data/models.dart` (se precisar de um type).

**Interfaces:** Produces: `clientProfileProvider` (Notifier) com `{ name, phone, clientId }` persistido em `shared_preferences`; `ClientProfile.isComplete`.

- [ ] **Step 1:** confirmar/adicionar `uuid` no `pubspec.yaml` (`flutter pub add uuid` — feito pelo usuário se der ENOSPC; senão o executor roda).
- [ ] **Step 2:** implementar `client_profile.dart`:

```dart
class ClientProfile {
  final String? name; final String? phone; final String clientId;
  const ClientProfile({this.name, this.phone, required this.clientId});
  bool get isComplete => (name ?? '').trim().isNotEmpty && (phone ?? '').replaceAll(RegExp(r'\D'), '').length >= 8;
}

class ClientProfileController extends Notifier<ClientProfile> {
  static const _kName = 'client_name', _kPhone = 'client_phone', _kId = 'client_id';
  @override
  ClientProfile build() {
    final p = ref.watch(sharedPrefsProvider);
    var id = p.getString(_kId);
    if (id == null || id.isEmpty) { id = const Uuid().v4(); p.setString(_kId, id); }
    return ClientProfile(name: p.getString(_kName), phone: p.getString(_kPhone), clientId: id);
  }
  Future<void> save(String name, String phone) async {
    final p = ref.read(sharedPrefsProvider);
    await p.setString(_kName, name.trim());
    await p.setString(_kPhone, phone.trim());
    state = ClientProfile(name: name.trim(), phone: phone.trim(), clientId: state.clientId);
  }
}
final clientProfileProvider = NotifierProvider<ClientProfileController, ClientProfile>(ClientProfileController.new);
```
(Reusar `sharedPrefsProvider` de `onboarding_controller.dart`.)

- [ ] **Step 3:** `flutter analyze lib/core/data/client_profile.dart` → No issues. Commit.

```bash
cd ../jurandir-app && git add lib/core/data/client_profile.dart pubspec.yaml
git commit -m "feat(garcom): perfil local do cliente (nome+telefone+clientId)"
```

---

## Task 3: Tela de onboarding (nome + telefone) + gate

**Files:** Create: `jurandir-app/lib/features/onboarding/presentation/profile_onboarding_screen.dart`. Modify: o roteador (`go_router`) e/ou a home pra exibir o onboarding quando `!clientProfile.isComplete`.

**Interfaces:** Consumes: `clientProfileProvider` (Task 2).

- [ ] **Step 1:** tela com 2 campos (Nome; Telefone com máscara/`inputMode: phone`) + botão "Continuar" que chama `clientProfileProvider.notifier.save(...)`. Estilo dos componentes existentes (`AppColors`, `AppText`, `app_button.dart`). Validar telefone (≥8 dígitos).
- [ ] **Step 2: Gate** — na entrada do app (onde o `go_router` decide a rota inicial, ou um wrapper na home), se `!clientProfile.isComplete` → mostrar o onboarding uma vez. Não bloquear navegação depois de salvo.
- [ ] **Step 3:** `flutter analyze lib/features/onboarding` → No issues. Commit.

```bash
git add lib/features/onboarding lib/app_router.dart  # ajustar ao caminho real do router
git commit -m "feat(garcom): onboarding do cliente (nome+telefone)"
```

---

## Task 4: Enviar nome/telefone/clientId no pedido + exibir código

**Files:** Modify: `jurandir-app/lib/features/checkout/presentation/checkout_screen.dart` (`_orderPayload`), `pix_screen.dart` e `pedidos_screen.dart` (código), `jurandir-app/lib/core/data/models.dart` (`ClientOrder` ganha `deliveryCode`? — ver Step 3).

**Interfaces:** Consumes: `clientProfileProvider`.

- [ ] **Step 1:** em `_orderPayload`, incluir do perfil:

```dart
final prof = ref.read(clientProfileProvider);
// ...
if ((prof.name ?? '').isNotEmpty) 'customerName': prof.name,
if ((prof.phone ?? '').isNotEmpty) 'customerPhone': prof.phone,
'clientId': prof.clientId,
```
(Se já existe `customerName` vindo do `authProvider`, priorizar o do perfil.)

- [ ] **Step 2:** **código de entrega** — o backend deriva (4 últimos do telefone, ou fallback `Order.number`). Fazer o backend **devolver o código** no `toClientOrder` (`code4`) pra o app não precisar recalcular o fallback. Adicionar `code4` ao `ClientOrder` (backend) = `deliveryCode(o.customerPhone, ultimos4(o.number))`. (Pequena mudança no adapter — pode entrar aqui ou no Plano 1; registrar como parte desta task.)
- [ ] **Step 3:** parsear `code4` em `ClientOrder.fromJson` e exibir na `pix_screen`/`pedidos_screen`/tela do pedido: **"Seu código de entrega: 4587"** (fonte grande, destacado).
- [ ] **Step 4:** `flutter analyze` (arquivos tocados) + `npx tsc --noEmit` (backend) → limpos. Commit.

```bash
git add lib/features/checkout lib/features/pedidos lib/core/data/models.dart
git commit -m "feat(garcom): enviar perfil no pedido + exibir codigo de entrega"
```
```bash
cd ../jurandir && git add lib/app/adapters.ts lib/app/helpers.ts && git commit -m "feat(garcom): expor code4 no pedido do cliente"
```

---

## Task 5: Acompanhamento por item/quantidade (cliente)

**Files:** Modify: `jurandir-app/lib/core/data/models.dart` (`ClientOrderItem` + contadores), `jurandir-app/lib/features/pedidos/presentation/pedidos_screen.dart`.

**Interfaces:** Consumes: `ClientOrder.items` com `ready/outForDelivery/delivered` (Task 1).

- [ ] **Step 1:** em `ClientOrderItem.fromJson`, parsear `ready`, `outForDelivery`, `delivered` (default 0). Adicionar um getter `String statusLabel` que resume: ex. "3 entregues · 2 preparando" (preparando = qty − ready − out − delivered).
- [ ] **Step 2:** na `pedidos_screen`, sob cada item, mostrar o breakdown por quantidade com cores (preparando/pronto/a caminho/entregue). Reaproveitar o estilo já usado pras opções (linha secundária pequena).
- [ ] **Step 3:** `flutter analyze lib/features/pedidos lib/core/data` → No issues. Commit.

```bash
git add lib/features/pedidos lib/core/data/models.dart
git commit -m "feat(garcom): acompanhamento por item/quantidade (cliente)"
```

---

## Self-Review (cobertura — fatia cliente)
- **§7.1 onboarding nome+telefone (local, sem conta)** → Task 2 + Task 3. ✅
- **§7.2 enviar no pedido + código visível** → Task 4. ✅
- **§7.2 status por item/quantidade** → Task 1 (backend) + Task 5 (UI). ✅
- **§7.3 fallback de código** → Task 4 Step 2 (`code4` derivado no backend, exibido no app). ✅
- **Cliente segue anônimo no servidor** → perfil só local (Task 2). ✅
- **Consistência:** `code4`, `ready/outForDelivery/delivered` usados igual no backend e no app. Ajuste do teste do adapter incluído (Task 1 Step 3). ✅
- **Dependência do executor:** caminho real do `go_router` (gate de onboarding); confirmar se `customerName` hoje vem do `authProvider` pra decidir a prioridade. Anotado.
