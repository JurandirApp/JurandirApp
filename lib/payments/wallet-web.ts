// Config pura das carteiras (Apple Pay / Google Pay) do site. Sem env, sem Prisma.

export type WalletWebEnv = {
  appleMerchantId: string;
  appleDisplayName: string;
  appleCertReady: boolean;
  /** Domínio verificado na Apple (normalizado, minúsculo); "" = não resolvido. */
  appleDomain: string;
  googleMerchantId: string;
  /** Já resolvidos pelo modo (TEST/PRODUCTION) de cada gateway. */
  googleGatewayMerchantIds: { PAGARME?: string; PAGBANK?: string };
  /** Slugs (minúsculos) que podem ver o Google Pay em TEST — demais bares só em PRODUCTION. */
  googleTestSlugs: string[];
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
  /** Domínio verificado: o botão só aparece quando a página está nele. */
  domain: string;
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
    slug: string;
    applePay: boolean;
    googlePay: boolean;
    gateways: { applePay: string; googlePay: string };
  },
  env: WalletWebEnv,
  modes: GatewayModes,
): WalletWebConfig {
  const applePay: ApplePayWebConfig | null =
    est.applePay && env.appleCertReady && !!env.appleDomain
      ? {
          merchantIdentifier: env.appleMerchantId,
          displayName: env.appleDisplayName,
          supportedNetworks: ["visa", "masterCard"],
          merchantCapabilities: ["supports3DS", "supportsCredit"],
          countryCode: "BR",
          currencyCode: "BRL",
          domain: env.appleDomain,
        }
      : null;

  let googlePay: GooglePayWebConfig | null = null;
  const gw = est.gateways.googlePay;
  if (est.googlePay && (gw === "PAGARME" || gw === "PAGBANK")) {
    const gatewayMerchantId = env.googleGatewayMerchantIds[gw];
    const production = modes[gw] === "PRODUCTION" && !!env.googleMerchantId;
    // Em TEST o Google devolve token de teste (cobrança falha num gateway real):
    // cliente real só vê o botão em PRODUCTION; TEST só pros slugs da allowlist.
    // Gateway em PRODUCTION vence a allowlist (token de teste não serve ali).
    const slug = est.slug.trim().toLowerCase();
    const testAllowed = env.googleTestSlugs.some((s) => s.trim().toLowerCase() === slug);
    if (gatewayMerchantId && (production || testAllowed)) {
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

/** Domínio do Apple Pay: APPLE_PAY_DOMAIN, senão o host de APP_BASE_URL. Sempre
 *  só o host em minúsculas (sem esquema, caminho ou porta) — é o initiativeContext
 *  da Apple e o host que a página precisa ter pro botão aparecer. */
export function resolveInitiativeContext(
  domain: string | undefined,
  appBaseUrl: string | undefined,
): string | null {
  const d = domain?.trim();
  if (d) {
    // Aceita "jurandir.app.br" ou uma URL inteira; domínio inválido não cai no fallback.
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(d) ? d : `https://${d}`;
    try {
      return new URL(withScheme).hostname.toLowerCase() || null;
    } catch {
      return null;
    }
  }
  const base = appBaseUrl?.trim();
  if (!base) return null;
  try {
    return new URL(base).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Decisão pura da cobrança por carteira: pedido já quitado/pendente NUNCA é cobrado de novo. */
export function walletChargeDecision(
  r: { kind: "charge" } | { kind: "settled"; status: "paid" | "pending" } | { kind: "notfound" },
): "charge" | "settled" | "notfound" {
  if (r.kind === "charge") return "charge";
  if (r.kind === "settled") return "settled";
  return "notfound";
}
