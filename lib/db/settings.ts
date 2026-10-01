import { prisma } from "@/lib/db/prisma";
import type { PaymentEnv } from "@prisma/client";

// Config global da plataforma — linha única (`AppSetting`, id fixo). Os tokens/
// chaves dos gateways continuam no .env/Vercel; aqui só guardamos QUAL ambiente
// cada gateway usa (TEST/PRODUCTION), que o admin troca sem deploy.
const SINGLETON = "singleton";

/** Lê a config global, criando a linha com os defaults na primeira vez. */
export async function getAppSettings() {
  return prisma.appSetting.upsert({
    where: { id: SINGLETON },
    update: {},
    create: { id: SINGLETON },
  });
}

/** Modo do PagBank em vigor pra toda a plataforma (default TEST). */
export async function getPagbankMode(): Promise<PaymentEnv> {
  const s = await getAppSettings();
  return s.pagbankMode;
}

/** Modo do Pagar.me em vigor pra toda a plataforma (default PRODUCTION). */
export async function getPagarmeMode(): Promise<PaymentEnv> {
  const s = await getAppSettings();
  return s.pagarmeMode;
}

/** Troca o ambiente do PagBank (só o admin chama, via server action). */
export async function setPagbankMode(mode: PaymentEnv): Promise<void> {
  await prisma.appSetting.upsert({
    where: { id: SINGLETON },
    update: { pagbankMode: mode },
    create: { id: SINGLETON, pagbankMode: mode },
  });
}

/** Troca o ambiente do Pagar.me (só o admin chama, via server action). */
export async function setPagarmeMode(mode: PaymentEnv): Promise<void> {
  await prisma.appSetting.upsert({
    where: { id: SINGLETON },
    update: { pagarmeMode: mode },
    create: { id: SINGLETON, pagarmeMode: mode },
  });
}
