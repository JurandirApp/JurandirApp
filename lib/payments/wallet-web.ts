// Config pura das carteiras (Apple Pay / Google Pay) do site. Sem env, sem Prisma.

export type WalletWebEnv = {
  appleMerchantId: string;
  appleDisplayName: string;
  appleCertReady: boolean;
  /** Domínio verificado na Apple (normalizado, minúsculo); "" = não resolvido. */
  appleDomain: string;
  googleMerchantId: string;
  /** Já resolvidos pelo modo (TEST/PRODUCTION) de cada gateway. */
  googleGatewayMerchantIds: { PAGARME?: string; PAGBANK?: string; TUNA?: string };
  /** Slugs (minúsculos) que podem ver o Google Pay em TEST — demais bares só em PRODUCTION. */
  googleTestSlugs: string[];
};

export type GatewayModes = {
  PAGARME: "TEST" | "PRODUCTION";
  PAGBANK: "TEST" | "PRODUCTION";
  /** Modo da Tuna (`ensureTunaMode`). Ausente = não deu pra ler → sem Google Pay
   *  da Tuna (nunca chuta TESTE/PRODUÇÃO). */
  TUNA?: "TEST" | "PRODUCTION";
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
  gateway: "pagarme" | "pagbank" | "tuna";
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
  // Apple Pay no site só nos gateways que decifram o token do NOSSO certificado
  // (Pagar.me/PagBank). Tuna fica de fora até ela liberar o nosso domínio.
  const appleGw = est.gateways.applePay;
  const applePay: ApplePayWebConfig | null =
    est.applePay &&
    (appleGw === "PAGARME" || appleGw === "PAGBANK") &&
    env.appleCertReady &&
    !!env.appleDomain
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
  if (est.googlePay && gw === "TUNA") {
    // Tuna: `est.googlePay` já passou pela prontidão da Tuna (em TESTE só bares
    // de TUNA_TEST_SLUGS), então a allowlist do Google não se aplica aqui.
    // PRODUÇÃO exige o merchantId do Google, como nos outros gateways.
    const mode = modes.TUNA;
    const gatewayMerchantId = env.googleGatewayMerchantIds.TUNA;
    const production = mode === "PRODUCTION";
    if (mode && gatewayMerchantId && (!production || env.googleMerchantId)) {
      googlePay = {
        environment: production ? "PRODUCTION" : "TEST",
        ...(production ? { merchantId: env.googleMerchantId } : {}),
        merchantName: "Jurandir",
        gateway: "tuna",
        gatewayMerchantId,
        allowedCardNetworks: ["VISA", "MASTERCARD"],
        allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"],
      };
    }
  } else if (est.googlePay && (gw === "PAGARME" || gw === "PAGBANK")) {
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
