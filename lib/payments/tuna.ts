import type { Establishment } from "@prisma/client";
import type { TunaMerchantForm } from "@/lib/validation";
import { PIX_EXPIRES_MIN, round2 } from "@/lib/domain/pricing";
import type {
  CardPaymentResult,
  CardTokenPaymentInput,
  ChargeStatus,
  FoundPayment,
  PaymentProvider,
  PixCharge,
  PixChargeInput,
  WalletPaymentInput,
} from "./types";

// Tuna Gateway (7º gateway). Núcleo: modo TEST/PRODUCTION, envs, HTTP, erros e
// mapeamento de status; depois as cobranças (Pix, cartão com 3DS, carteiras),
// status e estorno. Valores sempre em REAIS (double), nunca centavos.
// Segredos (app token) NUNCA vão pro cliente nem pro log; corpo da requisição
// também nunca é logado (token do cartão, sessão e CPF vão nele).
type Mode = "TEST" | "PRODUCTION";
let cachedMode: Mode | null = null;
let cachedModeAt = 0;
const MODE_TTL_MS = 30_000;
const TIMEOUT_MS = 20_000;

const modeSuffix = (): Mode => cachedMode ?? "TEST";

/** Atualiza o modo a partir do banco (cacheado). No-op em teste (sem DB). */
export async function ensureTunaMode(): Promise<Mode> {
  if (process.env.VITEST || process.env.NODE_ENV === "test") return modeSuffix();
  if (cachedMode && Date.now() - cachedModeAt < MODE_TTL_MS) return cachedMode;
  try {
    const { getTunaMode } = await import("@/lib/db/settings");
    cachedMode = (await getTunaMode()) as Mode;
  } catch {
    cachedMode = cachedMode ?? "TEST";
  }
  cachedModeAt = Date.now();
  return cachedMode;
}

/** Invalida o cache do modo — chamar quando o admin troca teste⇄produção. */
export function bustTunaModeCache(): void {
  cachedMode = null;
  cachedModeAt = 0;
}

/** Só para testes: fixa o modo em memória sem tocar no banco (null = default). */
export function __setTunaModeForTests(mode: Mode | null): void {
  cachedMode = mode;
  cachedModeAt = mode ? Date.now() : 0;
}

/** TESTE: `NOME_TEST` caindo pro `NOME`; PRODUÇÃO: `NOME`. */
const envByMode = (name: string): string =>
  modeSuffix() === "TEST"
    ? (process.env[`${name}_TEST`] ?? process.env[name] ?? "")
    : (process.env[name] ?? "");

const hostFor = (api: "engine" | "token"): string => {
  const name = api === "engine" ? "TUNA_ENGINE_URL" : "TUNA_TOKEN_URL";
  const def = api === "engine" ? "https://engine.tunagateway.com" : "https://token.tunagateway.com";
  return (envByMode(name) || def).replace(/\/$/, "");
};

export class TunaError extends Error {
  constructor(
    public status: number,
    public code: number | null,
    public body: string,
  ) {
    super(`Tuna ${status}${code !== null ? ` (code ${code})` : ""}: ${body}`);
    this.name = "TunaError";
  }
}

export async function tunaPost<T>(
  api: "engine" | "token",
  path: string,
  body: unknown,
  opts: { idempotencyKey?: string; auth?: "app" | "none" } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if ((opts.auth ?? "app") !== "none") {
    headers["x-tuna-account"] = envByMode("TUNA_ACCOUNT");
    headers["x-tuna-apptoken"] = envByMode("TUNA_APPTOKEN");
  }
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  // Timeout/rede propagam como erro comum (cobrança INCERTA, não é 4xx).
  const res = await fetch(`${hostFor(api)}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (res.status >= 400) throw new TunaError(res.status, null, text);
  const json = text ? JSON.parse(text) : {};
  const code = (json as { code?: unknown } | null)?.code;
  if (typeof code === "number" && code < 0) throw new TunaError(422, code, text);
  return json as T;
}

/** Status geral da Tuna → status interno. */
export function mapTunaStatus(status: string | null | undefined): ChargeStatus {
  if (status === "2" || status === "8") return "paid";
  if (["3", "4", "5", "6", "7", "9"].includes(status ?? "")) return "failed";
  return "pending";
}

/** Lê campo sem diferenciar maiúsculas (a Tuna varia o casing, ex.: pixInfo). */
export function pickCi(obj: unknown, ...keys: string[]): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const entries = Object.entries(obj as Record<string, unknown>);
  for (const k of keys) {
    const lk = k.toLowerCase();
    const hit = entries.find(([ek]) => ek.toLowerCase() === lk);
    if (hit) return hit[1];
  }
  return undefined;
}

// ---- Cobranças ---------------------------------------------------------------

/** Teto do PNG do QR baixado (evita puxar algo enorme por engano). */
const QR_MAX_BYTES = 512_000;

/** Base pública do app (callbackUrl do webhook de pagamento). */
const appBase = () => (process.env.APP_BASE_URL ?? "").replace(/\/$/, "");

/** `callbackUrl` por pagamento (sobrepõe o webhook da conta). Só HTTPS; em dev omite. */
function callbackUrl(): string | undefined {
  const base = appBase();
  return base.startsWith("https://") ? `${base}/api/webhooks/tuna` : undefined;
}

/** String (trim) ou "" — campos da Tuna podem vir null/ausentes. */
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

type DocumentType = "CPF" | "CNPJ";

export type TunaCustomer = {
  id: string;
  name: string;
  email: string;
  document?: string;
  documentType?: DocumentType;
};

const docOf = (c: TunaCustomer) =>
  c.document && c.documentType ? { document: c.document, documentType: c.documentType } : {};

/** Tipo do documento pelo tamanho (só dígitos): 11 = CPF, 14 = CNPJ; outro → inválido. */
const docType = (digits: string): DocumentType | null =>
  digits.length === 11 ? "CPF" : digits.length === 14 ? "CNPJ" : null;

/** Customer do Init. Nome com sobrenome e e-mail do pedido (padrão PagBank).
 *  Documento: o do pagador (CPF 11 / CNPJ 14 dígitos); senão, em TESTE,
 *  `TUNA_TEST_CPF`; em PRODUÇÃO fica de fora — nunca inventa documento. */
export function buildTunaCustomer(
  reference: string,
  opts: { name?: string; document?: string; phone?: string },
  mode: Mode,
): TunaCustomer {
  const payer = (opts.document ?? "").replace(/\D/g, "");
  const test = mode === "TEST" ? (process.env.TUNA_TEST_CPF ?? "").replace(/\D/g, "") : "";
  const document = docType(payer) ? payer : docType(test) ? test : "";
  const documentType = docType(document);
  const name = (opts.name ?? "").trim();
  return {
    id: reference,
    name: name.includes(" ") ? name : `${name || "Cliente"} Jurandir`,
    email: `pedido-${reference.toLowerCase()}@jurandir.app.br`,
    ...(documentType ? { document, documentType } : {}),
  };
}

/** Item único do pedido com o split do bar: o bar recebe total − comissão; o
 *  resto (comissão, menos as taxas da Tuna) fica na conta da plataforma.
 *  Sem cadastro do bar na Tuna → recusa (4xx, antes de qualquer chamada). */
export function tunaSplitItem(
  est: Pick<Establishment, "tunaMerchantExternalId">,
  total: number,
  platformFee: number,
  description: string,
) {
  const merchantId = est.tunaMerchantExternalId;
  if (!merchantId) throw new TunaError(422, null, "bar sem cadastro na Tuna");
  return {
    detailUniqueId: "1",
    productDescription: description,
    itemQuantity: 1,
    amount: total,
    split: { merchantId, amount: round2(total - platformFee) },
  };
}

/** Sessão de tokenização (Token/NewSession, com o app token — só no servidor).
 *  O app usa o `sessionId` pra tokenizar o cartão direto na Tuna. Em TESTE
 *  liga o 3DS de teste. O `sessionId` nunca é logado.
 *  Falha da sessão (code negativo / sem sessionId) é DEFINITIVA (422): criar
 *  sessão nunca cobra nada. Rede/timeout/5xx propagam como vieram. */
export async function createTunaSession(customer: { id: string; email: string }): Promise<string> {
  const mode = await ensureTunaMode();
  const r = await tunaPost<unknown>("token", "/api/Token/NewSession", {
    customer: { id: customer.id, email: customer.email },
    ...(mode === "TEST" ? { Is3dsTest: true } : {}),
  }); // code < 0 → tunaPost já lança TunaError(422, code, …)
  const sessionId = str(pickCi(r, "sessionId"));
  if (!sessionId) throw new TunaError(422, null, "NewSession sem sessionId");
  return sessionId;
}

type TunaInitResult = { paymentKey: string; status: string; method: unknown };

/** Payment/Init com um método. `partnerUniqueID` = código do pedido e
 *  `Idempotency-Key` = `init:<código>` (retentativa não cobra duas vezes). */
async function tunaInit(o: {
  reference: string;
  total: number;
  customer: TunaCustomer;
  item: ReturnType<typeof tunaSplitItem>;
  method: Record<string, unknown>;
  tokenSession?: string;
}): Promise<TunaInitResult> {
  const cb = callbackUrl();
  const body = {
    ...(o.tokenSession ? { tokenSession: o.tokenSession } : {}),
    partnerUniqueID: o.reference,
    customer: o.customer,
    paymentItems: { items: [o.item] },
    paymentData: {
      paymentMethods: [o.method],
      amount: o.total,
      countryCode: "BR",
      ...(cb ? { callbackUrl: cb } : {}),
    },
  };
  let r: unknown;
  try {
    r = await tunaPost<unknown>("engine", "/api/Payment/Init", body, {
      idempotencyKey: `init:${o.reference}`,
    });
  } catch (e) {
    // -108 = partnerUniqueID já usado: é uma RETENTATIVA de um Init anterior
    // (ex.: timeout) que pode ter cobrado. Não é recusa → vira INCERTO (5xx),
    // mantendo o code, pra quem chama reconciliar em vez de dar "recusado".
    if (e instanceof TunaError && e.code === -108) throw new TunaError(503, -108, e.body);
    throw e;
  }
  const paymentKey = str(pickCi(r, "paymentKey"));
  // Aceito (code ≥ 0) mas sem paymentKey: não dá pra saber se cobrou → incerto (5xx).
  if (!paymentKey) throw new TunaError(502, null, "Init sem paymentKey");
  const methods = pickCi(r, "methods");
  return {
    paymentKey,
    status: str(pickCi(r, "status")),
    method: Array.isArray(methods) ? methods[0] : undefined,
  };
}

/** QR do Pix em base64 puro (sem `data:`). Data URI → só o base64; URL HTTPS →
 *  baixa (sem os headers da Tuna) e converte; base64 cru → passa; senão "". */
async function qrImageBase64(raw: unknown): Promise<string> {
  const v = str(raw);
  if (!v) return "";
  const data = /^data:[^,]*;base64,([\s\S]+)$/i.exec(v);
  if (data) return data[1].replace(/\s/g, "");
  if (v.startsWith("https://")) {
    try {
      const res = await fetch(v, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return "";
      const type = (res.headers.get("content-type") ?? "").toLowerCase();
      if (type && !type.startsWith("image/")) return "";
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length || buf.length > QR_MAX_BYTES) return "";
      return buf.toString("base64");
    } catch {
      return "";
    }
  }
  const b64 = v.replace(/\s/g, "");
  return /^[A-Za-z0-9+/]+={0,2}$/.test(b64) ? b64 : "";
}

/** Apple Pay: a Tuna espera o `paymentData` (JSON em string). O plugin `pay`
 *  devolve o PKPaymentToken inteiro — extrai o paymentData; se já vier só ele,
 *  passa direto. */
function applePayToken(raw: string): string {
  try {
    const t = JSON.parse(raw) as Record<string, unknown>;
    const pd = t.paymentData ?? t.payment_data;
    return pd ? JSON.stringify(pd) : raw;
  } catch {
    return raw;
  }
}

/** Resultado de cartão/carteira. Desafio 3DS (`threeDSInfo`) só enquanto o
 *  pagamento está pendente — status final (pago/recusado) sempre vence. */
function cardResult(r: TunaInitResult): CardPaymentResult {
  const status = mapTunaStatus(r.status);
  const tds = pickCi(r.method, "threeDSInfo");
  const url = str(pickCi(tds, "url"));
  const token = str(pickCi(tds, "token"));
  if (status === "pending" && url && token) {
    const paRequest = str(pickCi(tds, "paRequest"));
    return { chargeId: r.paymentKey, status, challenge: { url, token, ...(paRequest ? { paRequest } : {}) } };
  }
  const msg = pickCi(r.method, "message");
  const detail = [str(pickCi(msg, "code")), str(pickCi(msg, "message"))].filter(Boolean).join(": ");
  return { chargeId: r.paymentKey, status, ...(detail ? { statusDetail: detail.slice(0, 160) } : {}) };
}

const dayFormat = (timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
const SP_DAY = dayFormat("America/Sao_Paulo");
const UTC_DAY = dayFormat("UTC");
const ymd = (fmt: Intl.DateTimeFormat, d: Date): string => {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
};

/** Datas (`YYYY-MM-DD`) pra consultar o pedido no Status — a consulta por
 *  pedido exige a data, e não sabemos em que fuso a Tuna grava: hoje e ontem em
 *  São Paulo e hoje em UTC, sem repetir. */
export function tunaStatusDates(now: Date = new Date()): string[] {
  const days = [
    ymd(SP_DAY, now),
    ymd(SP_DAY, new Date(now.getTime() - 86_400_000)),
    ymd(UTC_DAY, now),
  ];
  return [...new Set(days)];
}

export const tunaProvider: PaymentProvider = {
  name: "TUNA",
  async createPixCharge(input: PixChargeInput): Promise<PixCharge> {
    const { est, reference, total, platformFee, customerName, customerDocument, customerPhone, description } = input;
    const item = tunaSplitItem(est, total, platformFee, description);
    const mode = await ensureTunaMode();
    const customer = buildTunaCustomer(
      reference,
      { name: customerName, document: customerDocument, phone: customerPhone },
      mode,
    );
    const r = await tunaInit({
      reference,
      total,
      customer,
      item,
      method: {
        paymentMethodType: "D",
        amount: total,
        pix: { name: customer.name, ...docOf(customer), expirationSeconds: PIX_EXPIRES_MIN * 60 },
      },
    });
    const pixInfo = pickCi(r.method, "pixInfo");
    return {
      chargeId: r.paymentKey,
      pixPayload: str(pickCi(pixInfo, "qrCopyPaste")) || str(pickCi(pixInfo, "qrContent")),
      pixQrImage: await qrImageBase64(pickCi(pixInfo, "qrImage")),
      status: mapTunaStatus(r.status),
    };
  },

  // Cartão tokenizado pelo app direto na Tuna (o cartão cru nunca chega aqui).
  // Crédito "1" (com 3DS "7"); débito SEMPRE "8" e exige 3DS.
  async createCardTokenPayment(input: CardTokenPaymentInput): Promise<CardPaymentResult> {
    const { est, reference, total, platformFee, description, cardToken, installments, method,
      customerName, customerDocument, customerPhone, tuna } = input;
    const sessionId = str(tuna?.sessionId);
    const threeDs =
      tuna?.threeDs && str(tuna.threeDs.referenceId) && str(tuna.threeDs.transactionId) ? tuna.threeDs : undefined;
    if (method === "debit" && !threeDs) throw new TunaError(422, null, "débito Tuna exige autenticação 3DS");
    if (!sessionId) throw new TunaError(422, null, "cartão Tuna exige a sessão de tokenização");
    const item = tunaSplitItem(est, total, platformFee, description);
    const mode = await ensureTunaMode();
    const customer = buildTunaCustomer(
      reference,
      { name: customerName, document: customerDocument, phone: customerPhone },
      mode,
    );
    const brand = str(tuna?.brand);
    const r = await tunaInit({
      reference,
      total,
      customer,
      item,
      tokenSession: sessionId,
      method: {
        paymentMethodType: method === "debit" ? "8" : threeDs ? "7" : "1",
        amount: total,
        installments: method === "debit" ? 1 : Math.max(1, Math.trunc(installments) || 1),
        cardInfo: {
          token: cardToken,
          tokenProvider: "Tuna",
          ...(brand ? { brandName: brand } : {}),
          tokenSingleUse: 1,
          saveCard: false,
          ...(customer.document ? { billingInfo: docOf(customer) } : {}),
        },
        ...(threeDs
          ? {
              authenticationInformation: {
                code: sessionId,
                referenceId: threeDs.referenceId,
                transactionId: threeDs.transactionId,
              },
            }
          : {}),
      },
    });
    return cardResult(r);
  },

  // Carteira nativa: Init como crédito "1" com o token da carteira (a Tuna
  // decifra). Também exige uma sessão (NewSession) no Init.
  async createWalletPayment(input: WalletPaymentInput): Promise<CardPaymentResult> {
    const { est, reference, total, platformFee, description, walletType, token } = input;
    const item = tunaSplitItem(est, total, platformFee, description);
    const mode = await ensureTunaMode();
    const customer = buildTunaCustomer(reference, {}, mode);
    const sessionId = await createTunaSession({ id: customer.id, email: customer.email });
    const apple = walletType === "apple_pay";
    const r = await tunaInit({
      reference,
      total,
      customer,
      item,
      tokenSession: sessionId,
      method: {
        paymentMethodType: "1",
        amount: total,
        installments: 1,
        cardInfo: {
          tokenProvider: apple ? "ApplePay" : "GooglePay",
          token: apple ? applePayToken(token) : token,
          saveCard: false,
        },
      },
    });
    return cardResult(r);
  },

  async getChargeStatus(_est: Establishment, chargeId: string): Promise<ChargeStatus> {
    await ensureTunaMode();
    const r = await tunaPost<unknown>("engine", "/api/Payment/Status", { paymentKey: chargeId });
    return mapTunaStatus(str(pickCi(r, "status")));
  },

  // Reconciliação quando o Init não devolveu (timeout): consulta pelo código do
  // pedido em hoje/ontem (São Paulo) e hoje (UTC). Erro/"não encontrado" numa
  // data → tenta a próxima; nada pago → null.
  async findApprovedPayment(_est: Establishment, reference: string): Promise<FoundPayment | null> {
    try {
      await ensureTunaMode();
    } catch {
      return null;
    }
    for (const paymentDate of tunaStatusDates()) {
      let r: unknown;
      try {
        r = await tunaPost<unknown>("engine", "/api/Payment/Status", { PartnerUniqueID: reference, paymentDate });
      } catch {
        continue;
      }
      if (mapTunaStatus(str(pickCi(r, "status"))) !== "paid") continue;
      const paymentKey = str(pickCi(r, "paymentKey"));
      // Sem o paymentKey não dá pra gravar a cobrança (nunca grava id vazio).
      return paymentKey ? { paymentId: paymentKey, status: "paid" } : null;
    }
    return null;
  },
};

/** Estorno (Payment/Cancel). Total: só o `paymentKey`. Parcial: `cardsDetail`
 *  do método 0; com split, a parte do bar vai em `Splits` (exigido pela Tuna). */
export async function refundTunaPayment(
  paymentKey: string,
  opts: { amount?: number; barMerchantId?: string; barAmount?: number } = {},
): Promise<{ status: string }> {
  const { amount, barMerchantId, barAmount } = opts;
  if (amount !== undefined && !(amount > 0)) throw new TunaError(422, null, "valor de estorno inválido");
  if (amount !== undefined && barMerchantId && !(typeof barAmount === "number" && Number.isFinite(barAmount))) {
    throw new TunaError(422, null, "estorno parcial com split exige a parte do bar");
  }
  await ensureTunaMode();
  const body =
    amount === undefined
      ? { paymentKey }
      : {
          paymentKey,
          cardsDetail: [
            {
              amount: round2(amount),
              methodId: 0,
              ...(barMerchantId
                ? { Splits: [{ MerchantID: barMerchantId, Amount: round2(barAmount as number) }] }
                : {}),
            },
          ],
        };
  const r = await tunaPost<unknown>("engine", "/api/Payment/Cancel", body, {
    idempotencyKey: `cancel:${paymentKey}:${amount === undefined ? "total" : round2(amount)}`,
  });
  return { status: str(pickCi(r, "status")) };
}

// ---- Cadastro do bar (sub-merchant) -------------------------------------------

/** Cadastra o bar na Tuna (Merchant/Register). Assíncrono (até 48h): o resultado
 *  final chega no webhook de merchant. Erro de validação (code < 0) → TunaError. */
export async function registerTunaMerchant(
  form: TunaMerchantForm,
  opts: { externalId: string; condition: string; mcc: string },
): Promise<{ merchantId: string }> {
  await ensureTunaMode();
  const { externalId } = opts;
  const body = {
    externalId,
    document: form.document,
    documentType: form.documentType,
    name: form.name,
    fantasyName: form.fantasyName,
    countryId: 1,
    mccCode: opts.mcc,
    condition: opts.condition,
    stateFiscalDocument: form.stateFiscalDocument,
    acceptedContract: true,
    pixKeyType: form.pixKeyType,
    pixKey: form.pixKey,
    contact: {
      name: form.contact.name,
      email: form.contact.email,
      phone: form.contact.phone,
      cellPhone: form.contact.phone,
    },
    legalRepresentative: form.legalRepresentative,
    bankAccounts: [
      {
        externalId: `${externalId}_b1`,
        document: form.document,
        documentType: form.documentType,
        accountType: form.bank.accountType,
        bankCode: form.bank.bankCode,
        agency: form.bank.agency,
        number: form.bank.account,
      },
    ],
    address: { ...form.address, phone: form.contact.phone },
    ...(form.documentType === "CPF"
      ? { birthday: form.birthday, motherName: form.motherName, occupation: form.occupation }
      : {}),
  };
  const r = await tunaPost<unknown>("engine", "/api/Merchant/Register", body);
  const id = pickCi(r, "merchantId");
  return { merchantId: typeof id === "number" ? String(id) : str(id) };
}
