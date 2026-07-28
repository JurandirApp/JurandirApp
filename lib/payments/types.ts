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

/** Dados que o Payment Brick (onSubmit.formData) devolve pra cobrar o cartão. */
export type CardBrickData = {
  token?: string;
  payment_method_id: string;
  issuer_id?: string;
  installments?: number;
  payment_type_id?: string;
  payer?: { email?: string; identification?: { type?: string; number?: string } };
};

/** Cobrança de cartão via token (checkout transparente / Payment Brick). */
export type CardPaymentInput = {
  est: Establishment;
  reference: string; // order.code — external_reference
  total: number;
  platformFee: number;
  description: string;
  brick: CardBrickData;
};

export type CardPaymentResult = {
  chargeId: string;
  status: ChargeStatus;
  statusDetail?: string; // status_detail do MP (ex.: cc_rejected_insufficient_amount)
};

/** Pagamento aprovado localizado por referência externa (Checkout Pro não devolve o id na criação). */
export type FoundPayment = { paymentId: string; status: ChargeStatus };

export interface PaymentProvider {
  readonly name: "ASAAS" | "MERCADO_PAGO";
  createPixCharge(input: PixChargeInput): Promise<PixCharge>;
  getChargeStatus(est: Establishment, chargeId: string): Promise<ChargeStatus>;
  /** Cria a preferência do checkout hospedado e devolve a URL de redirecionamento. */
  createCheckoutPreference?(input: CheckoutPreferenceInput): Promise<CheckoutPreference>;
  /** Cobra um cartão via token (checkout transparente / Payment Brick) — sem redirect. */
  createCardPayment?(input: CardPaymentInput): Promise<CardPaymentResult>;
  /** Busca um pagamento aprovado pela referência externa (order.code). */
  findApprovedPayment?(est: Establishment, reference: string): Promise<FoundPayment | null>;
}
