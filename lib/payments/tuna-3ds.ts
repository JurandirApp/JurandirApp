// 3DS da Tuna (débito "8" / crédito "7"): funções PURAS usadas no servidor
// (validação do que o app/site manda) e no navegador (código de autenticação,
// mensagem do device data collection, tamanho do desafio). Sem import de
// servidor nem de DOM. Nada daqui loga — código, referenceId, transactionId,
// JWTs e dados do navegador identificam a transação/cliente.
//
// Fluxo (doc https://dev.tuna.uy/api/3ds-integration, validado em produção):
// 1. Token/Generate (ou Token/Bind, cartão salvo) com
//    `authenticationInformation: { code }` → devolve `accessToken`,
//    `deviceDataCollectionUrl`, `referenceId`, `transactionId`.
// 2. Device data collection (iframe oculto, best-effort).
// 3. Payment/Init com `authenticationInformation: { code, referenceId,
//    transactionId }` — o MESMO `code` do passo 1 (≤ 50 caracteres; a sessão
//    da Tuna tem 112, por isso NÃO serve de código).
// 4. Desafio do banco (iframe) quando o Init volta pendente com `threeDSInfo`.

/** Código de autenticação gerado pelo cliente: `[A-Za-z0-9_-]{8,50}`. */
export const TUNA_3DS_CODE_RE = /^[A-Za-z0-9_-]{8,50}$/;
/** Teto do código na Tuna. */
export const TUNA_3DS_CODE_MAX = 50;
const ID_MAX = 128;

/** Código válido (aparado) ou undefined. */
export function sanitizeTuna3dsCode(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return TUNA_3DS_CODE_RE.test(s) ? s : undefined;
}

export type TunaThreeDs = { code?: string; referenceId: string; transactionId: string };

const idStr = (v: unknown): string => {
  if (typeof v !== "string") return "";
  const s = v.trim();
  return s.length <= ID_MAX ? s : "";
};

/** `threeDs` da requisição: exige `referenceId` E `transactionId` (strings
 *  não-vazias, ≤ 128); `code` só se válido (senão some — o provider decide o
 *  fallback). Qualquer outra coisa → undefined. */
export function parseTunaThreeDs(raw: unknown): TunaThreeDs | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const d = raw as Record<string, unknown>;
  const referenceId = idStr(d.referenceId);
  const transactionId = idStr(d.transactionId);
  if (!referenceId || !transactionId) return undefined;
  const code = sanitizeTuna3dsCode(d.code);
  return { ...(code ? { code } : {}), referenceId, transactionId };
}

/** `authenticationInformation` do método no Payment/Init, ou undefined (sem
 *  3DS). Usa `threeDs.code`; sem código válido, compat com o app antigo (que
 *  mandava a sessão como código) SÓ se a sessão couber em 50 caracteres —
 *  nunca manda código > 50 (a Tuna rejeita). */
export function tunaAuthenticationInformation(
  threeDs: unknown,
  sessionId: string,
): { code: string; referenceId: string; transactionId: string } | undefined {
  const t = parseTunaThreeDs(threeDs);
  if (!t) return undefined;
  const legacy = sessionId.trim();
  const code = t.code ?? (legacy && legacy.length <= TUNA_3DS_CODE_MAX ? legacy : undefined);
  if (!code) return undefined;
  return { code, referenceId: t.referenceId, transactionId: t.transactionId };
}

/** Dados do navegador pro 3DS/antifraude (`frontData` do Init), já validados. */
export type TunaBrowserInfo = {
  acceptLanguage?: string;
  colorDepth?: number;
  screenHeight?: number;
  screenWidth?: number;
  timeDifference?: number;
  javaEnabled?: boolean;
  javaScriptEnabled?: boolean;
};

const LANG_RE = /^[A-Za-z0-9,;=.* -]{1,100}$/;
const intIn = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : undefined;
const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);

/** Valida tipos/faixas de `tuna.browser`; campo inválido some. Nada útil →
 *  undefined. Nunca derruba a cobrança. */
export function sanitizeTunaBrowserInfo(raw: unknown): TunaBrowserInfo | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const b = raw as Record<string, unknown>;
  const lang = typeof b.acceptLanguage === "string" ? b.acceptLanguage.trim() : "";
  const out: TunaBrowserInfo = {};
  if (LANG_RE.test(lang)) out.acceptLanguage = lang;
  const colorDepth = intIn(b.colorDepth, 1, 64);
  if (colorDepth !== undefined) out.colorDepth = colorDepth;
  const screenHeight = intIn(b.screenHeight, 1, 20_000);
  if (screenHeight !== undefined) out.screenHeight = screenHeight;
  const screenWidth = intIn(b.screenWidth, 1, 20_000);
  if (screenWidth !== undefined) out.screenWidth = screenWidth;
  const timeDifference = intIn(b.timeDifference, -900, 900);
  if (timeDifference !== undefined) out.timeDifference = timeDifference;
  const javaEnabled = bool(b.javaEnabled);
  if (javaEnabled !== undefined) out.javaEnabled = javaEnabled;
  const javaScriptEnabled = bool(b.javaScriptEnabled);
  if (javaScriptEnabled !== undefined) out.javaScriptEnabled = javaScriptEnabled;
  return Object.keys(out).length ? out : undefined;
}

// ---------------------------------------------------------------------------
// Navegador (site)

/** Código de autenticação novo: `j3ds_` + 24 hex (29 caracteres). */
export function generateTuna3dsCode(
  random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b),
): string {
  const bytes = random(new Uint8Array(12));
  return `j3ds_${Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export type TunaAuthInfo = {
  accessToken: string;
  deviceDataCollectionUrl: string;
  referenceId: string;
  transactionId: string;
};

/** `authenticationInformation` da resposta do Generate/Bind. Exige os 4
 *  campos (strings) e URL HTTPS; senão undefined (segue sem 3DS). */
export function parseTunaAuthInfo(raw: unknown): TunaAuthInfo | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const a = raw as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const accessToken = s(a.accessToken);
  const deviceDataCollectionUrl = s(a.deviceDataCollectionUrl);
  const referenceId = s(a.referenceId);
  const transactionId = s(a.transactionId);
  if (!accessToken || !referenceId || !transactionId || !deviceDataCollectionUrl.startsWith("https://")) {
    return undefined;
  }
  return { accessToken, deviceDataCollectionUrl, referenceId, transactionId };
}

/** Origem da Cardinal (`https://*.cardinalcommerce.com`)? */
export function isCardinalOrigin(origin: unknown): boolean {
  if (typeof origin !== "string") return false;
  try {
    const u = new URL(origin);
    return (
      u.protocol === "https:" &&
      (u.hostname === "cardinalcommerce.com" || u.hostname.endsWith(".cardinalcommerce.com"))
    );
  } catch {
    return false;
  }
}

/** Mensagem do device data collection = "profile.completed"? Aceita string
 *  JSON ou objeto (`MessageType`, sem diferenciar maiúsculas na chave). */
export function isDdcProfileCompleted(data: unknown): boolean {
  let obj: unknown = data;
  if (typeof data === "string") {
    try {
      obj = JSON.parse(data);
    } catch {
      return false;
    }
  }
  if (!obj || typeof obj !== "object") return false;
  const entry = Object.entries(obj as Record<string, unknown>).find(([k]) => k.toLowerCase() === "messagetype");
  return entry?.[1] === "profile.completed";
}

/** Tamanho do iframe do desafio (`challengeWindowSize` do `paRequest` em
 *  base64): 01=250×400, 02=390×400, 03=500×600, 04=600×400, 05=tela toda.
 *  Ausente/ilegível → 02 (cabe no celular). */
export type ChallengeSize = { width: number | "100%"; height: number | "100%" };

const CHALLENGE_SIZES: Record<string, ChallengeSize> = {
  "01": { width: 250, height: 400 },
  "02": { width: 390, height: 400 },
  "03": { width: 500, height: 600 },
  "04": { width: 600, height: 400 },
  "05": { width: "100%", height: "100%" },
};
const DEFAULT_CHALLENGE_SIZE = CHALLENGE_SIZES["02"];

function decodeBase64(s: string): string | undefined {
  try {
    const norm = s.trim().replace(/-/g, "+").replace(/_/g, "/");
    const padded = norm + "=".repeat((4 - (norm.length % 4)) % 4);
    return atob(padded);
  } catch {
    return undefined;
  }
}

export function challengeSizeFromPaRequest(paRequest: unknown): ChallengeSize {
  if (typeof paRequest !== "string" || !paRequest.trim()) return DEFAULT_CHALLENGE_SIZE;
  const json = decodeBase64(paRequest);
  if (!json) return DEFAULT_CHALLENGE_SIZE;
  try {
    const o = JSON.parse(json) as unknown;
    if (!o || typeof o !== "object") return DEFAULT_CHALLENGE_SIZE;
    const entry = Object.entries(o as Record<string, unknown>).find(
      ([k]) => k.toLowerCase() === "challengewindowsize",
    );
    const v = entry?.[1];
    const key = typeof v === "number" ? String(v).padStart(2, "0") : typeof v === "string" ? v.trim() : "";
    return CHALLENGE_SIZES[key] ?? DEFAULT_CHALLENGE_SIZE;
  } catch {
    return DEFAULT_CHALLENGE_SIZE;
  }
}
