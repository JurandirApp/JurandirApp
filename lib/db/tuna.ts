import { prisma } from "@/lib/db/prisma";
import { getTunaMode, getTunaCardsEnabled } from "@/lib/db/settings";
import { tunaMerchantSchema } from "@/lib/validation";
import { registerTunaMerchant, TunaError, ensureTunaMode } from "@/lib/payments/tuna";
import { tunaReadiness, parseTunaTestSlugs, type TunaReadiness } from "@/lib/payments/tuna-readiness";

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

  const mode = await ensureTunaMode();
  const est = await prisma.establishment.findUnique({
    where: { id: establishmentId },
    select: { tunaMerchantEnv: true, tunaPixStatus: true, tunaCardStatus: true },
  });
  if (!est) return { ok: false, error: "notFound" };
  const inProgress = (s: string | null) => s === "analysis" || s === "active";
  if (est.tunaMerchantEnv === mode && (inProgress(est.tunaPixStatus) || inProgress(est.tunaCardStatus))) {
    return { ok: false, error: "alreadyRegistered" };
  }

  const externalId = `jur_${establishmentId}`;
  try {
    const r = await registerTunaMerchant(parsed.data, { externalId, condition, mcc });
    await prisma.establishment.update({
      where: { id: establishmentId },
      data: {
        tunaMerchantExternalId: externalId,
        tunaMerchantId: r.merchantId,
        tunaMerchantEnv: mode,
        tunaPixStatus: "analysis",
        tunaCardStatus: "analysis",
        tunaContractAcceptedAt: new Date(),
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: tunaClientMessage(e) };
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
  const testSlugs = parseTunaTestSlugs(process.env.TUNA_TEST_SLUGS);
  const fields = est ?? { slug: "", tunaMerchantEnv: null, tunaPixStatus: null, tunaCardStatus: null };
  return {
    ...tunaReadiness(fields, { mode, cardsEnabled, testSlugs }),
    pixStatus: est?.tunaPixStatus ?? null,
    cardStatus: est?.tunaCardStatus ?? null,
  };
}
