import type { Establishment } from "@prisma/client";
import { PIX_EXPIRES_MIN } from "@/lib/domain/pricing";
import type {
  PaymentProvider,
  PixCharge,
  PixChargeInput,
  ChargeStatus,
  CardTokenPaymentInput,
  CardPaymentResult,
} from "./types";

// Appmax (gateway BR) — modelo marketplace, IGUAL ao Pagar.me: a PLATAFORMA é o
// merchant (credenciais no `.env`, obtidas UMA vez pelo fluxo de instalação
// OAuth/App Store) e cada bar é um `recipient` (split por pedido). Amounts em
// CENTAVOS (inteiros). Auth: OAuth2 client_credentials → Bearer (~1h, sem
// refresh). Webhook NÃO é assinado → confirmamos por re-fetch do pedido.
//
// ⚠️ Diferenças vs Pagar.me (ver docs):
//  - Fluxo em 3 passos: POST /v1/customers → POST /v1/orders → POST /v1/payments/*.
//  - Cartão de crédito volta `autorizado` (pending, em antifraude) → o webhook
//    `order_approved` confirma `aprovado`. NÃO é síncrono como o Pagar.me.
//  - NÃO existe débito avulso (só crédito/pix/boleto/apple-pay). Débito só via
//    Apple Pay. → CAP: {pix:true, credit:true, debit:false}.
//  - `customer.ip` é OBRIGATÓRIO (o cliente coleta via Appmax JS). TODO: passar
//    o IP real do pagador (hoje usa placeholder).

const authUrl = () => process.env.APPMAX_AUTH_URL ?? "https://auth.appmax.com.br";
const apiUrl = () => process.env.APPMAX_BASE_URL ?? "https://api.appmax.com.br";
const clientId = () => process.env.APPMAX_CLIENT_ID ?? "";
const clientSecret = () => process.env.APPMAX_CLIENT_SECRET ?? "";
/** CPF de teste válido enquanto o checkout não coleta o CPF real do pagador. */
const testCpf = () => (process.env.APPMAX_TEST_CPF ?? "25226493029").replace(/\D/g, "");

export class AppmaxError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Appmax ${status}: ${body}`);
    this.name = "AppmaxError";
  }
}

// --- OAuth2 client_credentials: token de ~1h cacheado em memória (sem refresh) ---
let cachedToken: { token: string; expiresAt: number } | null = null;
async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;
  const res = await fetch(`${authUrl()}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId(),
      client_secret: clientSecret(),
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new AppmaxError(res.status, text);
  const j = JSON.parse(text) as { access_token: string; expires_in: number };
  // renova 60s antes de expirar pra não pegar a virada no meio de uma cobrança.
  cachedToken = { token: j.access_token, expiresAt: Date.now() + ((j.expires_in ?? 3600) - 60) * 1000 };
  return cachedToken.token;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${apiUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new AppmaxError(res.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}

/** Reais → centavos (Appmax trabalha em inteiros). */
const cents = (v: number) => Math.round(v * 100);
const digits = (v?: string) => (v ?? "").replace(/\D/g, "");

/** Status do pedido Appmax → nosso ChargeStatus. `autorizado` = cartão autorizado
 *  mas em antifraude (ainda não liberado) → tratamos como `pending` até o webhook
 *  `order_approved`. */
function mapStatus(s: string | undefined): ChargeStatus {
  if (s === "aprovado" || s === "integrado") return "paid";
  if (
    s === "pendente" ||
    s === "autorizado" ||
    s === "pendente_integracao" ||
    s === "pendente_integracao_em_analise"
  ) {
    return "pending";
  }
  return "failed"; // cancelado, estornado, recusado_por_risco, chargeback_*
}

type ApiCustomer = { data: { customer: { id: number } } };
type ApiOrder = { data: { order: { id: number; status: string } } };

/** Passos 1+2 do fluxo Appmax: cria/atualiza o cliente e o pedido. Devolve os
 *  ids pros passos de pagamento. */
async function createCustomerAndOrder(
  input: { reference: string; total: number; description: string; customerName?: string; customerDocument?: string; customerPhone?: string; customerIp?: string },
  totalCents: number,
): Promise<{ customerId: number; orderId: number }> {
  const [first, ...rest] = (input.customerName || "Cliente Jurandir").trim().split(/\s+/);
  const customer = await call<ApiCustomer>("/v1/customers", {
    method: "POST",
    body: JSON.stringify({
      first_name: first,
      last_name: rest.join(" ") || "Jurandir",
      email: `pedido-${input.reference.toLowerCase()}@jurandir.app.br`,
      phone: digits(input.customerPhone).slice(0, 11) || "47999990000",
      ip: input.customerIp || "0.0.0.0", // TODO: IP real do pagador (Appmax exige)
      document_number: digits(input.customerDocument) || testCpf(),
    }),
  });
  const order = await call<ApiOrder>("/v1/orders", {
    method: "POST",
    body: JSON.stringify({
      customer_id: customer.data.customer.id,
      products: [{ sku: input.reference, name: input.description, quantity: 1, unit_value: totalCents, type: "digital" }],
      products_value: totalCents,
    }),
  });
  return { customerId: customer.data.customer.id, orderId: order.data.order.id };
}

/** Split ANTES da aprovação: manda `total−comissão` pro recebedor do bar; o
 *  restante (comissão, já líquido das taxas Appmax) fica no merchant da
 *  plataforma. Sem recebedor do bar → sem split (cai na conta da plataforma). */
async function applySplit(est: Establishment, orderId: number, totalCents: number, feeCents: number): Promise<void> {
  if (!est.appmaxRecipientHash) return;
  const establishmentShare = Math.max(0, totalCents - feeCents);
  await call(`/v1/orders/${orderId}/split-order`, {
    method: "POST",
    body: JSON.stringify({ split: [{ amount: establishmentShare, recipient_hash: est.appmaxRecipientHash }] }),
  });
}

type ApiPixPayment = {
  data: {
    // ⚠️ nomes de campo divergem entre páginas dos docs — tentamos os dois.
    payment?: { pix_emv?: string; pix_qrcode?: string; pix_expiration_date?: string };
    pix?: { emv_code?: string; qr_code?: string; expires_at?: string };
  };
};

export const appmaxProvider: PaymentProvider = {
  name: "APPMAX",
  async createPixCharge(input: PixChargeInput): Promise<PixCharge> {
    const totalCents = cents(input.total);
    const { orderId } = await createCustomerAndOrder(input, totalCents);
    await applySplit(input.est, orderId, totalCents, cents(input.platformFee));
    const expires = new Date(Date.now() + PIX_EXPIRES_MIN * 60_000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);
    const pay = await call<ApiPixPayment>("/v1/payments/pix", {
      method: "POST",
      body: JSON.stringify({
        order_id: orderId,
        payment_data: { pix: { document_number: digits(input.customerDocument) || testCpf(), expiration_date: expires } },
      }),
    });
    const p = pay.data.payment ?? {};
    const alt = pay.data.pix ?? {};
    const emv = p.pix_emv ?? alt.emv_code ?? "";
    const qr = (p.pix_qrcode ?? alt.qr_code ?? "").replace(/^data:image\/png;base64,/, "");
    return { chargeId: String(orderId), pixPayload: emv, pixQrImage: qr, status: "pending" };
  },

  async getChargeStatus(_est: Establishment, chargeId: string): Promise<ChargeStatus> {
    const o = await call<ApiOrder>(`/v1/orders/${chargeId}`);
    return mapStatus(o.data.order.status);
  },

  /** Cartão de crédito via TOKEN (o app tokeniza com a Appmax; o cartão cru não
   *  passa pelo nosso backend). Retorna `pending` no `autorizado` (antifraude) —
   *  o webhook confirma. `method:"debit"` NÃO é suportado pela Appmax. */
  async createCardTokenPayment(input: CardTokenPaymentInput): Promise<CardPaymentResult> {
    if (input.method === "debit") {
      return { chargeId: "", status: "failed", statusDetail: "appmax: débito não suportado" };
    }
    const totalCents = cents(input.total);
    const { customerId, orderId } = await createCustomerAndOrder(input, totalCents);
    await applySplit(input.est, orderId, totalCents, cents(input.platformFee));
    const charge = await call<ApiOrder>("/v1/payments/credit-card", {
      method: "POST",
      body: JSON.stringify({
        order_id: orderId,
        customer_id: customerId,
        payment_data: {
          credit_card: {
            token: input.cardToken,
            holder_document_number: digits(input.customerDocument) || testCpf(),
            holder_name: input.customerName || "Cliente Jurandir",
            installments: input.installments > 0 ? input.installments : 1,
            soft_descriptor: "JURANDIR",
          },
        },
      }),
    });
    const status = charge.data.order.status;
    return { chargeId: String(charge.data.order.id ?? orderId), status: mapStatus(status), statusDetail: status };
  },
};

/** Onboarding: cria o `recipient` (sub-conta com KYC) do estabelecimento e
 *  devolve o `recipient_hash`. A prova de vida (facematch) o dono conclui pelo
 *  link SMS (`facematch-link`); status por `GET /v1/recipient/{hash}/status`
 *  (só `Onboarding completed` recebe split). Recebedores NÃO podem ser editados/
 *  apagados; um CNPJ só pode ser cadastrado uma vez. */
export async function createAppmaxRecipient(input: {
  name: string;
  email: string;
  cpf: string;
  phone: string;
  dateOfBirth: string; // YYYY-MM-DD
  revenue: number; // reais (inteiro)
  storeUrl: string;
  companyName: string;
  companyDocumentNumber: string; // CNPJ 14 dígitos
  companyPostcode: string;
  companyAddress: string;
  companyAddressNumber: string;
  companyAddressState: string;
  companyAddressNeighborhood: string;
  companyCity: string;
}): Promise<{ recipientHash: string }> {
  const r = await call<{ data?: { recipient_hash?: string }; recipient_hash?: string }>("/v1/recipient", {
    method: "POST",
    body: JSON.stringify({
      triage: { revenue: input.revenue, storeUrl: input.storeUrl },
      account: {
        email: input.email,
        name: input.name,
        cpf: digits(input.cpf),
        phone: digits(input.phone),
        dateOfBirth: input.dateOfBirth,
      },
      company: {
        companyName: input.companyName,
        companyDocumentNumber: digits(input.companyDocumentNumber),
        companyPostcode: digits(input.companyPostcode),
        companyAddress: input.companyAddress,
        companyAddressNumber: input.companyAddressNumber,
        companyAddressState: input.companyAddressState,
        companyAddressNeighborhood: input.companyAddressNeighborhood,
        companyCity: input.companyCity,
      },
    }),
  });
  const hash = r.data?.recipient_hash ?? r.recipient_hash ?? "";
  return { recipientHash: hash };
}

/** Status do recebedor Appmax (poll — não tem webhook). */
export async function getAppmaxRecipientStatus(recipientHash: string): Promise<string> {
  try {
    const r = await call<{ data?: string }>(`/v1/recipient/${recipientHash}/status`);
    return r.data ?? "";
  } catch {
    return "";
  }
}
