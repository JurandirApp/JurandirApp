// Tuna no NAVEGADOR (checkout do site): sessão (nossa rota) + tokenização do
// cartão direto na Tuna (Token/Generate, sem headers de auth — o CORS da Tuna
// aceita qualquer origem). O cartão cru nunca passa pelo nosso servidor.
// Nada daqui loga cartão, token ou sessão.

const SESSION_TIMEOUT_MS = 20_000;
const GENERATE_TIMEOUT_MS = 20_000;

export type TunaSessionResult =
  | { ok: true; sessionId: string; tokenUrl: string }
  /** `notChargeable`: o pedido não é (mais) cobrável no cartão Tuna — ex. já
   *  tem cobrança em andamento. `unavailable`: rede/servidor. */
  | { ok: false; reason: "notChargeable" | "unavailable" };

/** POST /api/public/tuna/session {orderId}. Só aceita `tokenUrl` HTTPS. */
export async function requestTunaSession(orderId: string, fetchFn: typeof fetch = fetch): Promise<TunaSessionResult> {
  let res: Response;
  try {
    res = await fetchFn("/api/public/tuna/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
      signal: AbortSignal.timeout(SESSION_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (res.status === 404 || res.status === 409 || res.status === 403) return { ok: false, reason: "notChargeable" };
  if (!res.ok) return { ok: false, reason: "unavailable" };
  try {
    const j = (await res.json()) as { sessionId?: unknown; tokenUrl?: unknown };
    const sessionId = typeof j.sessionId === "string" ? j.sessionId : "";
    const tokenUrl = typeof j.tokenUrl === "string" ? j.tokenUrl.replace(/\/$/, "") : "";
    if (!sessionId || !tokenUrl.startsWith("https://")) return { ok: false, reason: "unavailable" };
    return { ok: true, sessionId, tokenUrl };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export type TunaCardInput = {
  cardNumber: string; // só dígitos
  cardHolderName: string;
  expirationMonth: string; // "MM"
  expirationYear: string; // "AAAA"
  cvv: string;
};

export type TunaTokenResult =
  | { ok: true; token: string; brand?: string }
  /** `invalid`: a Tuna recusou os dados do cartão (code < 0 / 4xx).
   *  `unavailable`: rede/timeout/5xx. Em nenhum dos dois nada foi cobrado. */
  | { ok: false; reason: "invalid" | "unavailable" };

/** Token/Generate (uso único). Gerar token nunca cobra nada. */
export async function generateTunaCardToken(
  tokenUrl: string,
  sessionId: string,
  card: TunaCardInput,
  fetchFn: typeof fetch = fetch,
): Promise<TunaTokenResult> {
  let res: Response;
  try {
    res = await fetchFn(`${tokenUrl}/api/Token/Generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, card: { ...card, singleUse: true } }),
      signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (res.status >= 500) return { ok: false, reason: "unavailable" };
  type GenerateBody = { code?: unknown; token?: unknown; brand?: unknown };
  const j: GenerateBody | null = await res.json().then(
    (v: unknown) => (v && typeof v === "object" ? (v as GenerateBody) : null),
    () => null,
  );
  if (res.status >= 400) return { ok: false, reason: "invalid" };
  if (!j) return { ok: false, reason: "unavailable" };
  if (typeof j.code === "number" && j.code < 0) return { ok: false, reason: "invalid" };
  const token = typeof j.token === "string" ? j.token.trim() : "";
  if (!token) return { ok: false, reason: "invalid" };
  const brand = typeof j.brand === "string" && j.brand.trim() ? j.brand.trim() : undefined;
  return { ok: true, token, ...(brand ? { brand } : {}) };
}
