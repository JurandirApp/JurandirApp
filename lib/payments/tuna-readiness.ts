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

/** Pode abrir a sessão de tokenização da Tuna pra este pedido? Ordem: pedido
 *  inexistente → `notfound`; não é cartão (crédito/débito) Tuna aguardando
 *  pagamento sem cobrança iniciada → `notChargeable`; cartões Tuna desligados
 *  → `cardsDisabled`; senão `ok`. */
export function decideTunaSession(
  o: { status: string; method: string | null; provider: string | null; hasGatewayCharge: boolean } | null,
  cardsEnabled: boolean,
): "ok" | "cardsDisabled" | "notfound" | "notChargeable" {
  if (!o) return "notfound";
  const chargeable =
    o.status === "AWAITING_PAYMENT" &&
    o.provider === "TUNA" &&
    (o.method === "CREDIT" || o.method === "DEBIT") &&
    !o.hasGatewayCharge;
  if (!chargeable) return "notChargeable";
  if (!cardsEnabled) return "cardsDisabled";
  return "ok";
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
