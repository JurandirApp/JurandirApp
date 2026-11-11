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
import {
  parseTunaTestSlugs,
  tunaReadiness,
  type TunaContext,
  type TunaEstFields,
} from "./tuna-readiness";

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

/** Atualiza o modo a partir do banco (cacheado). No-op em teste (sem DB).
 *  Falha ao ler o banco: segue com o último modo conhecido (cache vencido); sem
 *  nenhum, falha FECHADO com um TunaError 424 DEFINITIVO (nada foi enviado à
 *  Tuna) — nunca chuta TESTE: com a plataforma em PRODUÇÃO, isso mandaria
 *  cliente real pra conta de homologação. */
export async function ensureTunaMode(): Promise<Mode> {
  if (process.env.VITEST || process.env.NODE_ENV === "test") return modeSuffix();
  if (cachedMode && Date.now() - cachedModeAt < MODE_TTL_MS) return cachedMode;
  try {
    const { getTunaMode } = await import("@/lib/db/settings");
    cachedMode = (await getTunaMode()) as Mode;
  } catch {
    if (!cachedMode) throw tunaLocalError(424, "modo da Tuna indisponível");
  }
  cachedModeAt = Date.now();
  return cachedMode;
}

/** Invalida o cache do modo — chamar quando o admin troca teste⇄produção. Só
 *  vence o cache (a próxima `ensureTunaMode` relê o banco); o último modo fica
 *  em memória, pra uma chamada em andamento não virar TESTE no meio. */
export function bustTunaModeCache(): void {
  cachedModeAt = 0;
}

/** Só para testes: fixa o modo em memória sem tocar no banco (null = default). */
export function __setTunaModeForTests(mode: Mode | null): void {
  cachedMode = mode;
  cachedModeAt = mode ? Date.now() : 0;
}

/** Config por modo (hosts): TESTE lê `NOME_TEST` caindo pro `NOME`; PRODUÇÃO,
 *  `NOME`. NÃO usar pra credenciais — ver `credentialByMode`. Sem `mode`, o
 *  modo em memória. */
const envByMode = (name: string, mode: Mode = modeSuffix()): string =>
  mode === "TEST"
    ? (process.env[`${name}_TEST`] ?? process.env[name] ?? "")
    : (process.env[name] ?? "");

/** Credencial por modo, SEM fallback: TESTE lê só `NOME_TEST` (conta `-homolog`),
 *  PRODUÇÃO só `NOME`. A homologação da Tuna roda nos MESMOS hosts da produção
 *  — quem decide o ambiente é a conta. Se TESTE caísse na credencial de
 *  produção, "Teste" no admin faria cobranças e cadastros REAIS (e o cadastro
 *  ficaria gravado como TEST, com o webhook chegando como PRODUÇÃO). */
const credentialByMode = (name: string, mode: Mode = modeSuffix()): string =>
  ((mode === "TEST" ? process.env[`${name}_TEST`] : process.env[name]) ?? "").trim();

const hostFor = (api: "engine" | "token", mode: Mode = modeSuffix()): string => {
  const name = api === "engine" ? "TUNA_ENGINE_URL" : "TUNA_TOKEN_URL";
  const def = api === "engine" ? "https://engine.tunagateway.com" : "https://token.tunagateway.com";
  return (envByMode(name, mode) || def).replace(/\/$/, "");
};

/** Host da API de token no modo atual (o app/site manda o cartão direto pra
 *  `<host>/api/Token/Generate`). Chamar depois de `ensureTunaMode()`. */
export const tunaTokenUrl = (): string => hostFor("token");

/** Só a mensagem da Tuna no corpo (`message.message`, ou `message` quando vem
 *  string), até 160 caracteres; senão "". Nunca devolve o resto do corpo. */
function tunaBodyMessage(body: string): string {
  let msg: unknown;
  try {
    const m = (JSON.parse(body) as { message?: unknown } | null)?.message;
    msg = m && typeof m === "object" ? (m as { message?: unknown }).message : m;
  } catch {
    msg = undefined;
  }
  return typeof msg === "string" ? msg.trim().slice(0, 160) : "";
}

/** Erro da Tuna. `body` guarda a resposta crua (pra inspeção no código), mas a
 *  `message` — que vai parar em logs — só leva status, code e a mensagem curta
 *  da Tuna: nunca o corpo (pode ter CPF, sessão, token). */
export class TunaError extends Error {
  constructor(
    public status: number,
    public code: number | null,
    public body: string,
  ) {
    const safe = tunaBodyMessage(body);
    super(`Tuna ${status}${code !== null ? ` (code ${code})` : ""}${safe ? `: ${safe}` : ""}`);
    this.name = "TunaError";
  }
}

/** Erro levantado por nós (sem resposta da Tuna): corpo JSON `{message}`, pra
 *  `tunaSafeMessage` mostrar o texto. */
const tunaLocalError = (status: number, message: string): TunaError =>
  new TunaError(status, null, JSON.stringify({ message }));

/** Texto do erro que pode ir pro cliente/log: só a mensagem da Tuna
 *  (`message.message`, ou `message` quando vem string), até 160 caracteres;
 *  senão `tuna:<status>`. Nunca o corpo cru (pode ter CPF, sessão, token). */
export function tunaSafeMessage(e: TunaError): string {
  return tunaBodyMessage(e.body) || `tuna:${e.status}`;
}

/** POST na Tuna. `opts.mode` fixa o ambiente (credenciais + host) da chamada —
 *  as cobranças passam o modo da checagem de prontidão, pra um modo relido no
 *  meio (outra requisição) não trocar a conta. Sem ele, o modo em memória. */
export async function tunaPost<T>(
  api: "engine" | "token",
  path: string,
  body: unknown,
  opts: { idempotencyKey?: string; auth?: "app" | "none"; mode?: Mode } = {},
): Promise<T> {
  const mode = opts.mode ?? modeSuffix();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if ((opts.auth ?? "app") !== "none") {
    const account = credentialByMode("TUNA_ACCOUNT", mode);
    const appToken = credentialByMode("TUNA_APPTOKEN", mode);
    // Sem a credencial do modo nada é enviado (nada cobrado): falha DEFINITIVA (4xx).
    if (!account || !appToken) throw tunaLocalError(401, `credenciais da Tuna ausentes (${mode})`);
    headers["x-tuna-account"] = account;
    headers["x-tuna-apptoken"] = appToken;
  }
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  // Timeout/rede propagam como erro comum (cobrança INCERTA, não é 4xx).
  const res = await fetch(`${hostFor(api, mode)}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (res.status >= 400) throw new TunaError(res.status, null, text);
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    // 2xx ilegível: a Tuna pode ter processado → INCERTO (502). Corpo vazio no
    // erro: o SyntaxError do JSON.parse citaria um trecho da resposta.
    throw new TunaError(502, null, "");
  }
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

// ---- Prontidão do bar (mesma regra no painel, na cobrança e no reroute) -----

/** Contexto da prontidão da Tuna (`tunaReadiness`): o modo e a chave dos
 *  cartões DADOS + a allowlist de bares de teste (`TUNA_TEST_SLUGS`). Montado
 *  sempre aqui — painel (getEstablishmentTunaStatus), guarda da cobrança e
 *  reroute do admin usam a MESMA regra. */
export function tunaReadinessContext(mode: Mode, cardsEnabled: boolean): TunaContext {
  return { mode, cardsEnabled, testSlugs: parseTunaTestSlugs(process.env.TUNA_TEST_SLUGS) };
}

/** Chave global dos cartões (AppSetting). Falha ao ler → recusa DEFINITIVA
 *  (424): nada foi enviado à Tuna. */
async function readTunaCardsEnabled(): Promise<boolean> {
  try {
    const { getTunaCardsEnabled } = await import("@/lib/db/settings");
    return await getTunaCardsEnabled();
  } catch {
    throw tunaLocalError(424, "chave dos cartões da Tuna indisponível");
  }
}

/** Guarda da cobrança: o bar tem que estar PRONTO na Tuna pro grupo do método
 *  no modo EM VIGOR (o mesmo das credenciais da chamada) — Pix → `pixReady`;
 *  crédito, débito e carteiras → `cardReady` (inclui a chave dos cartões).
 *  Senão, recusa DEFINITIVA (422) antes de qualquer chamada à Tuna (nem
 *  NewSession): ex. modo virou e o cadastro do bar é do outro ambiente. Pix
 *  não lê a chave dos cartões. Devolve o modo. */
async function assertTunaReady(est: TunaEstFields, group: "pix" | "card"): Promise<Mode> {
  const mode = await ensureTunaMode();
  const cardsEnabled = group === "card" ? await readTunaCardsEnabled() : false;
  const r = tunaReadiness(est, tunaReadinessContext(mode, cardsEnabled));
  if (!(group === "pix" ? r.pixReady : r.cardReady)) {
    throw tunaLocalError(422, `bar não está pronto na Tuna (${group === "pix" ? "Pix" : "cartão"}, ${mode})`);
  }
  return mode;
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
  if (!merchantId) throw tunaLocalError(422, "bar sem cadastro na Tuna");
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
 *  sessão nunca cobra nada. Rede/timeout/5xx propagam como vieram.
 *  `mode` (cobrança): o da checagem de prontidão; sem ele, `ensureTunaMode()`. */
export async function createTunaSession(customer: { id: string; email: string }, mode?: Mode): Promise<string> {
  const m = mode ?? (await ensureTunaMode());
  const r = await tunaPost<unknown>(
    "token",
    "/api/Token/NewSession",
    { customer: { id: customer.id, email: customer.email }, ...(m === "TEST" ? { Is3dsTest: true } : {}) },
    { mode: m },
  ); // code < 0 → tunaPost já lança TunaError(422, code, …)
  const sessionId = str(pickCi(r, "sessionId"));
  if (!sessionId) throw tunaLocalError(422, "NewSession sem sessionId");
  return sessionId;
}

/** `existing`: o pedido JÁ tinha pagamento pago/pendente na Tuna — nenhum Init
 *  foi enviado e `method` vem vazio (sem QR nem desafio 3DS). */
type TunaInitResult = { paymentKey: string; status: string; method: unknown; existing?: true };

/** Pagamento que o pedido já tem na Tuna (Status por PartnerUniqueID), ou null
 *  se não há nenhum (-102 em todas as datas). As datas vão em paralelo (a
 *  consulta exige uma; na homolog qualquer data acha o pedido) e vence a
 *  primeira, na ordem de `tunaStatusDates`, que achar o pedido.
 *  Consulta que falha sem ser "não encontrado": 4xx propaga como veio; o resto
 *  (rede/timeout/5xx) vira 424 DEFINITIVO — nada foi cobrado por esta chamada,
 *  e sem saber se já existe pagamento não dá pra cobrar com segurança. */
async function findTunaPayment(reference: string, mode: Mode): Promise<{ paymentKey: string; status: string } | null> {
  const answers = await Promise.all(
    tunaStatusDates().map((paymentDate) =>
      tunaPost<unknown>("engine", "/api/Payment/Status", { PartnerUniqueID: reference, paymentDate }, { mode }).then(
        (r) => ({ r }),
        (e: unknown) => ({ e }),
      ),
    ),
  );
  for (const a of answers) {
    if ("r" in a) {
      const paymentKey = str(pickCi(a.r, "paymentKey"));
      // Achou mas sem paymentKey: não dá pra saber o estado → não cobra.
      if (!paymentKey) throw tunaLocalError(424, "consulta do pedido na Tuna sem paymentKey; nada cobrado");
      return { paymentKey, status: str(pickCi(a.r, "status")) };
    }
    if (a.e instanceof TunaError && a.e.code === -102) continue; // não existe nesta data
    if (a.e instanceof TunaError && a.e.status >= 400 && a.e.status < 500) throw a.e;
    throw tunaLocalError(424, "não foi possível consultar o pedido na Tuna; nada cobrado");
  }
  return null;
}

/** Payment/Init com um método. `partnerUniqueID` = código do pedido e
 *  `Idempotency-Key` = `init:<código>`.
 *  A idempotência da Tuna NÃO segura retentativa (homologação 2026-10-29): Init
 *  repetido num Pix pendente cria um 2º método e cobra de novo; num pagamento
 *  já capturado devolve -120. Por isso, ANTES do Init, consulta o pedido:
 *  pago/pendente → não envia Init e devolve o que existe (`existing`); recusado
 *  → envia (a Tuna acrescenta o novo método ao mesmo pagamento). Resta a janela
 *  de duas requisições simultâneas no mesmo pedido.
 *  `mode` = o da checagem de prontidão (credenciais da mesma conta checada). */
async function tunaInit(o: {
  reference: string;
  total: number;
  customer: TunaCustomer;
  item: ReturnType<typeof tunaSplitItem>;
  method: Record<string, unknown>;
  tokenSession?: string;
  mode: Mode;
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
  const prev = await findTunaPayment(o.reference, o.mode);
  if (prev && mapTunaStatus(prev.status) !== "failed") {
    return { paymentKey: prev.paymentKey, status: prev.status, method: undefined, existing: true };
  }
  let r: unknown;
  try {
    r = await tunaPost<unknown>("engine", "/api/Payment/Init", body, {
      idempotencyKey: `init:${o.reference}`,
      mode: o.mode,
    });
  } catch (e) {
    // -108 (partnerUniqueID já usado) e -120 (o que a homologação devolve no
    // Init repetido de um pagamento já capturado) = RETENTATIVA de um Init
    // anterior que pode ter cobrado. Não é recusa → vira INCERTO (5xx),
    // mantendo o code, pra quem chama reconciliar em vez de dar "recusado".
    if (e instanceof TunaError && (e.code === -108 || e.code === -120)) throw new TunaError(503, e.code, e.body);
    throw e;
  }
  const paymentKey = str(pickCi(r, "paymentKey"));
  // Aceito (code ≥ 0) mas sem paymentKey: não dá pra saber se cobrou → incerto (5xx).
  if (!paymentKey) throw tunaLocalError(502, "Init sem paymentKey");
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
    const mode = await assertTunaReady(est, "pix");
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
      mode,
      method: {
        paymentMethodType: "D",
        amount: total,
        pix: { name: customer.name, ...docOf(customer), expirationSeconds: PIX_EXPIRES_MIN * 60 },
      },
    });
    // Pix já existente: sem o QR não dá pra devolver a cobrança → incerto.
    if (r.existing) throw tunaLocalError(503, "pedido já tem Pix na Tuna; nada cobrado de novo");
    const pixInfo = pickCi(r.method, "pixInfo");
    return {
      chargeId: r.paymentKey,
      pixPayload: str(pickCi(pixInfo, "qrCopyPaste")) || str(pickCi(pixInfo, "qrContent")),
      pixQrImage: await qrImageBase64(pickCi(pixInfo, "qrImage")),
      status: mapTunaStatus(r.status),
    };
  },

  // Cartão tokenizado pelo app direto na Tuna (o cartão cru nunca chega aqui).
  // Crédito "1" (com 3DS "7"); débito "2" (com 3DS "8"), sempre 1 parcela. O
  // 3DS só vai quando o app/site manda `threeDs` válido — as contas da Tuna
  // (homolog e staging) não têm 3DS ligado, e o débito "2" sem 3DS foi
  // aprovado/recusado/estornado certo na homologação.
  async createCardTokenPayment(input: CardTokenPaymentInput): Promise<CardPaymentResult> {
    const { est, reference, total, platformFee, description, cardToken, installments, method,
      customerName, customerDocument, customerPhone, tuna } = input;
    const sessionId = str(tuna?.sessionId);
    const threeDs =
      tuna?.threeDs && str(tuna.threeDs.referenceId) && str(tuna.threeDs.transactionId) ? tuna.threeDs : undefined;
    if (!sessionId) throw tunaLocalError(422, "cartão Tuna exige a sessão de tokenização");
    const item = tunaSplitItem(est, total, platformFee, description);
    const mode = await assertTunaReady(est, "card");
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
      mode,
      tokenSession: sessionId,
      method: {
        paymentMethodType: method === "debit" ? (threeDs ? "8" : "2") : threeDs ? "7" : "1",
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
    const mode = await assertTunaReady(est, "card"); // antes do NewSession
    const customer = buildTunaCustomer(reference, {}, mode);
    const sessionId = await createTunaSession({ id: customer.id, email: customer.email }, mode);
    const apple = walletType === "apple_pay";
    const r = await tunaInit({
      reference,
      total,
      customer,
      item,
      mode,
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
  if (amount !== undefined && !(amount > 0)) throw tunaLocalError(422, "valor de estorno inválido");
  if (amount !== undefined && barMerchantId && !(typeof barAmount === "number" && Number.isFinite(barAmount))) {
    throw tunaLocalError(422, "estorno parcial com split exige a parte do bar");
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
