// Carteiras no site (cliente): loader do Google Pay (pay.js, injetado uma única
// vez — mesmo padrão do mp-sdk.ts), tipos mínimos de google.payments.api e do
// ApplePaySession (nativo do Safari, sem SDK) e os montadores puros dos pedidos.
// Só importa TIPOS de wallet-web.ts (aquele módulo usa Buffer do Node).

import type { ApplePayWebConfig, GooglePayWebConfig } from "./wallet-web";

export type WalletType = "apple_pay" | "google_pay";

// ---------------------------------------------------------------- Google Pay

type GoogleCardMethod = {
  type: "CARD";
  parameters: { allowedAuthMethods: string[]; allowedCardNetworks: string[] };
};

export type GoogleIsReadyToPayRequest = {
  apiVersion: 2;
  apiVersionMinor: 0;
  allowedPaymentMethods: GoogleCardMethod[];
};

export type GooglePaymentDataRequest = {
  apiVersion: 2;
  apiVersionMinor: 0;
  allowedPaymentMethods: (GoogleCardMethod & {
    tokenizationSpecification: {
      type: "PAYMENT_GATEWAY";
      parameters: { gateway: string; gatewayMerchantId: string };
    };
  })[];
  merchantInfo: { merchantName: string; merchantId?: string };
  transactionInfo: {
    totalPriceStatus: "FINAL";
    totalPrice: string;
    currencyCode: "BRL";
    countryCode: "BR";
    checkoutOption: "COMPLETE_IMMEDIATE_PURCHASE";
  };
};

export type GooglePaymentData = {
  paymentMethodData?: { tokenizationData?: { type?: string; token?: string } };
};

export type GooglePaymentsClient = {
  isReadyToPay: (req: GoogleIsReadyToPayRequest) => Promise<{ result: boolean }>;
  loadPaymentData: (req: GooglePaymentDataRequest) => Promise<GooglePaymentData>;
  createButton: (opts: {
    onClick: () => void;
    buttonType?: string;
    buttonColor?: string;
    buttonSizeMode?: string;
    buttonLocale?: string;
  }) => HTMLElement;
};

type GooglePaymentsClientCtor = new (opts: {
  environment: "TEST" | "PRODUCTION";
}) => GooglePaymentsClient;

// ----------------------------------------------------------------- Apple Pay

export type ApplePayPaymentRequest = {
  countryCode: string;
  currencyCode: string;
  supportedNetworks: string[];
  merchantCapabilities: string[];
  total: { label: string; amount: string };
};

export interface ApplePaySessionInstance {
  begin(): void;
  abort(): void;
  completeMerchantValidation(merchantSession: unknown): void;
  completePayment(result: { status: number }): void;
  onvalidatemerchant: ((event: { validationURL: string }) => void) | null;
  onpaymentauthorized: ((event: { payment: { token: unknown } }) => void) | null;
  oncancel: ((event: unknown) => void) | null;
}

export interface ApplePaySessionCtor {
  new (version: number, request: ApplePayPaymentRequest): ApplePaySessionInstance;
  canMakePayments(): boolean;
  supportsVersion?(version: number): boolean;
  readonly STATUS_SUCCESS: number;
  readonly STATUS_FAILURE: number;
}

declare global {
  interface Window {
    google?: { payments?: { api?: { PaymentsClient?: GooglePaymentsClientCtor } } };
    ApplePaySession?: ApplePaySessionCtor;
  }
}

// ----------------------------------------------------------- montadores puros

/** Total com exatamente 2 casas e ponto ("12.50") — formato das duas carteiras. */
export function walletAmount(total: number): string {
  return (Math.round(total * 100) / 100).toFixed(2);
}

function googleCardMethod(cfg: GooglePayWebConfig): GoogleCardMethod {
  return {
    type: "CARD",
    parameters: {
      allowedAuthMethods: cfg.allowedAuthMethods,
      allowedCardNetworks: cfg.allowedCardNetworks,
    },
  };
}

export function googleIsReadyToPayRequest(cfg: GooglePayWebConfig): GoogleIsReadyToPayRequest {
  return { apiVersion: 2, apiVersionMinor: 0, allowedPaymentMethods: [googleCardMethod(cfg)] };
}

export function googlePaymentDataRequest(
  cfg: GooglePayWebConfig,
  total: number,
): GooglePaymentDataRequest {
  return {
    apiVersion: 2,
    apiVersionMinor: 0,
    allowedPaymentMethods: [
      {
        ...googleCardMethod(cfg),
        tokenizationSpecification: {
          type: "PAYMENT_GATEWAY",
          parameters: { gateway: cfg.gateway, gatewayMerchantId: cfg.gatewayMerchantId },
        },
      },
    ],
    merchantInfo: {
      merchantName: cfg.merchantName,
      ...(cfg.merchantId ? { merchantId: cfg.merchantId } : {}),
    },
    transactionInfo: {
      totalPriceStatus: "FINAL",
      totalPrice: walletAmount(total),
      currencyCode: "BRL",
      countryCode: "BR",
      checkoutOption: "COMPLETE_IMMEDIATE_PURCHASE",
    },
  };
}

export function applePayRequest(cfg: ApplePayWebConfig, total: number): ApplePayPaymentRequest {
  return {
    countryCode: cfg.countryCode,
    currencyCode: cfg.currencyCode,
    supportedNetworks: cfg.supportedNetworks,
    merchantCapabilities: cfg.merchantCapabilities,
    total: { label: cfg.displayName, amount: walletAmount(total) },
  };
}

// ------------------------------------------------------------------- loaders

let payJsPromise: Promise<GooglePaymentsClientCtor> | null = null;

/** Carrega o pay.js do Google e resolve com `google.payments.api.PaymentsClient`. Idempotente. */
export function loadGooglePay(): Promise<GooglePaymentsClientCtor> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  const ready = window.google?.payments?.api?.PaymentsClient;
  if (ready) return Promise.resolve(ready);
  if (payJsPromise) return payJsPromise;
  payJsPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://pay.google.com/gp/p/js/pay.js";
    s.async = true;
    s.onload = () => {
      const Ctor = window.google?.payments?.api?.PaymentsClient;
      if (Ctor) {
        resolve(Ctor);
        return;
      }
      payJsPromise = null; // permite nova tentativa numa próxima montagem
      s.remove();
      reject(new Error("Google Pay indisponível após load"));
    };
    s.onerror = () => {
      payJsPromise = null; // permite nova tentativa numa próxima montagem
      s.remove();
      reject(new Error("falha ao carregar o Google Pay"));
    };
    document.head.appendChild(s);
  });
  return payJsPromise;
}

const googleReady = new Map<string, Promise<GooglePaymentsClient | null>>();

/** pay.js + isReadyToPay, memorizado por config: resolve com o client se o
 *  aparelho/navegador pode pagar, senão null. Nunca rejeita. */
export function prepareGooglePay(cfg: GooglePayWebConfig): Promise<GooglePaymentsClient | null> {
  const key = JSON.stringify(cfg);
  const cached = googleReady.get(key);
  if (cached) return cached;
  const p = loadGooglePay()
    .then(async (Ctor) => {
      const client = new Ctor({ environment: cfg.environment });
      const r = await client.isReadyToPay(googleIsReadyToPayRequest(cfg));
      return r?.result ? client : null;
    })
    .catch(() => {
      googleReady.delete(key); // falha de rede → tenta de novo na próxima montagem
      return null;
    });
  googleReady.set(key, p);
  return p;
}

/** Apple Pay disponível neste navegador (Safari + aparelho com Apple Pay) E a
 *  página está no domínio verificado na Apple (fora dele a validação falha). */
export function canUseApplePay(cfg: Pick<ApplePayWebConfig, "domain">): boolean {
  if (typeof window === "undefined") return false;
  if (window.location?.hostname?.toLowerCase() !== cfg.domain) return false;
  const APS = window.ApplePaySession;
  if (!APS) return false;
  try {
    if (APS.supportsVersion && !APS.supportsVersion(3)) return false;
    return APS.canMakePayments();
  } catch {
    return false; // ex.: contexto inseguro
  }
}
