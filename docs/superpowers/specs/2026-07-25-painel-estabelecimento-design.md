# Painel do Estabelecimento (Fase 3)

Design de referência: `design_handoff_jurandir/Painel do Estabelecimento.dc.html` (1096 linhas).
Recriado pixel-perfect em Next.js. Dados **mock** (seed do protótipo) — Fase 2 troca por Prisma.

## Estrutura

- `app/painel/page.tsx` — server: checa cookie `ESTABLISHMENT`, passa `now` (relógio da
  requisição, para seed determinístico SSR/hidratação) → `<PanelApp>`.
- `components/panel/PanelApp.tsx` — client: detém TODO o estado (pedidos, cardápio, QRs, filtros,
  formulários, modais, notificações), tempo real, e provê o `PanelContext`.
- `components/panel/context.tsx` — `PanelContext` + `usePanel()` + tipos + `TABS`.
- Shell: `Sidebar`, `NotificationBell`, `RealtimeNotif`, `Toast`.
- Seções (`components/panel/sections/`): `PedidosSection`, `CardapioSection`, `QrSection`,
  `KpisSection`, `AuditoriaSection`, `PerfilSection`, `ConfigSection`.
- Modais (`components/panel/modals/`): `ItemEditorModal`, `ConfirmDialog`, `QrZoomModal`.
- Dados/cálculo: `lib/data/panel.ts` (seed + constantes) · `lib/panel/helpers.ts` (money, totais,
  formatação de datas, URL/imagem do QR).

## Seções (todas fiéis ao protótipo)

1. **Pedidos** — filtros por status, grupos (aguardando/produção/entregue), cards com split progress,
   obs, cartão mascarado, ação Entregue/Imprimir. Card "aguardando" com anel rosa.
2. **Cardápio** — grid, pills de categoria, CSV modelo/importar, editor CRUD (modal), excluir (confirm).
3. **QR Codes** — gerar por label, grid (imagem via api.qrserver.com), zoom (modal), excluir (confirm).
4. **KPIs** — períodos, 4 stat cards, donut SVG por categoria, vendas por método (logos Pix/USDC reais,
   glifos crédito/débito, expansível), itens mais vendidos (qtd + faturamento, medalhas 1º/2º/3º).
5. **Auditoria** — header escuro, filtros (data + mesa + método), tabela com totais, paginação (8/pág).
6. **Perfil** — preview "como o cliente vê" + formulário completo (taxa %, raio, contatos).
7. **Config** — alterar senha (validação), impressora (auto-print toggle, conexão, IP/porta/modelo,
   teste/salvar), notificações (WhatsApp/e-mail toggles).

## Tempo real (mock)

`INCOMING_ORDERS` chegam por timers após o mount → prepend na fila + toast "Novo pedido recebido!"
(+ `navigator.vibrate`) + badge no sino e na aba Pedidos. Fase 6 substitui por Supabase Realtime/Pusher.

## Decisões

- **Zero emoji**: categorias e itens sem foto usam Material Symbols (`CAT_ICON`); toasts e tagline
  sem emoji; campo "emoji" do editor removido (fallback vira ícone da categoria).
- **Auth**: `/painel` protegido pelo cookie de sessão (mock). "Sair" usa a Server Action `logout`.
- **now via prop**: timestamps do seed relativos ao `now` do servidor → sem mismatch de hidratação.
- Regras de taxa mantidas: fee plataforma 8% + serviço 10% no "Valor"; gateway por método na auditoria.

## Verificação (browser real)

7 seções capturadas e conferidas (pixel-faithful) · deliver move pedido · editor abre/salva ·
período KPI troca · toggle de config alterna · notificação em tempo real dispara e incrementa o badge.
`npm run build` (estático onde aplicável) + `npm run lint` limpos.
