import type { PaymentProvider } from "./types";
import { mercadoPagoProvider } from "./mercadopago";

/** Gateway de pagamento FIXO: Mercado Pago para todos os estabelecimentos.
 *  O modo marketplace (dinheiro na conta do vendedor + split) vs conta-única
 *  (conta da plataforma via MP_ACCESS_TOKEN) é resolvido dentro do provider,
 *  conforme o estabelecimento tenha ou não `mpAccessToken` (OAuth). */
export function getProvider(): PaymentProvider {
  return mercadoPagoProvider;
}

export type { PaymentProvider, PixCharge, ChargeStatus, PixChargeInput } from "./types";
