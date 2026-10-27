import { createHash, timingSafeEqual } from "crypto";
import { isDefiniteGatewayFailure } from "./gateway-errors";
import { pickCi, TunaError } from "./tuna";

// Webhooks da Tuna — parte PURA (sem banco/rede), testável.
// A Tuna NÃO assina as notificações: o único mecanismo é um segredo opcional
// (Bearer) configurado no Console. Homologação (TEST) e produção postam nas
// MESMAS URLs; o ambiente é identificado por qual segredo bateu.
// Nunca confiamos no corpo: o pagamento é sempre re-consultado na Tuna.

export type TunaWebhookEnv = "PRODUCTION" | "TEST" | "any" | "unauthorized";

/** Igualdade em tempo constante (compara os SHA-256, que têm o mesmo tamanho). */
function sameSecret(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/** Autentica a notificação pelo header `Authorization`.
 *  - Nenhum segredo configurado → `"any"` (aceita; o re-fetch protege).
 *  - `Bearer <x>` (ou só `<x>`) igual ao de produção → `"PRODUCTION"`; ao de
 *    teste → `"TEST"`; senão `"unauthorized"`. */
export function tunaWebhookAuth(
  authorization: string | null,
  secrets: { prod?: string; test?: string },
): TunaWebhookEnv {
  const prod = (secrets.prod ?? "").trim();
  const test = (secrets.test ?? "").trim();
  if (!prod && !test) return "any";
  const raw = (authorization ?? "").trim();
  const bearer = /^bearer\s+(.+)$/i.exec(raw);
  const token = (bearer ? bearer[1] : /^bearer$/i.test(raw) ? "" : raw).trim();
  if (!token) return "unauthorized";
  // Compara com os dois antes de decidir (o tempo não depende de qual bateu).
  const isProd = prod ? sameSecret(token, prod) : false;
  const isTest = test ? sameSecret(token, test) : false;
  if (isProd) return "PRODUCTION";
  if (isTest) return "TEST";
  return "unauthorized";
}

// Provedores de split da Tuna (uma notificação de merchant POR provedor).
const PIX_SERVICES = new Set([69, 71, 86, 88, 93, 101]);
const CARD_SERVICES = new Set([41, 63]);

/** Grupo do provedor de split: pelo `serviceId`; senão pelo `serviceName`
 *  (contém "pix" → pix; "cart"/"card" → card); senão `null`. */
export function tunaServiceGroup(serviceId: unknown, serviceName: unknown): "pix" | "card" | null {
  const id =
    typeof serviceId === "number"
      ? serviceId
      : typeof serviceId === "string" && /^\d+$/.test(serviceId.trim())
        ? Number(serviceId.trim())
        : NaN;
  if (PIX_SERVICES.has(id)) return "pix";
  if (CARD_SERVICES.has(id)) return "card";
  const name = typeof serviceName === "string" ? serviceName.toLowerCase() : "";
  if (name.includes("pix")) return "pix";
  if (name.includes("cart") || name.includes("card")) return "card";
  return null;
}

const REGISTER_STATUS: Record<string, string> = {
  SRVMerchantRegisterOk: "active",
  SRVMerchantRegisterRejected: "rejected",
  SRVMerchantRegisterBlocked: "blocked",
  SRVMerchantRegisterError: "error",
};

/** Próximo status do grupo (Pix ou cartão) dado o `message.code`. Basta UM
 *  provedor do grupo aprovar: recusa/bloqueio/erro de outro provedor não
 *  derruba um grupo já `active`. Código desconhecido → mantém. */
export function nextTunaStatus(current: string | null, messageCode: string): string | null {
  const next = REGISTER_STATUS[messageCode.trim()];
  if (!next) return current;
  if (next === "active") return "active";
  return current === "active" ? "active" : next;
}

/** Notificação de repasse (`SRVMerchantPaymentOk` / `SRVMerchantPaymenError` —
 *  o typo é do contrato): só log, não muda o cadastro. */
export function isTunaPayoutCode(messageCode: string): boolean {
  return messageCode.startsWith("SRVMerchantPaymen");
}

/** Escalar → string (trim); número vira texto; resto → "". */
const scalar = (v: unknown): string =>
  typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Campos usados do webhook de pagamento (chaves sem diferenciar maiúsculas).
 *  Corpo que não é objeto ou sem `paymentKey` → null. */
export function parseTunaPaymentNotification(
  body: unknown,
): { paymentKey: string; statusId: string; partnerUniqueId: string } | null {
  if (!isRecord(body)) return null;
  const paymentKey = scalar(pickCi(body, "paymentKey"));
  if (!paymentKey) return null;
  return {
    paymentKey,
    statusId: scalar(pickCi(body, "statusId")),
    partnerUniqueId: scalar(pickCi(body, "partnerUniqueId")),
  };
}

/** Campos usados do webhook de merchant. Corpo que não é objeto → null. */
export function parseTunaMerchantNotification(body: unknown): {
  externalId: string;
  messageCode: string;
  serviceId: unknown;
  serviceName: unknown;
  kycLevel: string | null;
} | null {
  if (!isRecord(body)) return null;
  const kyc = scalar(pickCi(body, "kycLevel"));
  return {
    externalId: scalar(pickCi(body, "externalId")),
    messageCode: scalar(pickCi(pickCi(body, "message"), "code")),
    serviceId: pickCi(body, "serviceId"),
    serviceName: pickCi(body, "serviceName"),
    kycLevel: kyc || null,
  };
}

/** Pedido (e pagamento) mínimos pra decidir a recuperação de cobrança incerta. */
export type TunaAttachOrder = {
  code: string;
  status: string;
  payment: { provider: string | null; gatewayChargeId: string | null } | null;
};

/** O pedido pode receber o paymentKey de uma cobrança incerta? Só Tuna, ainda
 *  aguardando pagamento e sem cobrança gravada. */
export function isTunaAttachCandidate<T extends TunaAttachOrder>(
  order: T | null | undefined,
): order is T & { payment: NonNullable<T["payment"]> } {
  return (
    !!order &&
    order.status === "AWAITING_PAYMENT" &&
    !!order.payment &&
    order.payment.provider === "TUNA" &&
    order.payment.gatewayChargeId === null
  );
}

/** Recuperação de cobrança incerta (Init sem resposta): só anexa o `paymentKey`
 *  ao pedido se a resposta do `Payment/Status` DA TUNA (nunca o corpo do
 *  webhook) apontar pro mesmo pedido (`partnerUniqueId` === código). */
export function shouldAttachTunaPayment(
  order: TunaAttachOrder | null | undefined,
  statusResponse: unknown,
  paymentKey: string,
): boolean {
  const key = paymentKey.trim();
  if (!key || !isTunaAttachCandidate(order)) return false;
  const partner = scalar(pickCi(statusResponse, "partnerUniqueId"));
  if (!partner || partner !== order.code) return false;
  const echoed = scalar(pickCi(statusResponse, "paymentKey"));
  return !echoed || echoed === key;
}

/** Resumo do erro pro log: nunca o corpo da Tuna nem argumentos completos. */
export function tunaErrorSummary(e: unknown): string {
  if (e instanceof TunaError) return `TunaError ${e.status}${e.code !== null ? `/${e.code}` : ""}`;
  if (e instanceof Error) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") return `${e.name} ${code}`; // ex.: Prisma P2002
    // JSON.parse da resposta pode citar um trecho do corpo na mensagem: só o nome.
    if (e instanceof SyntaxError) return e.name;
    return `${e.name}: ${e.message.slice(0, 120)}`;
  }
  return "erro";
}

/** Id vindo do corpo (paymentKey, partnerUniqueId, externalId) é controlado por
 *  quem posta: só aceita formato curto e seguro antes de usar/logar. */
const SAFE_ID = /^[A-Za-z0-9_#.-]{1,64}$/;
export function isSafeTunaId(id: string): boolean {
  return SAFE_ID.test(id);
}

/** Erro ao reconciliar vale re-tentativa (HTTP 500 pra Tuna)? Tudo que não é
 *  recusa definitiva do gateway — e 408/429 da Tuna, que são transitórios
 *  apesar de 4xx, e o 424 local de "modo da Tuna indisponível" (o banco não
 *  respondeu; nada foi consultado na Tuna — re-tentar resolve). */
export function tunaWebhookShouldRetry(e: unknown): boolean {
  if (e instanceof TunaError && (e.status === 408 || e.status === 424 || e.status === 429)) return true;
  return !isDefiniteGatewayFailure(e);
}
