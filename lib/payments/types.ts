import type { Establishment } from "@prisma/client";

export type ChargeStatus = "pending" | "paid" | "failed";

export type PixCharge = {
  chargeId: string;
  pixPayload: string; // copia-e-cola
  pixQrImage: string; // base64 PNG (sem prefixo data:)
  status: ChargeStatus;
};

export type PixChargeInput = {
  est: Establishment;
  reference: string; // order.code — referência externa/idempotência no gateway
  total: number;
  platformFee: number;
  customerName?: string;
  description: string;
};

/** Checkout hospedado (cartão/carteira/Google Pay) — hoje só o Mercado Pago (Checkout Pro). */
export type CheckoutPreferenceInput = {
  est: Establishment;
  reference: string; // order.code — external_reference + idempotência
  total: number;
  platformFee: number;
  items: { title: string; quantity: number; unitPrice: number }[];
  description: string;
  /** Restringe o checkout ao tipo escolhido no app: DEBIT → só débito, CREDIT →
   *  só crédito (e à vista, 1x). Ausente = qualquer meio (menos boleto). */
  method?: "CREDIT" | "DEBIT";
};

export type CheckoutPreference = {
  preferenceId: string;
  checkoutUrl: string; // init_point (ou sandbox_init_point em teste)
};

/** Pagamento aprovado localizado por referência externa (Checkout Pro não devolve o id na criação). */
export type FoundPayment = { paymentId: string; status: ChargeStatus };

export interface PaymentProvider {
  readonly name: "ASAAS" | "MERCADO_PAGO";
  createPixCharge(input: PixChargeInput): Promise<PixCharge>;
  getChargeStatus(est: Establishment, chargeId: string): Promise<ChargeStatus>;
  /** Cria a preferência do checkout hospedado e devolve a URL de redirecionamento. */
  createCheckoutPreference?(input: CheckoutPreferenceInput): Promise<CheckoutPreference>;
  /** Busca um pagamento aprovado pela referência externa (order.code). */
  findApprovedPayment?(est: Establishment, reference: string): Promise<FoundPayment | null>;
}
