// Prontidão da Tuna POR MÉTODO. Módulo puro (sem Prisma/env) — o chamador
// monta o contexto (modo, chave dos cartões, allowlist de bares de teste).

export type TunaEstFields = {
  slug: string;
  tunaMerchantEnv: "TEST" | "PRODUCTION" | null;
  tunaPixStatus: string | null;
  tunaCardStatus: string | null;
};

export type TunaContext = {
  mode: "TEST" | "PRODUCTION";
  cardsEnabled: boolean;
  testSlugs: string[];
};

export type TunaReadiness = {
  visible: boolean;
  registered: boolean;
  pixReady: boolean;
  cardReady: boolean;
};

/** "a, B ,,c" → ["a","b","c"]. */
export function parseTunaTestSlugs(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function tunaReadiness(est: TunaEstFields, ctx: TunaContext): TunaReadiness {
  const visible =
    ctx.mode === "PRODUCTION" || ctx.testSlugs.includes(est.slug.trim().toLowerCase());
  const registered = est.tunaMerchantEnv === ctx.mode;
  const base = visible && registered;
  return {
    visible,
    registered,
    pixReady: base && est.tunaPixStatus === "active",
    cardReady: base && est.tunaCardStatus === "active" && ctx.cardsEnabled,
  };
}
