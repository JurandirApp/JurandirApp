# Horário de funcionamento por dia da semana

**Data:** 2026-07-30
**Contexto:** o painel tinha só um campo de texto livre (`Establishment.hours`) e um
"Início do dia operacional" (uma hora única, `dayStartHour`) usado no filtro de
pedidos. Bares reais têm horários diferentes por dia (segunda fechado, sexta 18h–6h,
sábado 14h–4h). O modelo estruturado `weeklyHours` (JSON) já existe e já alimenta o
"Aberto/Fechado" da landing via `isOpenAt`, mas **não tinha editor**.

## Objetivo

Um editor semanal (7 dias, até 2 turnos por dia, com virada de madrugada) no **Perfil**,
que vira a **fonte única** de horário e deriva o resto.

## Modelo de dados

Novo módulo `lib/domain/schedule.ts` (fonte canônica + testes puros):

- `TimeWindow = { o: string; c: string }` — `"HH:MM"`.
- `DayWindows = TimeWindow[]` — 0 a 2 janelas; lista vazia = **fechado**. A última
  janela pode virar a madrugada (`fecha ≤ abre`, ex.: `18:00`→`06:00`).
- `WeekSchedule = DayWindows[]` — length 7, **índice 0 = domingo** (bate com `Date.getDay()`).
- `EMPTY_WEEK` — 7 dias fechados.
- `normalizeWeekly(json): WeekSchedule` — parse seguro do JSON do banco. Converte o
  shape **antigo** (`{o,c} | null`) pro novo, filtra janelas inválidas, limita a 2/dia,
  garante length 7.
- `isOpenAt(week, date)` — reescrito: checa todas as janelas do dia + herança de
  madrugada da última janela de ontem.
- `formatWeekly(week, { labels, and, allClosed }): string` — agrupa dias consecutivos
  (ordem seg→dom) com janelas iguais → `"Ter–Qui 18h–23h · Sex 18h–6h · Sáb 14h–4h"`.
  Dias fechados são omitidos; se todos fechados → `allClosed`.
- `deriveDayStartHour(week): number` — pega o fechamento de madrugada mais tarde da
  semana (`0 < fecha ≤ abre`), arredonda a hora pra cima, clamp 0–23. Sem madrugada → 0.
  Ex.: Sex fecha 06:00, Sáb 04:00 → **6**.

`Establishment.weeklyHours` continua sendo a verdade. Ao salvar o perfil, gravam-se os
derivados: `hours` (String, cache de exibição via `formatWeekly` em PT), `dayStartHour`
(`deriveDayStartHour`) e `dayStartSet = true`.

## UI (Perfil)

`WeeklyHoursEditor` no lugar do campo de texto "horário": 7 linhas (ordem seg→dom), cada
uma com toggle **Aberto/Fechado**; quando aberta, 1–2 turnos com dropdowns de horário
(passos de 30 min), botão **"+ turno"** e **"remover"** no 2º, além de atalhos
**"Copiar seg → todos"** e **"Fechar todos"**. Aviso sutil quando `fecha ≤ abre`
("vira a madrugada"). O preview do topo mostra o resumo derivado ao vivo.

## O que muda / sai

- Remove o card "Início do dia operacional" do Config (agora derivado).
- `saveProfileAction` passa a receber `weekly`, validar via zod e gravar os derivados;
  retorna `dayStartHour`/`dayStartSet` pro cliente atualizar e refazer a busca de pedidos.
- Remove `saveDayStartAction` e o setter manual `setDayStartHour`.
- O banner "Confirme o horário" (Pedidos) some quando `dayStartSet` e passa a apontar
  pro **Perfil**.
- `isOpenAt`/`WeekSchedule`/`TimeWindow` migram pra `schedule.ts`; `establishments.ts`
  re-exporta pra não quebrar importadores; mock (beach/bar/bruxa) convertido pro novo shape.
- `site/adapters.ts` usa `normalizeWeekly`.

## Testes

- `tests/domain/schedule.test.ts` (novo): `isOpenAt` (2 turnos, madrugada, fechado),
  `formatWeekly`, `deriveDayStartHour`, `normalizeWeekly` (antigo→novo).
- `tests/site/adapters.test.ts`: atualizado pro novo shape.

## Edge cases

Dia fechado; 2 turnos (almoço + jantar); virada de madrugada em qualquer turno; fecha
exatamente `00:00` (fecha à meia-noite, **não** conta como madrugada na derivação).
