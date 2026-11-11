// Prontidão da Tuna no payload PÚBLICO do bar (lista da Home, /api/public/{slug}
// e a página do bar no site). Sem isso `canCharge` não acha `tuna` e um bar
// Tuna nunca mostra Google/Apple Pay. Mesma regra da cobrança (`tunaReadiness`
// + `tunaReadinessContext`) — aqui só lemos o modo e a chave dos cartões UMA
// vez por requisição, e só quando algum bar roteia algo pra Tuna.
import { ensureTunaMode, tunaReadinessContext } from "./tuna";
import { tunaReadiness, type TunaContext, type TunaEstFields } from "./tuna-readiness";

export type TunaPublicFlags = { pixReady: boolean; cardReady: boolean };

type GatewayFields = {
  gatewayPix: string;
  gatewayCredit: string;
  gatewayDebit: string;
  gatewayApplePay: string;
  gatewayGooglePay: string;
};

export type TunaPublicEst = TunaEstFields & GatewayFields;

const NOT_READY: TunaPublicFlags = { pixReady: false, cardReady: false };

/** O bar manda algum método pra Tuna? */
export function routesToTuna(e: GatewayFields): boolean {
  return [e.gatewayPix, e.gatewayCredit, e.gatewayDebit, e.gatewayApplePay, e.gatewayGooglePay].includes(
    "TUNA",
  );
}

/** Contexto da prontidão: modo em vigor (`ensureTunaMode`, cacheado) + chave
 *  dos cartões. Falha ao ler qualquer um → null (falha FECHADO: nada da Tuna
 *  aparece pro cliente). */
export async function loadTunaPublicContext(): Promise<TunaContext | null> {
  try {
    const mode = await ensureTunaMode();
    const { getTunaCardsEnabled } = await import("@/lib/db/settings");
    return tunaReadinessContext(mode, await getTunaCardsEnabled());
  } catch {
    return null;
  }
}

/** Flags `tuna` do bar pro `toAppPayments`. Sem contexto → nada pronto. */
export function tunaPublicFlags(est: TunaEstFields, ctx: TunaContext | null): TunaPublicFlags {
  if (!ctx) return NOT_READY;
  const r = tunaReadiness(est, ctx);
  return { pixReady: r.pixReady, cardReady: r.cardReady };
}

/** Prontidão de vários bares numa leitura só: lê o contexto só se algum bar
 *  roteia pra Tuna; bar que não usa Tuna sai com tudo falso (não importa). */
export async function tunaPublicReadiness<T extends TunaPublicEst>(
  ests: readonly T[],
): Promise<(e: T) => TunaPublicFlags> {
  const ctx = ests.some(routesToTuna) ? await loadTunaPublicContext() : null;
  return (e) => (routesToTuna(e) ? tunaPublicFlags(e, ctx) : NOT_READY);
}
