import type {
  Establishment,
  PaymentMethod,
  PaymentProvider as GatewayName,
} from "@prisma/client";
import type { PaymentProvider } from "./types";
import { mercadoPagoProvider } from "./mercadopago";
import { pagarmeProvider } from "./pagarme";
import { asaasProvider } from "./asaas";

/** Nome do gateway configurado pro método (Pix/Crédito/Débito) do estabelecimento. */
export function resolveGateway(est: Establishment, method: PaymentMethod): GatewayName {
  if (method === "CREDIT") return est.gatewayCredit;
  if (method === "DEBIT") return est.gatewayDebit;
  return est.gatewayPix; // PIX (e fallback pra USDC)
}

/** Implementação (provider) a partir do nome do enum. */
export function getProviderByName(name: GatewayName): PaymentProvider {
  switch (name) {
    case "PAGARME":
      return pagarmeProvider;
    case "ASAAS":
      return asaasProvider;
    default:
      return mercadoPagoProvider; // MERCADO_PAGO
  }
}

/** Provider configurado pro estabelecimento + método escolhido no app. */
export function getProvider(est: Establishment, method: PaymentMethod): PaymentProvider {
  return getProviderByName(resolveGateway(est, method));
}

export type { PaymentProvider, PixCharge, ChargeStatus, PixChargeInput } from "./types";
