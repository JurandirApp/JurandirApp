import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["pt", "en"],
  defaultLocale: "pt",
  // Portuguese stays at `/`; English is served under `/en`.
  localePrefix: "as-needed",
  // Preferência de idioma persistente (1 ano) — o seletor do painel/área do
  // cliente troca o locale e o middleware lembra na próxima visita.
  localeCookie: { maxAge: 60 * 60 * 24 * 365 },
});

export type Locale = (typeof routing.locales)[number];
