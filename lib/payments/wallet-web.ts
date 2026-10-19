// Config pura das carteiras (Apple Pay / Google Pay) do site. Sem env, sem Prisma.

export type WalletWebEnv = {
  appleMerchantId: string;
  appleDisplayName: string;
  appleCertReady: boolean;
  googleMerchantId: string;
  googleGatewayMerchantIds: { PAGARME?: string; PAGBANK?: string };
};

export type GatewayModes = {
  PAGARME: "TEST" | "PRODUCTION";
  PAGBANK: "TEST" | "PRODUCTION";
};

export type ApplePayWebConfig = {
  merchantIdentifier: string;
  displayName: string;
  supportedNetworks: string[];
  merchantCapabilities: string[];
  countryCode: "BR";
  currencyCode: "BRL";
};

export type GooglePayWebConfig = {
  environment: "TEST" | "PRODUCTION";
  merchantId?: string;
  merchantName: string;
  gateway: "pagarme" | "pagbank";
  gatewayMerchantId: string;
  allowedCardNetworks: string[];
  allowedAuthMethods: string[];
};

export type WalletWebConfig = {
  applePay: ApplePayWebConfig | null;
  googlePay: GooglePayWebConfig | null;
};

export function walletWebConfig(
  est: {
    applePay: boolean;
    googlePay: boolean;
    gateways: { applePay: string; googlePay: string };
  },
  env: WalletWebEnv,
  modes: GatewayModes,
): WalletWebConfig {
  const applePay: ApplePayWebConfig | null =
    est.applePay && env.appleCertReady
      ? {
          merchantIdentifier: env.appleMerchantId,
          displayName: env.appleDisplayName,
          supportedNetworks: ["visa", "masterCard"],
          merchantCapabilities: ["supports3DS", "supportsCredit"],
          countryCode: "BR",
          currencyCode: "BRL",
        }
      : null;

  let googlePay: GooglePayWebConfig | null = null;
  const gw = est.gateways.googlePay;
  if (est.googlePay && (gw === "PAGARME" || gw === "PAGBANK")) {
    const gatewayMerchantId = env.googleGatewayMerchantIds[gw];
    if (gatewayMerchantId) {
      const production = modes[gw] === "PRODUCTION" && !!env.googleMerchantId;
      googlePay = {
        environment: production ? "PRODUCTION" : "TEST",
        ...(production ? { merchantId: env.googleMerchantId } : {}),
        merchantName: "Jurandir",
        gateway: gw === "PAGARME" ? "pagarme" : "pagbank",
        gatewayMerchantId,
        allowedCardNetworks:
          gw === "PAGARME" ? ["VISA", "MASTERCARD"] : ["VISA", "MASTERCARD", "ELO"],
        allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"],
      };
    }
  }

  return { applePay, googlePay };
}

/** Anti-SSRF: só aceita as URLs de validação de merchant da Apple. */
export function isAppleValidationUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  if (u.port !== "" || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (!host.endsWith(".apple.com")) return false;
  const first = host.split(".")[0];
  return (
    first.startsWith("apple-pay-gateway") ||
    first.startsWith("cn-apple-pay-gateway")
  );
}

/** PEM vindo do env: base64 do PEM (preferido), PEM cru ou PEM de uma linha com \n literais. */
export function decodePem(value: string): string {
  const v = value.trim();
  const decoded = Buffer.from(v, "base64").toString("utf8");
  if (decoded.includes("-----BEGIN")) return decoded;
  return v.replace(/\\n/g, "\n");
}

/** Domínio do Apple Pay: APPLE_PAY_DOMAIN, senão o host de APP_BASE_URL. */
export function resolveInitiativeContext(
  domain: string | undefined,
  appBaseUrl: string | undefined,
): string | null {
  const d = domain?.trim();
  if (d) return d;
  const base = appBaseUrl?.trim();
  if (!base) return null;
  try {
    return new URL(base).hostname || null;
  } catch {
    return null;
  }
}
