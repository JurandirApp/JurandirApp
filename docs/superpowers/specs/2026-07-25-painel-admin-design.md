# Painel Admin (Fase 5)

Design de referência: `design_handoff_jurandir/Painel Admin.dc.html` (775 linhas).
Recriado pixel-perfect em `/admin` (substitui o placeholder). Dados **mock**; **PT-first**
(tradução EN é a próxima etapa, reutilizando a infra de i18n).

## Estrutura

- `app/[locale]/admin/page.tsx` — server: checa cookie `ADMIN`, passa `now` → `<AdminApp>`.
- `components/admin/AdminApp.tsx` — client: estado global + `AdminContext` + shell + modais.
- `components/admin/context.tsx` — `AdminContext` + `useAdmin` + `ADMIN_TABS`.
- `AdminSidebar` (label "Administração" + chip "N ativos"), `PeriodBar` (escopo/período/mês).
- Seções (`components/admin/sections/`): Dashboard, Faturamento, Buscas, Cadastros, Taxas, Backlog.
- `components/admin/modals/RegEditorModal.tsx` — CRUD de tenant (credenciais). Exclusão reusa
  o `ConfirmDialog`.
- Dados: `lib/data/admin.ts` (13 estabelecimentos, 12 compras, eventos de busca, constantes) ·
  `lib/admin/scale.ts` (fator por período/mês + sazonalidade + opções de mês).

## Período & escopo (barra global — Dashboard + Faturamento)

- Escopo por estabelecimento (filtro global) · períodos Dia/Semana/Quinzena/Mês · dropdown de mês.
- Números baseline (mensais) são escalados por `factorFor`: frações fixas para dia/semana/quinzena;
  para "Mês", razão sazonal `SEASON[mês]/SEASON[mêsAtual]` com gating pela data de cadastro (`since`).
- `now` vem do servidor (prop) → seed/escala determinísticos (sem mismatch de hidratação).

## Seções (todas fiéis)

1. **Dashboard** — 8 stat cards (GMV, receita de fees, pedidos, ticket, estabelecimentos, %USDC,
   fee médio, GMV/estab), donut GMV por método, participação por tipo (fat+vendas), top 5 (1º/2º/3º).
2. **Faturamento** — card por estabelecimento (fat/pedidos/fee) com status e "ao vivo".
3. **Buscas** — pills 7/30/Tudo + 4 cards (cidade/bairro/culinária/tipo) com top-8 e barras.
4. **Cadastros** — cards CRUD (tipo, meta, status, chips de credenciais/contato com senha
   mascarada, ver-painel, excluir) + modal editor + confirmação de exclusão. Quiosque do Mar
   não pode ser excluído.
5. **Taxas** — fee % inline por estabelecimento + receita de fee estimada (mês).
6. **Backlog** — header escuro, filtros (estabelecimento, método, dia, item, cartão, busca livre)
   + tabela (cartão mascarado bandeira + 4 últimos) + estado vazio.

## Decisões

- **Zero emoji**: medalhas 🥇🥈🥉 → `1º/2º/3º`; sem login interno (rota protegida por cookie).
- Reuso de `Dropdown`, `Input`, `Icon`, `ConfirmDialog`, `money`/`fmtFull`, hard shadows.

## Verificação (browser real)

6 seções capturadas e conferidas · troca de período · abertura do editor · **sem erros de página**.
`npm run build` + `npm run lint` limpos.

## Follow-up

- Traduzir o painel admin para EN (PT-first hoje) — mesma infra dos demais.
