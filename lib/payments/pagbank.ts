import { createHmac } from "crypto";
import type { Establishment } from "@prisma/client";
import { PIX_EXPIRES_MIN } from "@/lib/domain/pricing";
import type {
  PaymentProvider,
  PixCharge,
  PixChargeInput,
  ChargeStatus,
  WalletPaymentInput,
  CardPaymentResult,
  CardTokenPaymentInput,
} from "./types";

// PagBank (API de Pedidos). A PLATAFORMA tem a conta principal (token do .env).
// Cada bar é uma conta PagBank própria (`ACCO_…`, via Connect); o split manda
// total−comissão pro bar e a comissão pra conta da plataforma.
// Doc: https://developer.pagbank.com.br/reference/criar-pedido
//
// Débito NÃO é implementado: o PagBank exige 3DS no débito (só há SDK JS, sem
// SDK nativo) e a divisão de pagamento não cobre débito (só Pix/crédito/boleto).
// ---- Ambiente (teste/produção) --------------------------------------------
// O token do PagBank é da conta-mãe (marketplace) → o ambiente é GLOBAL da
// plataforma, escolhido pelo admin (`AppSetting.pagbankMode`). Convenção de env:
// PRODUÇÃO usa o nome SEM sufixo (`PAGBANK_TOKEN`), TESTE usa `PAGBANK_TOKEN_TEST`
// (caindo pro de produção se o `_TEST` não existir) — assim você só precisa criar
// o `_TEST`, sem duplicar a variável de produção. Cache em memória (TTL curto) pra
// não ler o banco a cada chamada; `ensurePagbankMode()` atualiza antes de cobrar e
// `bustPagbankModeCache()` invalida quando o admin troca. Default TEST (o PagBank
// ainda não está no ar) — e mantém os testes verdes (leem os envs sem sufixo).
type Mode = "TEST" | "PRODUCTION";
let cachedMode: Mode | null = null;
let cachedModeAt = 0;
const MODE_TTL_MS = 30_000;

const modeSuffix = (): Mode => cachedMode ?? "TEST";

/** Atualiza o modo a partir do banco (cacheado). No-op em teste (sem DB): fica
 *  no default TEST, que lê os envs sem sufixo. */
export async function ensurePagbankMode(): Promise<Mode> {
  if (process.env.VITEST || process.env.NODE_ENV === "test") return modeSuffix();
  if (cachedMode && Date.now() - cachedModeAt < MODE_TTL_MS) return cachedMode;
  try {
    const { getPagbankMode } = await import("@/lib/db/settings");
    cachedMode = (await getPagbankMode()) as Mode;
  } catch {
    // Banco indisponível / tabela ainda não criada → mantém o que tiver (ou TEST).
    cachedMode = cachedMode ?? "TEST";
  }
  cachedModeAt = Date.now();
  return cachedMode;
}

/** Invalida o cache do modo — chamar quando o admin troca teste⇄produção. */
export function bustPagbankModeCache(): void {
  cachedMode = null;
  cachedModeAt = 0;
}

/** Só para testes: fixa o modo em memória sem tocar no banco (null = default). */
export function __setPagbankModeForTests(mode: Mode | null): void {
  cachedMode = mode;
  cachedModeAt = mode ? Date.now() : 0;
}

/** Lê uma env por modo. PRODUÇÃO: nome sem sufixo. TESTE: `NOME_TEST`, caindo
 *  pro nome sem sufixo quando o `_TEST` não existe (só cria o que precisar). */
const envByMode = (name: string): string =>
  modeSuffix() === "TEST"
    ? (process.env[`${name}_TEST`] ?? process.env[name] ?? "")
    : (process.env[name] ?? "");

const baseUrl = () => {
  if (modeSuffix() === "PRODUCTION") {
    // Produção NUNCA herda o PAGBANK_BASE_URL genérico (pode estar em sandbox) —
    // sempre a URL real, salvo override explícito _PRODUCTION.
    return (process.env.PAGBANK_BASE_URL_PRODUCTION ?? "https://api.pagseguro.com").replace(/\/$/, "");
  }
  const override = process.env.PAGBANK_BASE_URL_TEST ?? process.env.PAGBANK_BASE_URL;
  return (override ?? "https://sandbox.api.pagseguro.com").replace(/\/$/, "");
};
const token = () => envByMode("PAGBANK_TOKEN");
/** Conta da plataforma (`ACCO_…`) — recebe a comissão no split. */
const platformAccount = () => envByMode("PAGBANK_PLATFORM_ACCOUNT_ID");
/** Base pública do app (notification_urls). */
const appBase = () => (process.env.APP_BASE_URL ?? "").replace(/\/$/, "");

export class PagbankError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`PagBank ${status}: ${body}`);
    this.name = "PagbankError";
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new PagbankError(res.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}

/** Reais → centavos (PagBank trabalha em inteiros). */
const cents = (v: number) => Math.round(v * 100);

function mapStatus(s: string | undefined): ChargeStatus {
  if (s === "PAID") return "paid";
  if (s === "WAITING" || s === "IN_ANALYSIS" || s === "AUTHORIZED") return "pending";
  return "failed"; // DECLINED | CANCELED
}

type PbLink = { rel?: string; href?: string };
type PbCharge = {
  id: string;
  status: string;
  qr_code?: { text?: string };
  links?: PbLink[];
  payment_response?: { code?: string; message?: string };
};
type PbOrder = { id: string; charges?: PbCharge[] };

/** Customer do pedido. `tax_id` (CPF) é obrigatório e o nome precisa ter nome e
 *  sobrenome. Sem CPF real do pagador, usa o de TESTE (env PAGBANK_TEST_CPF).
 *  PRODUÇÃO: o app já coleta o CPF real no cartão/Pix. */
function buildCustomer(reference: string, opts?: { name?: string; document?: string; phone?: string }) {
  const rawDoc = (opts?.document ?? "").replace(/\D/g, "");
  const taxId = rawDoc.length >= 11
    ? rawDoc
    : (process.env.PAGBANK_TEST_CPF ?? "11144477735").replace(/\D/g, "");
  const name = (opts?.name ?? "").trim();
  const digits = (opts?.phone ?? "").replace(/\D/g, "");
  const local = digits.length >= 12 ? digits.slice(2) : digits; // tira o DDI 55
  return {
    name: name.includes(" ") ? name : `${name || "Cliente"} Jurandir`,
    email: `pedido-${reference.toLowerCase()}@jurandir.app.br`,
    tax_id: taxId,
    ...(local.length >= 10
      ? { phones: [{ country: "55", area: local.slice(0, 2), number: local.slice(2), type: "MOBILE" }] }
      : {}),
  };
}

/** Divisão do pagamento: bar recebe total−comissão, plataforma a comissão.
 *  Sem conta PagBank PRÓPRIA do bar → `undefined` (sem split): a cobrança cai
 *  inteira na conta da plataforma (permite testar só com o token do .env).
 *  `liable`/chargeback só valem pra cartão de crédito. */
function buildSplits(est: Establishment, totalCents: number, feeCents: number, card: boolean) {
  const bar = est.pagbankAccountId;
  const platform = platformAccount();
  if (!bar || !platform || bar === platform || feeCents <= 0) return undefined;
  const cfg = (isBar: boolean) =>
    card
      ? {
          configurations: {
            liable: isBar,
            chargeback: { charge_transfer: { percentage: isBar ? 100 : 0 } },
          },
        }
      : {};
  return {
    method: "FIXED",
    receivers: [
      {
        account: { id: bar },
        amount: { value: totalCents - feeCents },
        reason: "Venda",
        ...cfg(true),
      },
      {
        account: { id: platform },
        amount: { value: feeCents },
        reason: "Comissão Jurandir",
        ...cfg(false),
      },
    ],
  };
}

/** notification_urls só aceita HTTPS (e uma URL só). Em dev (http) omite. */
function notificationUrls(): string[] | undefined {
  const base = appBase();
  return base.startsWith("https://") ? [`${base}/api/webhooks/pagbank`] : undefined;
}

/** Monta e cria o pedido com UMA cobrança (charge) e devolve a cobrança criada. */
async function createOrder(
  est: Establishment,
  reference: string,
  total: number,
  platformFee: number,
  description: string,
  customer: ReturnType<typeof buildCustomer>,
  paymentMethod: Record<string, unknown>,
): Promise<PbCharge | undefined> {
  await ensurePagbankMode(); // resolve sandbox/produção ANTES de montar o split/token
  const totalCents = cents(total);
  const isCard = paymentMethod.type === "CREDIT_CARD";
  const body = {
    reference_id: reference,
    customer,
    items: [{ reference_id: reference, name: description, quantity: 1, unit_amount: totalCents }],
    notification_urls: notificationUrls(),
    charges: [
      {
        reference_id: reference,
        description: description.slice(0, 64),
        amount: { value: totalCents, currency: "BRL" },
        payment_method: paymentMethod,
        splits: buildSplits(est, totalCents, cents(platformFee), isCard),
      },
    ],
  };
  const order = await call<PbOrder>("/orders", { method: "POST", body: JSON.stringify(body) });
  return order.charges?.[0];
}

/** Resultado de cartão/carteira no formato comum dos providers. */
function cardResult(charge: PbCharge | undefined): CardPaymentResult {
  if (!charge) throw new PagbankError(502, "pedido sem cobrança");
  return {
    chargeId: charge.id,
    status: mapStatus(charge.status),
    statusDetail: charge.payment_response?.message,
  };
}

/** Busca o PNG do QR em base64 (link QRCODE.BASE64 da cobrança). "" se falhar. */
async function qrImageBase64(links: PbLink[] | undefined): Promise<string> {
  const href = links?.find((l) => l.rel === "QRCODE.BASE64")?.href;
  if (!href) return "";
  try {
    const res = await fetch(href, { headers: { Authorization: `Bearer ${token()}` } });
    if (!res.ok) return "";
    return (await res.text()).trim();
  } catch {
    return "";
  }
}

/** Apple Pay: o PagBank espera em `wallet.key` o `token.paymentData` (JSON em
 *  string). O plugin `pay` devolve o PKPaymentToken serializado — extrai o
 *  paymentData; se já vier só ele, passa direto. */
function applePayKey(raw: string): string {
  try {
    const t = JSON.parse(raw) as Record<string, unknown>;
    const pd = t.paymentData ?? t.payment_data;
    return pd ? JSON.stringify(pd) : raw;
  } catch {
    return raw;
  }
}

export const pagbankProvider: PaymentProvider = {
  name: "PAGBANK",
  async createPixCharge(input: PixChargeInput): Promise<PixCharge> {
    const { est, reference, total, platformFee, customerName, customerDocument, customerPhone, description } = input;
    const expiration = new Date(Date.now() + PIX_EXPIRES_MIN * 60_000).toISOString();
    const charge = await createOrder(
      est,
      reference,
      total,
      platformFee,
      description,
      buildCustomer(reference, { name: customerName, document: customerDocument, phone: customerPhone }),
      { type: "PIX", pix: { expiration_date: expiration } },
    );
    if (!charge) throw new PagbankError(502, "pedido Pix sem cobrança");
    return {
      chargeId: charge.id,
      pixPayload: charge.qr_code?.text ?? "",
      pixQrImage: await qrImageBase64(charge.links),
      status: mapStatus(charge.status),
    };
  },
  // Cartão de CRÉDITO: o app criptografa o cartão com a chave pública do PagBank
  // (`encrypted`) — o cartão cru nunca chega aqui. `cardToken` = esse encrypted.
  async createCardTokenPayment(input: CardTokenPaymentInput): Promise<CardPaymentResult> {
    const { est, reference, total, platformFee, description, cardToken, installments, method,
      customerName, customerDocument, customerPhone } = input;
    if (method === "debit") {
      throw new PagbankError(422, "débito PagBank exige 3DS (não suportado no app)");
    }
    const customer = buildCustomer(reference, { name: customerName, document: customerDocument, phone: customerPhone });
    const charge = await createOrder(est, reference, total, platformFee, description, customer, {
      type: "CREDIT_CARD",
      installments: installments > 0 ? installments : 1,
      capture: true,
      soft_descriptor: "JURANDIR",
      card: {
        encrypted: cardToken,
        store: false,
        holder: { name: customer.name.slice(0, 30), tax_id: customer.tax_id },
      },
    });
    return cardResult(charge);
  },
  async createWalletPayment(input: WalletPaymentInput): Promise<CardPaymentResult> {
    const { est, reference, total, platformFee, description, walletType, token: raw } = input;
    const wallet =
      walletType === "apple_pay"
        ? { type: "APPLE_PAY", key: applePayKey(raw) }
        : { type: "GOOGLE_PAY", key: raw };
    const charge = await createOrder(est, reference, total, platformFee, description, buildCustomer(reference), {
      type: "CREDIT_CARD",
      installments: 1,
      capture: true,
      soft_descriptor: "JURANDIR",
      card: { wallet },
    });
    return cardResult(charge);
  },
  async getChargeStatus(_est: Establishment, chargeId: string): Promise<ChargeStatus> {
    await ensurePagbankMode();
    const c = await call<PbCharge>(`/charges/${chargeId}`);
    return mapStatus(c.status);
  },
};

// ---- Connect (OAuth): o bar autoriza a conta PagBank DELE ------------------
//
// A aplicação da plataforma é criada UMA vez (POST /oauth2/application) e dá o
// client_id/client_secret do .env. O bar é redirecionado pro PagBank, aprova, e
// volta no callback com um `code`; trocamos pelo `account_id` (ACCO_…) — é ele
// que entra como recebedor no split. Doc: /docs/connect-authorization.

const isSandbox = () => modeSuffix() === "TEST";
const connectBase = () =>
  isSandbox() ? "https://connect.sandbox.pagbank.com.br" : "https://connect.pagbank.com.br";
const clientId = () => envByMode("PAGBANK_CLIENT_ID");
const clientSecret = () => envByMode("PAGBANK_CLIENT_SECRET");
const redirectUri = () => envByMode("PAGBANK_REDIRECT_URI");
/** Permissões pedidas ao bar: ler pagamentos/divisões e dados da conta. */
const CONNECT_SCOPES = ["payments.read", "payments.split.read", "accounts.read"];

/** O `state` do PagBank só aceita alfanumérico (≤128): id do bar em hex +
 *  HMAC truncado (16 hex). Impede que alguém vincule conta em outro bar. */
function stateSig(estHex: string): string {
  return createHmac("sha256", process.env.AUTH_SECRET ?? "").update(`pagbank:${estHex}`).digest("hex").slice(0, 16);
}

export function signConnectState(estId: string): string {
  const estHex = Buffer.from(estId, "utf8").toString("hex");
  return `${estHex}${stateSig(estHex)}`;
}

export function verifyConnectState(state: string): string | null {
  if (!/^[0-9a-f]{18,128}$/.test(state)) return null;
  const estHex = state.slice(0, -16);
  if (state.slice(-16) !== stateSig(estHex)) return null;
  return Buffer.from(estHex, "hex").toString("utf8") || null;
}

/** URL pra onde o bar é mandado autorizar a conta dele. */
export function getConnectUrl(state: string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: clientId(),
    redirect_uri: redirectUri(),
    scope: CONNECT_SCOPES.join(" "),
    state,
  });
  return `${connectBase()}/oauth2/authorize?${p.toString()}`;
}

/** Troca o `code` do callback pelo `account_id` (ACCO_…) do bar. */
export async function exchangeConnectCode(code: string): Promise<{ accountId: string }> {
  await ensurePagbankMode();
  const r = await call<{ account_id?: string }>("/oauth2/token", {
    method: "POST",
    headers: { X_CLIENT_ID: clientId(), X_CLIENT_SECRET: clientSecret() },
    body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirectUri() }),
  });
  if (!r.account_id) throw new PagbankError(502, "connect sem account_id");
  return { accountId: r.account_id };
}

// Cacheada POR MODO: sandbox e produção têm chaves diferentes, então trocar o
// ambiente não pode reaproveitar a chave do outro.
const cardKeyCache = new Map<Mode, string>();

/** Chave PÚBLICA (RSA) de cartão da conta da plataforma — o app criptografa o
 *  cartão com ela. Busca a existente; se a conta ainda não tem (404), cria.
 *  Cacheada em memória por modo (a chave não expira; renovação mantém a antiga por 7 dias). */
export async function getCardPublicKey(): Promise<string> {
  await ensurePagbankMode();
  const mode = modeSuffix();
  const hit = cardKeyCache.get(mode);
  if (hit) return hit;
  let r: { public_key?: string };
  try {
    r = await call<{ public_key?: string }>("/public-keys/card");
  } catch (e) {
    if (!(e instanceof PagbankError) || e.status !== 404) throw e;
    r = await call<{ public_key?: string }>("/public-keys", {
      method: "POST",
      body: JSON.stringify({ type: "card" }),
    });
  }
  if (!r.public_key) throw new PagbankError(502, "sem public_key");
  cardKeyCache.set(mode, r.public_key);
  return r.public_key;
}

/** Ids das cobranças (CHAR_…) de um pedido notificado pelo webhook. */
export function chargeIdsOf(order: { charges?: { id?: string }[] }): string[] {
  return (order.charges ?? []).map((c) => c.id ?? "").filter((id) => id.startsWith("CHAR_"));
}
