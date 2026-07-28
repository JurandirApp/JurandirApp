# Fase 1 — Setup + Landing Page (Jurandir)

Design de referência: `design_handoff_jurandir/` (protótipos `.dc.html` hi-fi + README de handoff).
Meta: recriar a landing em Next.js **pixel-perfect**, com os tokens do design system.

## Decisões (aprovadas)

- **Escopo:** scaffold completo do projeto Next.js + landing inteira (Fase 1 do README).
- **Emojis → Material Symbols:** o protótipo usa emoji (🍹🍤🌊), mas o design system exige "zero emoji".
  Substituídos por ícones Material Symbols: `local_bar` (caipirinha), `set_meal` (camarão), `waves` (marquee).
- **Package manager:** npm.
- **Tailwind v3 + `tailwind.config.ts`** (o `create-next-app` trouxe v4; foi feito downgrade para casar com
  a abordagem de tokens do handoff).

## Stack

- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript.
- Tailwind CSS v3.4 (`tailwind.config.ts`), PostCSS + Autoprefixer.
- `clsx` + `tailwind-merge` (util `cn()`).
- Fontes: `next/font/google` — Bricolage Grotesque (`--font-display`), Hanken Grotesk (`--font-body`).
  Material Symbols Outlined via `<link>` (icon font, `display=block`).

## Estrutura

```
app/
  layout.tsx            fontes + Material Symbols + metadata base (lang pt-BR)
  globals.css           reset, .ms (icon helper), scrollbar fina, no-scrollbar
  (site)/page.tsx       landing — providers + seções + metadata/SEO
components/
  ui/                   Button, Card, Dropdown, Input(+Textarea), Badge, Pill, Icon
  site/                 Hero, Marquee, Categories, Benefits, HowItWorks,
                        RankingHypados, Footer, Mascot, lead-modal, ranking-filters
lib/
  utils.ts              cn(), formatBRL(), formatNumber() (pt-BR)
  data/establishments.ts  seed + horários + isOpenAt()
  data/landing.ts       categorias, benefícios, passos, marquee, stats
tailwind.config.ts      tokens do design system
```

## Tokens (design system)

- Cores: `page #F8EFDA`, `sand #EDD8A3`, `dune/50`, `ink #141821`, `coral #FF6B4A` / `coral-emph #EF5130`,
  `ocean` (0F7E84/0C6A70/0C4347), `sun #FFC24B`, `status` (rose/amber/emerald).
- Sombras: `hard` (4px 4px 0 0 ink), `hard-lg` (6px 6px), `float`, `dropdown`, `modal`.
- Radius extra: `20`, `28`. Keyframes: `marquee`, `floaty`, `fadeUp`.

## Componentes / seções

- **Dropdown** — custom, acessível, nunca `<select>`. Trigger via render-prop (3 estilos: pill do hero,
  chip do filtro, input do modal). Backdrop invisível fecha ao clicar fora; Escape fecha; check coral na
  selecionada; fundo areia na ativa; chevron gira 180°.
- **Hero** — wordmark 22vw de fundo, glow sun, finder (dropdown de cidade + "Buscar" com smooth-scroll ao
  ranking), mascote SVG inline (copiado), cards flutuantes + badge QR, marquee infinita, stats fadeUp.
- **RankingHypados** — 5 filtros (cidade/bairro/culinária/tipo/dia) + "Aberto agora" + "Limpar";
  ordena por nº de pedidos; badge sun no top 3; estrelas fracionadas; aberto/fechado por horário.
- **LeadModal** — form (nome, responsável, cidade, WhatsApp, e-mail, tipo, mensagem), validação dos `*`,
  estado de sucesso. **Submit é mock nesta fase** (Fase 6 conecta o backend).
- **Filtros compartilhados** — `RankingFiltersProvider`: escolher cidade no hero já filtra o ranking
  (estado unificado como no protótipo).

## Movimento / animações

- Fiel ao protótipo: `marquee` (faixa), `floaty` (mascote), `fadeUp` (entrada do hero, staggered).
- **Adição:** `Reveal` (IntersectionObserver) revela as seções abaixo do hero com `fadeUp` ao entrarem
  na viewport (categorias, benefícios, como funciona, ranking). CSS-driven (`.reveal`/`.reveal-in`),
  respeita `prefers-reduced-motion`, com fallback `<noscript>`. Estado final idêntico ao protótipo.
- `fadeUp` usa `fill-mode: backwards` (não `both`) para não deixar `transform` residual — que criaria
  containing block e prenderia o backdrop `position:fixed` dos dropdowns.

## Regras respeitadas

- Zero `<select>` nativo · zero emoji · foco de input **ink** (nunca laranja) · sem hovers ·
  hard shadows nos cards · números pt-BR · rankings `1º/2º/3º`.

## Fora de escopo (fases seguintes)

- Backend/Prisma, Auth, envio real do lead, analytics `SearchEvent` (Fases 2/6).
- App do Cliente e painéis (Fases 3–5): links "Ver cardápio"/"Acessar painel" são placeholders
  (`#mais-hypados` / `#`) nesta fase.
- Hidratação de tempo: `now` é calculado só no cliente no ranking (evita mismatch SSR).

## Verificação

- `npm run build` → prerender estático, sem erros de TypeScript.
- `npm run lint` → 0 erros, 0 warnings.
- SSR renderiza todo o conteúdo; scan confirma zero emoji e presença dos Material Symbols.
