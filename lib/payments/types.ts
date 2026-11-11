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
  customerDocument?: string; // CPF real do pagador
  customerPhone?: string; // telefone real do pagador (DDD+número ou com DDI)
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
  /** Id a gravar JÁ como `gatewayChargeId` (gateway que reconcilia pelo próprio
   *  link, ex.: InfinitePay). Ausente = reconcilia pela referência (MP). */
  chargeId?: string;
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
  /** Desafio 3DS pendente (Tuna): o app faz POST de um form para `url` com o
   *  campo `JWT` = `token` numa WebView e depois consulta o status. */
  challenge?: { url: string; token: string; paRequest?: string };
};

/** Cartão via TOKEN da tokenização (Pagar.me v5 correto): o app tokeniza com a
 *  chave pública (`/tokens?appId=pk_`) e manda só o `card_token` (nunca o cartão
 *  cru). O backend cria o pedido com `credit_card.card_token`. */
export type CardTokenPaymentInput = {
  est: Establishment;
  reference: string;
  total: number;
  platformFee: number;
  description: string;
  cardToken: string;
  installments: number;
  method: "credit" | "debit";
  customerName?: string;
  customerDocument?: string;
  customerPhone?: string;
  /** Endereço de cobrança do portador — EXIGIDO pelo antifraude do Pagar.me em
   *  cartão. O app resolve o CEP (ViaCEP) e manda os campos prontos. */
  billing?: CardBillingAddress;
  /** Id da autenticação 3DS (`3DS_…`) do SDK JS do PagBank — obrigatório no débito PagBank. */
  authenticationId?: string;
  /** Tuna: sessão de tokenização (NewSession), bandeira devolvida pelo
   *  Token/Generate e, com 3DS, os ids do device data collection. Débito sem
   *  `threeDs` vai como débito simples ("2"); com, débito 3DS ("8"). */
  tuna?: {
    sessionId: string;
    brand?: string;
    threeDs?: { referenceId: string; transactionId: string };
  };
};

/** billing_address do cartão (formato Pagar.me v5). */
export type CardBillingAddress = {
  line_1: string;
  zip_code: string;
  city: string;
  state: string;
  country?: string;
};

/** Pagamento aprovado localizado por referência externa (Checkout Pro não devolve o id na criação). */
export type FoundPayment = { paymentId: string; status: ChargeStatus };

/** Cobrança de carteira nativa (Google Pay / Apple Pay) — token vindo do app. */
export type WalletPaymentInput = {
  est: Establishment;
  reference: string; // order.code
  total: number;
  platformFee: number;
  description: string;
  walletType: "google_pay" | "apple_pay";
  /** Token bruto da carteira (JSON), como o `pay` plugin devolve em tokenizationData.token. */
  token: string;
};

export interface PaymentProvider {
  readonly name: "ASAAS" | "MERCADO_PAGO" | "PAGARME" | "APPMAX" | "PAGBANK" | "INFINITEPAY" | "TUNA";
  createPixCharge(input: PixChargeInput): Promise<PixCharge>;
  getChargeStatus(est: Establishment, chargeId: string, opts?: { debit?: boolean }): Promise<ChargeStatus>;
  /** Cria a preferência do checkout hospedado e devolve a URL de redirecionamento. */
  createCheckoutPreference?(input: CheckoutPreferenceInput): Promise<CheckoutPreference>;
  /** Cobra um cartão via token (checkout transparente / Payment Brick) — sem redirect. */
  createCardPayment?(input: CardPaymentInput): Promise<CardPaymentResult>;
  /** Cobra cartão via `card_token` da tokenização (Pagar.me v5 correto). */
  createCardTokenPayment?(input: CardTokenPaymentInput): Promise<CardPaymentResult>;
  /** Cobra via carteira nativa (Google Pay / Apple Pay) usando o token do app. */
  createWalletPayment?(input: WalletPaymentInput): Promise<CardPaymentResult>;
  /** Busca um pagamento aprovado pela referência externa (order.code). */
  findApprovedPayment?(est: Establishment, reference: string): Promise<FoundPayment | null>;
}
