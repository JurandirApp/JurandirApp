import type { PaymentEnv, PaymentProvider, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getTunaMode, getTunaCardsEnabled } from "@/lib/db/settings";
import { tunaMerchantSchema } from "@/lib/validation";
import { registerTunaMerchant, TunaError, ensureTunaMode, tunaReadinessContext } from "@/lib/payments/tuna";
import { isDefiniteGatewayFailure } from "@/lib/payments/gateway-errors";
import { tunaErrorSummary } from "@/lib/payments/tuna-webhook";
import { ROUTE_FALLBACK, ROUTE_KEYS, type RouteKey } from "@/lib/payments/capabilities";
import { tunaReadiness, type TunaReadiness } from "@/lib/payments/tuna-readiness";

// Serviço compartilhado do cadastro do bar na Tuna: usado pela server action do
// painel web e pelas rotas do app do estabelecimento. Nunca loga o formulário.

/** Mensagem curta pro cliente: `message.message` da Tuna quando houver; nunca o corpo cru. */
function tunaClientMessage(e: unknown): string {
  if (e instanceof TunaError) {
    try {
      const j = JSON.parse(e.body) as { message?: { message?: unknown } | string };
      const m = typeof j.message === "string" ? j.message : j.message?.message;
      if (typeof m === "string" && m.trim()) return m.trim().slice(0, 200);
    } catch {
      /* corpo não-JSON: cai na mensagem genérica */
    }
    return "tunaRejected";
  }
  return "error";
}

export async function registerEstablishmentInTuna(
  establishmentId: string,
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = tunaMerchantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const condition = (process.env.TUNA_MERCHANT_CONDITION ?? "").trim();
  if (!condition) return { ok: false, error: "notConfigured" };
  const mcc = (process.env.TUNA_MERCHANT_MCC ?? "").trim() || "5812";

  // Modo indisponível (banco fora, sem cache) → tente depois; nada gravado nem enviado.
  let mode: PaymentEnv;
  try {
    mode = await ensureTunaMode();
  } catch {
    return { ok: false, error: "tryLater" };
  }
  const est = await prisma.establishment.findUnique({
    where: { id: establishmentId },
    select: { slug: true, tunaMerchantEnv: true, tunaPixStatus: true, tunaCardStatus: true },
  });
  if (!est) return { ok: false, error: "notFound" };
  // Mesma regra de visibilidade da prontidão, com o MESMO modo da chamada.
  const { visible } = tunaReadiness({ ...est, tunaMerchantEnv: null }, tunaReadinessContext(mode, false));
  if (!visible) return { ok: false, error: "notAvailable" };
  const inProgress = (s: string | null) => s === "analysis" || s === "active";
  if (est.tunaMerchantEnv === mode && (inProgress(est.tunaPixStatus) || inProgress(est.tunaCardStatus))) {
    return { ok: false, error: "alreadyRegistered" };
  }

  // Persiste ANTES de chamar a Tuna: se a resposta se perder (timeout/5xx/queda
  // do banco), o webhook do merchant ainda acha o bar por externalId + ambiente.
  const externalId = `jur_${establishmentId}`;
  await prisma.establishment.update({
    where: { id: establishmentId },
    data: {
      tunaMerchantExternalId: externalId,
      tunaMerchantId: null,
      tunaMerchantEnv: mode,
      tunaPixStatus: "analysis",
      tunaCardStatus: "analysis",
      tunaContractAcceptedAt: new Date(),
    },
  });
  try {
    const r = await registerTunaMerchant(parsed.data, { externalId, condition, mcc });
    if (!r.merchantId) return { ok: false, error: "tryLater" };
    await prisma.establishment.update({
      where: { id: establishmentId },
      data: { tunaMerchantId: r.merchantId },
    });
    return { ok: true };
  } catch (e) {
    // Só o resumo (status/code) + o id do bar: nunca o corpo (documento, conta).
    console.warn("[tuna/register] falha", JSON.stringify({ establishmentId, error: tunaErrorSummary(e) }));
    if (isDefiniteGatewayFailure(e)) {
      // Recusa definitiva: libera nova tentativa.
      await prisma.establishment
        .update({
          where: { id: establishmentId },
          data: { tunaPixStatus: "error", tunaCardStatus: "error" },
        })
        .catch(() => {});
      return { ok: false, error: tunaClientMessage(e) };
    }
    return { ok: false, error: "tryLater" };
  }
}

export async function getEstablishmentTunaStatus(
  establishmentId: string,
): Promise<TunaReadiness & { pixStatus: string | null; cardStatus: string | null }> {
  const [est, mode, cardsEnabled] = await Promise.all([
    prisma.establishment.findUnique({
      where: { id: establishmentId },
      select: { slug: true, tunaMerchantEnv: true, tunaPixStatus: true, tunaCardStatus: true },
    }),
    getTunaMode(),
    getTunaCardsEnabled(),
  ]);
  const fields = est ?? { slug: "", tunaMerchantEnv: null, tunaPixStatus: null, tunaCardStatus: null };
  return {
    ...tunaReadiness(fields, tunaReadinessContext(mode, cardsEnabled)),
    // Status de outro ambiente não vale pro modo atual.
    pixStatus: est?.tunaMerchantEnv === mode ? (est.tunaPixStatus ?? null) : null,
    cardStatus: est?.tunaMerchantEnv === mode ? (est.tunaCardStatus ?? null) : null,
  };
}

/** Coluna do gateway de cada método no Establishment. */
const ROUTE_FIELD = {
  pix: "gatewayPix",
  credit: "gatewayCredit",
  debit: "gatewayDebit",
  applePay: "gatewayApplePay",
  googlePay: "gatewayGooglePay",
} as const satisfies Record<RouteKey, string>;

/** Depois que o admin troca o modo da Tuna ou a chave dos cartões: cada método
 *  roteado pra Tuna num bar que NÃO está pronto com o `mode`/`cardsEnabled`
 *  DADOS (passados explicitamente — nada de cache) volta pro gateway padrão do
 *  método (`ROUTE_FALLBACK`). Mesma regra do painel (`tunaReadiness`); o bar
 *  re-escolhe a Tuna quando ficar pronto de novo. Só troca o que ainda é Tuna.
 *  Devolve quantos bares mudaram; loga só a contagem. */
export async function rerouteUnreadyTunaBars(mode: PaymentEnv, cardsEnabled: boolean): Promise<number> {
  const bars = await prisma.establishment.findMany({
    where: {
      OR: [
        { gatewayPix: "TUNA" },
        { gatewayCredit: "TUNA" },
        { gatewayDebit: "TUNA" },
        { gatewayApplePay: "TUNA" },
        { gatewayGooglePay: "TUNA" },
      ],
    },
    select: {
      id: true,
      slug: true,
      tunaMerchantEnv: true,
      tunaPixStatus: true,
      tunaCardStatus: true,
      gatewayPix: true,
      gatewayCredit: true,
      gatewayDebit: true,
      gatewayApplePay: true,
      gatewayGooglePay: true,
    },
  });
  const ctx = tunaReadinessContext(mode, cardsEnabled);
  const idsByKey = new Map<RouteKey, string[]>();
  const changed = new Set<string>();
  for (const bar of bars) {
    const r = tunaReadiness(bar, ctx);
    for (const key of ROUTE_KEYS) {
      if (bar[ROUTE_FIELD[key]] !== "TUNA") continue;
      if (key === "pix" ? r.pixReady : r.cardReady) continue;
      idsByKey.set(key, [...(idsByKey.get(key) ?? []), bar.id]);
      changed.add(bar.id);
    }
  }
  // Um updateMany por método; o filtro `= TUNA` não sobrescreve uma escolha
  // que o bar tenha salvo entre a leitura e a escrita.
  for (const [key, ids] of idsByKey) {
    const field = ROUTE_FIELD[key];
    await prisma.establishment.updateMany({
      where: { id: { in: ids }, [field]: "TUNA" } as Prisma.EstablishmentWhereInput,
      data: { [field]: ROUTE_FALLBACK[key] as PaymentProvider },
    });
  }
  console.log("[tuna/reroute]", JSON.stringify({ mode, cardsEnabled, bars: changed.size }));
  return changed.size;
}
