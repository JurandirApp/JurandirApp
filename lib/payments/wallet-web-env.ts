// Leitura (servidor) do env das carteiras web + modos TEST/PRODUCTION do admin.
import { getAppSettings } from "@/lib/db/settings";
import { ensureTunaMode } from "@/lib/payments/tuna";
import {
  walletWebConfig,
  resolveInitiativeContext,
  type GatewayModes,
  type WalletWebConfig,
  type WalletWebEnv,
} from "@/lib/payments/wallet-web";

/** Mesmo default de quando o banco está indisponível. */
const DEFAULT_MODES: GatewayModes = { PAGARME: "TEST", PAGBANK: "TEST" };

const GATEWAY_MERCHANT_ENV = {
  PAGARME: "GOOGLE_PAY_PAGARME_GATEWAY_MERCHANT_ID",
  PAGBANK: "GOOGLE_PAY_PAGBANK_GATEWAY_MERCHANT_ID",
} as const;

/** `gatewayMerchantId` do Google Pay na Tuna: o mesmo que o tuna.js usa em
 *  produção e sandbox (um token TEST real com ele foi aprovado pela Tuna). */
const TUNA_GATEWAY_MERCHANT_ENV = "TUNA_GOOGLE_GATEWAY_MERCHANT_ID";
const TUNA_GATEWAY_MERCHANT_DEFAULT = "78c30483-2a55-422e-98f1-b68f77fcaa70";

const envValue = (name: string): string | undefined =>
  process.env[name]?.trim() || undefined;

/** Convenção do repo: PRODUÇÃO usa `<NOME>`; TESTE prefere `<NOME>_TEST` e cai
 *  pro `<NOME>` quando o `_TEST` não existe. */
const envByMode = (name: string, mode: "TEST" | "PRODUCTION"): string | undefined =>
  mode === "TEST" ? (envValue(`${name}_TEST`) ?? envValue(name)) : envValue(name);

export function readWalletWebEnv(modes: GatewayModes = DEFAULT_MODES): WalletWebEnv {
  const e = process.env;
  const pagarme = envByMode(GATEWAY_MERCHANT_ENV.PAGARME, modes.PAGARME);
  const pagbank = envByMode(GATEWAY_MERCHANT_ENV.PAGBANK, modes.PAGBANK);
  // Tuna: só com o modo lido (sem ele não há Google Pay da Tuna).
  const tuna = modes.TUNA
    ? (envByMode(TUNA_GATEWAY_MERCHANT_ENV, modes.TUNA) ?? TUNA_GATEWAY_MERCHANT_DEFAULT)
    : undefined;
  const appleDomain = resolveInitiativeContext(e.APPLE_PAY_DOMAIN, e.APP_BASE_URL) ?? "";
  return {
    appleMerchantId: e.APPLE_PAY_MERCHANT_ID?.trim() || "merchant.br.app.jurandir",
    appleDisplayName: e.APPLE_PAY_DISPLAY_NAME?.trim() || "Jurandir",
    appleCertReady:
      !!e.APPLE_PAY_MERCHANT_CERT?.trim() && !!e.APPLE_PAY_MERCHANT_KEY?.trim() && !!appleDomain,
    appleDomain,
    googleMerchantId: e.GOOGLE_PAY_MERCHANT_ID?.trim() ?? "",
    googleGatewayMerchantIds: {
      ...(pagarme ? { PAGARME: pagarme } : {}),
      ...(pagbank ? { PAGBANK: pagbank } : {}),
      ...(tuna ? { TUNA: tuna } : {}),
    },
    googleTestSlugs: (e.GOOGLE_PAY_TEST_SLUGS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  };
}

export async function getWalletWebConfig(est: {
  slug: string;
  applePay: boolean;
  googlePay: boolean;
  gateways: { applePay: string; googlePay: string };
}): Promise<WalletWebConfig> {
  // Os modos do admin só importam pro Google Pay: sem chance de Google (bar não
  // aceita ou nenhum id de gateway no env) não consulta o banco.
  if (est.googlePay && est.gateways.googlePay === "TUNA") {
    // Tuna: o MESMO modo (cacheado) da prontidão e da cobrança. Falha ao ler →
    // sem modo → sem Google Pay da Tuna (falha fechado).
    let tuna: "TEST" | "PRODUCTION" | undefined;
    try {
      tuna = await ensureTunaMode();
    } catch {
      tuna = undefined;
    }
    const modes: GatewayModes = { ...DEFAULT_MODES, ...(tuna ? { TUNA: tuna } : {}) };
    return walletWebConfig(est, readWalletWebEnv(modes), modes);
  }
  const anyGoogleGatewayId = Object.values(GATEWAY_MERCHANT_ENV).some(
    (name) => !!envValue(name) || !!envValue(`${name}_TEST`),
  );
  if (!est.googlePay || !anyGoogleGatewayId) {
    return walletWebConfig(est, readWalletWebEnv(DEFAULT_MODES), DEFAULT_MODES);
  }
  let modes: GatewayModes = DEFAULT_MODES;
  try {
    const s = await getAppSettings();
    modes = { PAGARME: s.pagarmeMode, PAGBANK: s.pagbankMode };
  } catch {
    // banco indisponível → TEST
  }
  return walletWebConfig(est, readWalletWebEnv(modes), modes);
}
