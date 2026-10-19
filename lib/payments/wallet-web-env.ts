// Leitura (servidor) do env das carteiras web + modos TEST/PRODUCTION do admin.
import { getAppSettings } from "@/lib/db/settings";
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
