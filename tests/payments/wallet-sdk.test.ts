import { describe, it, expect } from "vitest";
import {
  walletAmount,
  googleIsReadyToPayRequest,
  googlePaymentDataRequest,
  applePayRequest,
} from "@/lib/payments/wallet-sdk";
import type { ApplePayWebConfig, GooglePayWebConfig } from "@/lib/payments/wallet-web";

const gp: GooglePayWebConfig = {
  environment: "TEST",
  merchantName: "Jurandir",
  gateway: "pagarme",
  gatewayMerchantId: "acc_pagarme",
  allowedCardNetworks: ["VISA", "MASTERCARD"],
  allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"],
};
const ap: ApplePayWebConfig = {
  merchantIdentifier: "merchant.br.app.jurandir",
  displayName: "Jurandir",
  supportedNetworks: ["visa", "masterCard"],
  merchantCapabilities: ["supports3DS", "supportsCredit"],
  countryCode: "BR",
  currencyCode: "BRL",
};

describe("walletAmount", () => {
  it("sempre 2 casas com ponto", () => {
    expect(walletAmount(12.5)).toBe("12.50");
    expect(walletAmount(7)).toBe("7.00");
    expect(walletAmount(0.1 + 0.2)).toBe("0.30");
    expect(walletAmount(1234.567)).toBe("1234.57");
  });
});

describe("Google Pay requests", () => {
  it("isReadyToPay: api 2.0, CARD, métodos e redes da config", () => {
    expect(googleIsReadyToPayRequest(gp)).toEqual({
      apiVersion: 2,
      apiVersionMinor: 0,
      allowedPaymentMethods: [
        {
          type: "CARD",
          parameters: {
            allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"],
            allowedCardNetworks: ["VISA", "MASTERCARD"],
          },
        },
      ],
    });
  });

  it("paymentData: tokenização PAYMENT_GATEWAY + total FINAL em BRL", () => {
    expect(googlePaymentDataRequest(gp, 12.5)).toEqual({
      apiVersion: 2,
      apiVersionMinor: 0,
      allowedPaymentMethods: [
        {
          type: "CARD",
          parameters: {
            allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"],
            allowedCardNetworks: ["VISA", "MASTERCARD"],
          },
          tokenizationSpecification: {
            type: "PAYMENT_GATEWAY",
            parameters: { gateway: "pagarme", gatewayMerchantId: "acc_pagarme" },
          },
        },
      ],
      merchantInfo: { merchantName: "Jurandir" },
      transactionInfo: {
        totalPriceStatus: "FINAL",
        totalPrice: "12.50",
        currencyCode: "BRL",
        countryCode: "BR",
        checkoutOption: "COMPLETE_IMMEDIATE_PURCHASE",
      },
    });
  });

  it("paymentData: merchantId só quando a config traz (produção)", () => {
    const r = googlePaymentDataRequest(
      { ...gp, environment: "PRODUCTION", merchantId: "BCR2DN123" },
      10,
    );
    expect(r.merchantInfo).toEqual({ merchantName: "Jurandir", merchantId: "BCR2DN123" });
  });
});

describe("applePayRequest", () => {
  it("monta o pedido da sessão v3 com label = displayName", () => {
    expect(applePayRequest(ap, 12.5)).toEqual({
      countryCode: "BR",
      currencyCode: "BRL",
      supportedNetworks: ["visa", "masterCard"],
      merchantCapabilities: ["supports3DS", "supportsCredit"],
      total: { label: "Jurandir", amount: "12.50" },
    });
  });
});
