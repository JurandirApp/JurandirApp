import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["pt", "en"],
  defaultLocale: "pt",
  // Portuguese stays at `/`; English is served under `/en`.
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
