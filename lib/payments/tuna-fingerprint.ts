import type { PaymentClientInfo } from "./types";

// Device Fingerprint do CyberSource (antifraude Decision Manager da Tuna).
// O app/site carrega o `tags.js` do ThreatMetrix com
// `session_id=<merchantId><deviceSessionId>` e manda SÓ o `deviceSessionId`
// (sem o prefixo do merchant) junto da cobrança; aqui o servidor monta o
// `frontData` do Payment/Init. Tudo opcional: dado inválido é descartado em
// silêncio — fingerprint NUNCA derruba uma cobrança. Nada daqui é logado (id da
// sessão do device, IP e user agent identificam o cliente).

type Mode = "TEST" | "PRODUCTION";

/** org_id padrão do CyberSource por ambiente (guia do Device Fingerprint). */
export const TUNA_CYBS_DEFAULT_ORG_ID: Record<Mode, string> = {
  TEST: "1snn5n9w",
  PRODUCTION: "k8vif92e",
};

export type TunaFingerprintConfig =
  | { enabled: false }
  | { enabled: true; orgId: string; merchantId: string };

/** Config do fingerprint no modo da Tuna. Merchant id ESTRITAMENTE por modo,
 *  sem fallback (mesma filosofia do `credentialByMode`): TESTE lê só
 *  `TUNA_CYBS_MERCHANT_ID_TEST`, PRODUÇÃO só `TUNA_CYBS_MERCHANT_ID`. Sem merchant
 *  id → desligado. org_id pode ser sobrescrito por `TUNA_CYBS_ORG_ID(_TEST)`. */
export function tunaFingerprintConfig(
  mode: Mode,
  env: Record<string, string | undefined> = process.env,
): TunaFingerprintConfig {
  const suffix = mode === "TEST" ? "_TEST" : "";
  const merchantId = (env[`TUNA_CYBS_MERCHANT_ID${suffix}`] ?? "").trim();
  if (!merchantId) return { enabled: false };
  const orgId = (env[`TUNA_CYBS_ORG_ID${suffix}`] ?? "").trim() || TUNA_CYBS_DEFAULT_ORG_ID[mode];
  return { enabled: true, orgId, merchantId };
}

const DEVICE_SESSION_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** Id da sessão do device válido (o app gera 32 hex minúsculos; aceitamos
 *  `[A-Za-z0-9_-]{16,64}`). Qualquer outra coisa → undefined (ignorado). */
export function sanitizeDeviceSessionId(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return DEVICE_SESSION_RE.test(s) ? s : undefined;
}

const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** IPv4 ou IPv6 com cara de válido (sem porta/zona). Sem `node:net` pra ficar
 *  puro (roda em qualquer runtime). */
export function isLikelyIp(v: string): boolean {
  if (IPV4_RE.test(v)) return true;
  if (!v.includes(":") || v.length > 45 || !/^[0-9A-Fa-f:.]+$/.test(v)) return false;
  try {
    new URL(`http://[${v}]/`);
    return true;
  } catch {
    return false;
  }
}

/** IP do cliente: 1ª entrada do `x-forwarded-for` (o proxy da Vercel põe o IP
 *  real primeiro), senão `x-real-ip`. Só devolve se parecer um IP. */
export function clientIpFromHeaders(h: Headers): string | undefined {
  const xff = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
  const ip = xff || (h.get("x-real-ip") ?? "").trim();
  return ip && isLikelyIp(ip) ? ip : undefined;
}

const UA_MAX = 512;

/** User agent do cliente (aparado, no máx. 512 caracteres). */
export function clientUserAgentFromHeaders(h: Headers): string | undefined {
  const ua = (h.get("user-agent") ?? "").trim().slice(0, UA_MAX).trim();
  return ua || undefined;
}

/** IP + user agent + origem a partir dos headers da requisição. */
export function clientInfoFromHeaders(h: Headers, origin: "WEBSITE" | "MOBILE"): PaymentClientInfo {
  const ip = clientIpFromHeaders(h);
  const userAgent = clientUserAgentFromHeaders(h);
  return { origin, ...(ip ? { ip } : {}), ...(userAgent ? { userAgent } : {}) };
}

/** `frontData` do Payment/Init (camelCase exato, conferido no staging da Tuna). */
export type TunaFrontData = {
  sessionId?: string;
  origin?: "WEBSITE" | "MOBILE";
  ipAddress?: string;
  userAgent?: string;
  cookiesAccepted: true;
};

/** Monta o `frontData`; revalida tudo (id da sessão, IP, UA) e devolve
 *  undefined quando não sobra nada útil (sem sessão, IP nem UA) — aí o Init vai
 *  sem `frontData`. */
export function buildTunaFrontData(o: {
  deviceSessionId?: unknown;
  client?: PaymentClientInfo;
}): TunaFrontData | undefined {
  const sessionId = sanitizeDeviceSessionId(o.deviceSessionId);
  const ip = typeof o.client?.ip === "string" ? o.client.ip.trim() : "";
  const ipAddress = ip && isLikelyIp(ip) ? ip : undefined;
  const ua = typeof o.client?.userAgent === "string" ? o.client.userAgent.trim().slice(0, UA_MAX).trim() : "";
  const userAgent = ua || undefined;
  if (!sessionId && !ipAddress && !userAgent) return undefined;
  const origin = o.client?.origin === "WEBSITE" || o.client?.origin === "MOBILE" ? o.client.origin : undefined;
  return {
    ...(sessionId ? { sessionId } : {}),
    ...(origin ? { origin } : {}),
    ...(ipAddress ? { ipAddress } : {}),
    ...(userAgent ? { userAgent } : {}),
    cookiesAccepted: true,
  };
}
