// Leitura (servidor) do env das carteiras web + modos TEST/PRODUCTION do admin.
import { getAppSettings } from "@/lib/db/settings";
import {
  walletWebConfig,
  resolveInitiativeContext,
  type GatewayModes,
  type WalletWebConfig,
  type WalletWebEnv,
} from "@/lib/payments/wallet-web";

export function readWalletWebEnv(): WalletWebEnv {
  const e = process.env;
  const pagarme = e.GOOGLE_PAY_PAGARME_GATEWAY_MERCHANT_ID?.trim();
  const pagbank = e.GOOGLE_PAY_PAGBANK_GATEWAY_MERCHANT_ID?.trim();
  return {
    appleMerchantId: e.APPLE_PAY_MERCHANT_ID?.trim() || "merchant.br.app.jurandir",
    appleDisplayName: e.APPLE_PAY_DISPLAY_NAME?.trim() || "Jurandir",
    appleCertReady:
      !!e.APPLE_PAY_MERCHANT_CERT?.trim() &&
      !!e.APPLE_PAY_MERCHANT_KEY?.trim() &&
      !!resolveInitiativeContext(e.APPLE_PAY_DOMAIN, e.APP_BASE_URL),
    googleMerchantId: e.GOOGLE_PAY_MERCHANT_ID?.trim() ?? "",
    googleGatewayMerchantIds: {
      ...(pagarme ? { PAGARME: pagarme } : {}),
      ...(pagbank ? { PAGBANK: pagbank } : {}),
    },
  };
}

export async function getWalletWebConfig(est: {
  applePay: boolean;
  googlePay: boolean;
  gateways: { applePay: string; googlePay: string };
}): Promise<WalletWebConfig> {
  let modes: GatewayModes = { PAGARME: "TEST", PAGBANK: "TEST" };
  try {
    const s = await getAppSettings();
    modes = { PAGARME: s.pagarmeMode, PAGBANK: s.pagbankMode };
  } catch {
    // banco indisponível → TEST
  }
  return walletWebConfig(est, readWalletWebEnv(), modes);
}
