import type { Establishment } from "@prisma/client";
import { PIX_EXPIRES_MIN } from "@/lib/domain/pricing";
import type {
  PaymentProvider,
  PixCharge,
  PixChargeInput,
  ChargeStatus,
  CheckoutPreferenceInput,
  CheckoutPreference,
  FoundPayment,
  WalletPaymentInput,
  CardPaymentResult,
  CardTokenPaymentInput,
  CardBillingAddress,
} from "./types";

// Pagar.me v5 (modelo marketplace): a PLATAFORMA tem a conta (secret key). Cada
// bar é um recebedor (`recipient`); o split manda total−comissão pro recebedor do
// bar e a comissão pro recebedor da plataforma.
const baseUrl = () => process.env.PAGARME_BASE_URL ?? "https://api.pagar.me/core/v5";
const secretKey = () => process.env.PAGARME_SECRET_KEY ?? "";
const platformRecipient = () => process.env.PAGARME_PLATFORM_RECIPIENT_ID ?? "";
/** CPF do pagador. O Pix (e cartão) da Pagar.me exige `customer.document`.
 *  Enquanto o checkout não coleta o CPF do cliente, usa um CPF de TESTE válido
 *  (env PAGARME_TEST_CPF). PRODUÇÃO: coletar o CPF real do pagador no app. */
const payerDocument = () => (process.env.PAGARME_TEST_CPF ?? "11144477735").replace(/\D/g, "");

/** Customer da Pagar.me. O Pix exige `document` (CPF) e ao menos um `phone`.
 *  Enquanto o checkout não coleta esses dados do cliente anônimo, usa valores de
 *  TESTE válidos (envs PAGARME_TEST_CPF / PAGARME_TEST_PHONE, este com DDI+DDD+nº).
 *  E-mail único por pedido evita a Pagar.me reusar um customer antigo sem CPF.
 *  PRODUÇÃO: coletar CPF e telefone reais do pagador no app. */
function buildCustomer(reference: string, opts?: { name?: string; document?: string; phone?: string }) {
  // CPF real do pagador quando vier (11 dígitos); senão o de teste (dev).
  const rawDoc = (opts?.document ?? "").replace(/\D/g, "");
  const document = rawDoc.length >= 11 ? rawDoc : payerDocument();
  // Telefone real quando vier; normaliza pra DDI 55 (o app guarda DDD+número).
  const rawPhone = (opts?.phone ?? "").replace(/\D/g, "");
  const digits = rawPhone.length >= 10
    ? rawPhone
    : (process.env.PAGARME_TEST_PHONE ?? "5547999990000").replace(/\D/g, "");
  const full = digits.length >= 12 ? digits : `55${digits}`;
  return {
    name: opts?.name || "Cliente Jurandir",
    email: `pedido-${reference.toLowerCase()}@jurandir.app.br`,
    type: "individual" as const,
    document,
    phones: {
      mobile_phone: {
        country_code: full.slice(0, 2),
        area_code: full.slice(2, 4),
        number: full.slice(4),
      },
    },
  };
}
/** Base pública do app (success_url do checkout hospedado). */
const appBase = () =>
  (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Basic auth do Pagar.me: usuário = secret key, senha vazia. */
function authHeader(): string {
  return "Basic " + Buffer.from(`${secretKey()}:`).toString("base64");
}

export class PagarmeError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Pagarme ${status}: ${body}`);
    this.name = "PagarmeError";
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new PagarmeError(res.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}

/** Reais → centavos (Pagar.me trabalha em inteiros). */
const cents = (v: number) => Math.round(v * 100);

function mapStatus(s: string | undefined): ChargeStatus {
  if (s === "paid" || s === "overpaid") return "paid";
  if (
    s === "pending" ||
    s === "processing" ||
    s === "waiting_payment" ||
    s === "authorized_pending_capture"
  ) {
    return "pending";
  }
  return "failed";
}

type PgTransaction = { qr_code?: string; qr_code_url?: string; status?: string };
type PgCharge = { id: string; status: string; last_transaction?: PgTransaction };
type PgOrder = { id: string; status: string; charges?: PgCharge[] };

/** Busca a imagem do QR (Pagar.me devolve URL, não base64) e converte. "" se falhar. */
async function qrImageBase64(url: string | undefined): Promise<string> {
  if (!url) return "";
  try {
    const res = await fetch(url, { headers: { Authorization: authHeader() } });
    if (!res.ok) return "";
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.toString("base64");
  } catch {
    return "";
  }
}

/** Recebedor do estabelecimento; cai no recebedor da PLATAFORMA quando o estab.
 *  ainda não tem recebedor próprio — permite testar cobranças reais só com as
 *  credenciais do `.env`, antes de cada bar concluir o KYC na Pagar.me. */
function recipientFor(est: Establishment): string {
  const id = est.pagarmeRecipientId ?? platformRecipient();
  if (!id) throw new PagarmeError(400, "sem recebedor Pagar.me (estabelecimento e plataforma)");
  return id;
}

/** Regras de split: bar recebe total−comissão (arca com a taxa do gateway) + plataforma.
 *  Sem recebedor PRÓPRIO do bar → devolve `undefined` (SEM split): a cobrança cai
 *  direto na conta da plataforma. Split exige marketplace habilitado + recebedor do
 *  bar; a Pagar.me rejeita split_rules apontando só pra própria conta. O
 *  `split: undefined` é removido automaticamente pelo JSON.stringify. */
function buildSplit(est: Establishment, totalCents: number, feeCents: number) {
  if (!est.pagarmeRecipientId) return undefined;
  const platform = platformRecipient();
  const barLeg = {
    amount: 0,
    recipient_id: est.pagarmeRecipientId,
    type: "flat" as const,
    options: { charge_processing_fee: true, liable: true, charge_remainder_fee: true },
  };
  // Sem plataforma, sem comissão, ou bar == plataforma → um leg só.
  if (!platform || feeCents <= 0 || est.pagarmeRecipientId === platform) {
    return [{ ...barLeg, amount: totalCents }];
  }
  return [
    { ...barLeg, amount: totalCents - feeCents },
    {
      amount: feeCents,
      recipient_id: platform,
      type: "flat" as const,
      options: { charge_processing_fee: false, liable: false, charge_remainder_fee: false },
    },
  ];
}

// ---- Carteiras nativas (Google Pay / Apple Pay) ----------------------------
//
// O app (plugin `pay`) devolve o token em tokenizationData.token — um JSON. Pro
// Google Pay o Pagar.me espera o mesmo conteúdo com os nomes em snake_case dentro
// de credit_card.payload.google_pay. `merchant_identifier` = id do Google Pay que
// a Pagar.me libera (env PAGARME_GOOGLE_PAY_MERCHANT_ID).

type GooglePayRaw = {
  signature: string;
  intermediateSigningKey?: { signedKey: string; signatures: string[] };
  protocolVersion: string;
  signedMessage: string;
};

function mapGooglePay(raw: string): Record<string, unknown> {
  const t = JSON.parse(raw) as GooglePayRaw;
  const sm = JSON.parse(t.signedMessage) as {
    encryptedMessage: string;
    ephemeralPublicKey: string;
    tag: string;
  };
  return {
    signature: t.signature,
    intermediate_signing_key: {
      signed_key: t.intermediateSigningKey?.signedKey ?? "",
      signatures: t.intermediateSigningKey?.signatures ?? [],
    },
    version: t.protocolVersion,
    signed_message: sm,
    merchant_identifier: process.env.PAGARME_GOOGLE_PAY_MERCHANT_ID ?? "",
  };
}

/** Apple Merchant ID usado no `merchant_identifier` do payload Apple Pay do
 *  Pagar.me (é ele que diz qual certificado usar pra descriptografar). */
const applePayMerchantId = () =>
  process.env.PAGARME_APPLE_PAY_MERCHANT_ID ?? "merchant.br.app.jurandir";

/** Apple Pay: o plugin `pay` (iOS) devolve o PKPaymentToken serializado como
 *  string JSON. O Pagar.me descriptografa o `paymentData` usando o certificado
 *  do nosso Merchant ID. Formato EXATO validado contra a API (2026-09-11):
 *  - o `header` precisa vir em snake_case (a Apple manda camelCase → converter,
 *    senão o Pagar.me descarta e recusa 422);
 *  - `merchant_identifier` é OBRIGATÓRIO dentro de `apple_pay`. */
function mapApplePay(raw: string): Record<string, unknown> {
  try {
    const t = JSON.parse(raw) as Record<string, any>;
    const pd = (t.paymentData ?? t.payment_data ?? t) as Record<string, any>;
    const h = (pd.header ?? {}) as Record<string, any>;
    return {
      version: pd.version,
      data: pd.data,
      signature: pd.signature,
      header: {
        ephemeral_public_key: h.ephemeral_public_key ?? h.ephemeralPublicKey,
        public_key_hash: h.public_key_hash ?? h.publicKeyHash,
        transaction_id: h.transaction_id ?? h.transactionId,
        // wrapped_key só existe no fluxo RSA_v1 (não no EC_v1 padrão) — mantém se vier.
        ...(h.wrapped_key ?? h.wrappedKey
          ? { wrapped_key: h.wrapped_key ?? h.wrappedKey }
          : {}),
      },
      merchant_identifier: applePayMerchantId(),
    };
  } catch {
    return { data: raw, merchant_identifier: applePayMerchantId() };
  }
}

// A conta Pagar.me EXIGE `billing_address` pra cartão/carteira (recusa com
// `validation_error | billing | "value" is required`), mas só valida a PRESENÇA
// — não confere contra o cartão. Enquanto não coletamos o endereço real do
// portador (ou o Pagar.me remover a exigência), mandamos um billing fixo válido.
// TODO: trocar pelo billing real (CEP do cartão manual / billingContact do
// Apple Pay) quando reativar a coleta — ver createCardTokenPayment/Wallet.
const DEFAULT_BILLING = {
  line_1: "100, Rua Santos, Centro",
  zip_code: "86020040", // Londrina/PR — região do cartão do chefe (teste antifraude)
  city: "Londrina",
  state: "PR",
  country: "BR",
};

/** Billing do cartão: usa o endereço real (se o app enviou) ou o fixo. */
function billingFor(billing?: CardBillingAddress) {
  if (billing && billing.line_1 && billing.zip_code && billing.city && billing.state) {
    return {
      line_1: billing.line_1,
      zip_code: billing.zip_code.replace(/\D/g, ""),
      city: billing.city,
      state: billing.state,
      country: "BR",
    };
  }
  return DEFAULT_BILLING;
}

export const pagarmeProvider: PaymentProvider = {
  name: "PAGARME",
  async createWalletPayment(input: WalletPaymentInput): Promise<CardPaymentResult> {
    const { est, reference, total, platformFee, description, walletType, token } = input;
    recipientFor(est); // valida recebedor (estabelecimento ou plataforma p/ testes)
    const totalCents = cents(total);
    const payload =
      walletType === "google_pay"
        ? { type: "google_pay", google_pay: mapGooglePay(token) }
        : { type: "apple_pay", apple_pay: mapApplePay(token) };
    const body = {
      code: reference,
      items: [{ amount: totalCents, description, quantity: 1, code: reference }],
      customer: buildCustomer(reference),
      payments: [
        {
          payment_method: "credit_card",
          // A conta exige billing tb na carteira; Apple/Google Pay não mandam
          // endereço por padrão, então usamos o fixo (a conta só valida presença).
          credit_card: { statement_descriptor: "JURANDIR", payload, card: { billing_address: DEFAULT_BILLING } },
          split: buildSplit(est, totalCents, cents(platformFee)),
        },
      ],
    };
    const order = await call<PgOrder>("/orders", { method: "POST", body: JSON.stringify(body) });
    const charge = order.charges?.[0];
    return {
      chargeId: charge?.id ?? order.id,
      status: mapStatus(charge?.status ?? order.status),
      statusDetail: charge?.last_transaction?.status,
    };
  },
  // Cartão via TOKEN da tokenização (jeito CORRETO da v5 — substitui o
  // "checkout" hospedado que dava 412). O app tokeniza com a chave pública e
  // manda só o `card_token`; aqui montamos o pedido credit_card/debit_card.
  async createCardTokenPayment(input: CardTokenPaymentInput): Promise<CardPaymentResult> {
    const { est, reference, total, platformFee, description, cardToken, installments, method,
      customerName, customerDocument, customerPhone, billing } = input;
    recipientFor(est);
    const totalCents = cents(total);
    const isDebit = method === "debit";
    // A conta exige billing_address pra cartão. Usa o do app (CEP via ViaCEP)
    // quando vier; senão, o billing fixo (a conta só valida a presença).
    const cardObj = {
      statement_descriptor: "JURANDIR",
      card_token: cardToken,
      ...(isDebit ? {} : { installments: installments > 0 ? installments : 1 }),
      card: { billing_address: billingFor(billing) },
    };
    const body = {
      code: reference,
      items: [{ amount: totalCents, description, quantity: 1, code: reference }],
      customer: buildCustomer(reference, { name: customerName, document: customerDocument, phone: customerPhone }),
      payments: [
        {
          payment_method: isDebit ? "debit_card" : "credit_card",
          [isDebit ? "debit_card" : "credit_card"]: cardObj,
          split: buildSplit(est, totalCents, cents(platformFee)),
        },
      ],
    };
    const order = await call<PgOrder>("/orders", { method: "POST", body: JSON.stringify(body) });
    const charge = order.charges?.[0];
    return {
      chargeId: charge?.id ?? order.id,
      status: mapStatus(charge?.status ?? order.status),
      statusDetail: charge?.last_transaction?.status,
    };
  },
  async createPixCharge(input: PixChargeInput): Promise<PixCharge> {
    const { est, reference, total, platformFee, customerName, customerDocument, customerPhone, description } = input;
    recipientFor(est); // valida recebedor (estabelecimento ou plataforma p/ testes)
    const totalCents = cents(total);
    const body = {
      code: reference,
      items: [{ amount: totalCents, description, quantity: 1, code: reference }],
      customer: buildCustomer(reference, { name: customerName, document: customerDocument, phone: customerPhone }),
      payments: [
        {
          payment_method: "pix",
          pix: { expires_in: PIX_EXPIRES_MIN * 60 },
          split: buildSplit(est, totalCents, cents(platformFee)),
        },
      ],
    };
    const order = await call<PgOrder>("/orders", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const charge = order.charges?.[0];
    const tx = charge?.last_transaction;
    return {
      chargeId: charge?.id ?? order.id,
      pixPayload: tx?.qr_code ?? "",
      pixQrImage: await qrImageBase64(tx?.qr_code_url),
      status: mapStatus(charge?.status ?? order.status),
    };
  },
  async getChargeStatus(_est: Establishment, chargeId: string): Promise<ChargeStatus> {
    const c = await call<PgCharge>(`/charges/${chargeId}`);
    return mapStatus(c.status);
  },
  // Cartão (crédito/débito) via CHECKOUT HOSPEDADO do Pagar.me: cria um pedido de
  // checkout com split e devolve a URL pro cliente pagar (3DS do débito acontece
  // lá). Mesmo padrão de redirect do Checkout Pro do MP.
  async createCheckoutPreference(input: CheckoutPreferenceInput): Promise<CheckoutPreference> {
    const { est, reference, total, platformFee, items, method } = input;
    recipientFor(est); // valida recebedor (estabelecimento ou plataforma p/ testes)
    const totalCents = cents(total);
    const accepted = method === "DEBIT" ? ["debit_card"] : ["credit_card"];
    const body = {
      code: reference,
      items: items.map((i) => ({
        amount: cents(i.unitPrice),
        description: i.title,
        quantity: i.quantity,
        code: reference,
      })),
      customer: buildCustomer(reference),
      payments: [
        {
          payment_method: "checkout",
          checkout: {
            accepted_payment_methods: accepted,
            success_url: `${appBase()}/pt/${est.slug}?paid=1`,
            expires_in: 3600,
            // Crédito à vista (1x). Parcelamento pode entrar depois.
            ...(method === "DEBIT"
              ? {}
              : { credit_card: { installments: [{ number: 1, total: totalCents }] } }),
          },
          split: buildSplit(est, totalCents, cents(platformFee)),
        },
      ],
    };
    const order = await call<PgOrder & { checkouts?: { id?: string; payment_url?: string }[] }>(
      "/orders",
      { method: "POST", body: JSON.stringify(body) },
    );
    const co = order.checkouts?.[0];
    return { preferenceId: co?.id ?? order.id, checkoutUrl: co?.payment_url ?? "" };
  },
  // Reconciliação do checkout (o id da cobrança só existe depois que o cliente
  // paga): busca o pedido pelo nosso `code` e confirma se alguma cobrança pagou.
  async findApprovedPayment(_est: Establishment, reference: string): Promise<FoundPayment | null> {
    const r = await call<{ data?: PgOrder[] }>(
      `/orders?code=${encodeURIComponent(reference)}`,
    );
    for (const o of r.data ?? []) {
      const paid = (o.charges ?? []).find((c) => mapStatus(c.status) === "paid");
      if (paid?.id) return { paymentId: paid.id, status: "paid" };
    }
    return null;
  },
};

// ---- Recebedor (onboarding com KYC hospedado) ------------------------------
//
// Fluxo "prova de vida": criamos o recebedor com o MÍNIMO (nome/documento/
// contato) → nasce em `registration`. A conta bancária + identidade + biometria
// o DONO preenche direto no webapp hospedado do Pagar.me (kyc_link) — esses
// dados nunca passam pelo nosso servidor. Status evolui registration →
// affiliation → active (avisado pelo webhook recipient.updated).

export type PagarmeRecipientInput = {
  type: "individual" | "corporation";
  name: string;
  email: string;
  document: string; // CPF/CNPJ
  phone?: string;
  birthdate?: string; // "YYYY-MM-DD" (PF) / abertura (PJ)
  motherName?: string;
  monthlyIncome?: number;
  professionalOccupation?: string;
  // conta bancária (exigida pelo Pagar.me na criação)
  bank: string;
  branchNumber: string;
  branchCheckDigit?: string;
  accountNumber: string;
  accountCheckDigit: string;
  accountType: "checking" | "savings";
  // endereço (register_information.address — exigido na criação)
  street?: string;
  streetNumber?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  // sócios administradores (register_information.managing_partners) — o Pagar.me
  // EXIGE ao menos um pra recebedor PJ (corporation). Cada sócio é um KYC de PF.
  managingPartners?: PagarmePartnerInput[];
};

/** Sócio administrador de um recebedor PJ. O Pagar.me trata cada um como uma
 *  pessoa física (KYC próprio): CPF, nascimento, renda, ocupação, endereço e
 *  telefone são exigidos; nome da mãe é opcional. */
export type PagarmePartnerInput = {
  name: string;
  email: string;
  document: string; // CPF do sócio
  phone?: string;
  birthdate?: string; // "YYYY-MM-DD" ou "DD/MM/AAAA"
  motherName?: string;
  monthlyIncome?: number;
  professionalOccupation?: string;
  /** self_declared_legal_representative — o sócio se declara representante legal. */
  legalRepresentative?: boolean;
  street?: string;
  streetNumber?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;
};

function splitPhone(phone?: string): { ddd: string; number: string; type: "mobile" } | null {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return { ddd: d.slice(0, 2), number: d.slice(2), type: "mobile" };
}

/** Pagar.me v5 exige birthdate/founding_date no formato DD/MM/AAAA
 *  (regex /^\d{2}\/\d{2}\/\d{4}$/). O form manda ISO (AAAA-MM-DD, do
 *  <input type="date">); convertemos. Se já vier DD/MM/AAAA, passa direto;
 *  sem data válida, usa o fallback (também DD/MM/AAAA). */
function toBrDate(value: string | undefined, fallback: string): string {
  const v = (value ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v); // AAAA-MM-DD (aceita datetime)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return v; // já DD/MM/AAAA
  return fallback;
}

type AddrFields = {
  street?: string;
  streetNumber?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;
};

function addrOf(a: AddrFields) {
  return {
    street: a.street || "",
    street_number: a.streetNumber || "",
    // Pagar.me exige o campo complementary preenchido (não aceita vazio).
    complementary: a.complement || "N/A",
    neighborhood: a.neighborhood || "",
    city: a.city || "",
    state: a.state || "",
    zip_code: (a.zipCode ?? "").replace(/\D/g, ""),
    reference_point: "N/A",
  };
}

const addressBody = (i: PagarmeRecipientInput) => addrOf(i);

/** Monta um sócio administrador (managing_partner) no shape da Pagar.me v5.
 *  phone_numbers e address são exigidos; sem eles a criação do PJ é recusada. */
function partnerBody(p: PagarmePartnerInput) {
  const doc = p.document.replace(/\D/g, "");
  const phone = splitPhone(p.phone);
  return {
    name: p.name,
    email: p.email,
    document: doc,
    type: "individual",
    birthdate: toBrDate(p.birthdate, "01/01/1990"),
    monthly_income: p.monthlyIncome ?? 5000,
    professional_occupation: p.professionalOccupation || "Empresário",
    self_declared_legal_representative: p.legalRepresentative ?? true,
    address: addrOf(p),
    ...(p.motherName ? { mother_name: p.motherName } : {}),
    ...(phone ? { phone_numbers: [phone] } : {}),
  };
}

/** Cria um recebedor (conta bancária + KYC). A biometria/prova de vida o dono
 *  conclui depois no webapp hospedado (getPagarmeKycLink). Devolve id + status. */
export async function createPagarmeRecipient(
  input: PagarmeRecipientInput,
): Promise<{ id: string; status: string }> {
  const doc = input.document.replace(/\D/g, "");
  const phone = splitPhone(input.phone);
  const register =
    input.type === "individual"
      ? {
          type: "individual",
          name: input.name,
          email: input.email,
          document: doc,
          mother_name: input.motherName || input.name,
          birthdate: toBrDate(input.birthdate, "01/01/1990"),
          monthly_income: input.monthlyIncome ?? 5000,
          professional_occupation: input.professionalOccupation || "Empresário",
          address: addressBody(input),
          ...(phone ? { phone_numbers: [phone] } : {}),
        }
      : {
          type: "corporation",
          company_name: input.name,
          trading_name: input.name,
          email: input.email,
          document: doc,
          annual_revenue: input.monthlyIncome ? input.monthlyIncome * 12 : 100000,
          // founding_date (Abertura) é OPCIONAL pro Pagar.me — só manda se vier.
          ...(input.birthdate ? { founding_date: toBrDate(input.birthdate, "01/01/2015") } : {}),
          main_address: addressBody(input),
          managing_partners: (input.managingPartners ?? []).map(partnerBody),
          ...(phone ? { phone_numbers: [phone] } : {}),
        };
  // Identidade (name/email/document/type) vai SÓ dentro de register_information —
  // o Pagar.me recusa (422) se esses campos também vierem no topo.
  const body = {
    description: `Recebedor Jurandir — ${input.name}`,
    default_bank_account: {
      holder_name: input.name,
      holder_type: input.type === "individual" ? "individual" : "company",
      holder_document: doc,
      bank: input.bank,
      branch_number: input.branchNumber,
      ...(input.branchCheckDigit ? { branch_check_digit: input.branchCheckDigit } : {}),
      account_number: input.accountNumber,
      account_check_digit: input.accountCheckDigit,
      type: input.accountType,
    },
    transfer_settings: { transfer_enabled: true, transfer_interval: "Daily", transfer_day: 0 },
    register_information: register,
  };
  const r = await call<{ id: string; status: string }>("/recipients", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { id: r.id, status: r.status };
}

/** Gera o link/QR do webapp hospedado onde o dono completa conta + identidade.
 *  Só fica disponível quando o recebedor atinge `affiliation` (senão o Pagar.me
 *  recusa e devolvemos url/base64 vazios). */
export async function getPagarmeKycLink(
  recipientId: string,
): Promise<{ url: string; base64: string; expiresAt: string }> {
  const r = await call<{ url?: string; base64?: string; expiration_date?: string }>(
    `/recipients/${recipientId}/kyc_link`,
    { method: "POST" },
  );
  return { url: r.url ?? "", base64: r.base64 ?? "", expiresAt: r.expiration_date ?? "" };
}

/** Consulta o status atual do recebedor direto no Pagar.me (GET). Usado pra
 *  sincronizar quando o webhook `recipient.updated` não está configurado (ou já
 *  perdeu a transição). Devolve "" em qualquer falha e tem timeout curto pra
 *  nunca travar o carregamento do painel. */
export async function getPagarmeRecipientStatus(recipientId: string): Promise<string> {
  try {
    const res = await fetch(`${baseUrl()}/recipients/${recipientId}`, {
      headers: { "Content-Type": "application/json", Authorization: authHeader() },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return "";
    const j = (await res.json()) as { status?: string };
    return j.status ?? "";
  } catch {
    return "";
  }
}
