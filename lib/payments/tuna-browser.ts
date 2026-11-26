// Tuna no NAVEGADOR (checkout do site): sessão (nossa rota) + tokenização do
// cartão direto na Tuna (Token/Generate, sem headers de auth — o CORS da Tuna
// aceita qualquer origem). O cartão cru nunca passa pelo nosso servidor.
// Nada daqui loga cartão, token ou sessão.
import {
  isCardinalOrigin,
  isDdcProfileCompleted,
  parseTunaAuthInfo,
  type TunaAuthInfo,
  type TunaBrowserInfo,
} from "./tuna-3ds";

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
  /** `auth`: dados do 3DS (só quando foi pedido com `authCode` e a Tuna devolveu). */
  | { ok: true; token: string; brand?: string; auth?: TunaAuthInfo }
  /** `invalid`: a Tuna recusou os dados do cartão (code < 0 / 4xx).
   *  `unavailable`: rede/timeout/5xx. Em nenhum dos dois nada foi cobrado. */
  | { ok: false; reason: "invalid" | "unavailable" };

/** Token/Generate (uso único). Gerar token nunca cobra nada.
 *  `authCode` (débito 3DS): vai em `authenticationInformation.code` e a Tuna
 *  devolve os dados do device data collection (`auth`). O MESMO código vai
 *  depois na cobrança. */
export async function generateTunaCardToken(
  tokenUrl: string,
  sessionId: string,
  card: TunaCardInput,
  fetchFn: typeof fetch = fetch,
  opts: { authCode?: string } = {},
): Promise<TunaTokenResult> {
  let res: Response;
  try {
    res = await fetchFn(`${tokenUrl}/api/Token/Generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        card: { ...card, singleUse: true },
        ...(opts.authCode ? { authenticationInformation: { code: opts.authCode } } : {}),
      }),
      signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (res.status >= 500) return { ok: false, reason: "unavailable" };
  type GenerateBody = { code?: unknown; token?: unknown; brand?: unknown; authenticationInformation?: unknown };
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
  const auth = opts.authCode ? parseTunaAuthInfo(j.authenticationInformation) : undefined;
  return { ok: true, token, ...(brand ? { brand } : {}), ...(auth ? { auth } : {}) };
}

/** Dados do navegador pro 3DS (`tuna.browser`). `timeDifference` =
 *  `getTimezoneOffset()` (padrão EMV 3DS: 180 em UTC-3). Nunca lança. */
export function collectTunaBrowserInfo(): TunaBrowserInfo {
  const out: TunaBrowserInfo = { javaScriptEnabled: true };
  try {
    const lang = navigator.language;
    if (lang) out.acceptLanguage = lang.slice(0, 100);
    out.javaEnabled = false;
    if (Number.isInteger(screen.colorDepth)) out.colorDepth = screen.colorDepth;
    if (Number.isInteger(screen.height)) out.screenHeight = screen.height;
    if (Number.isInteger(screen.width)) out.screenWidth = screen.width;
    out.timeDifference = new Date().getTimezoneOffset();
  } catch {
    /* navegador sem esses dados: vai o que deu */
  }
  return out;
}

/** Teto do device data collection (best-effort: o desafio funciona sem ele). */
export const DDC_TIMEOUT_MS = 12_000;

/** Device data collection da Cardinal: iframe oculto com form POST (`JWT` =
 *  accessToken) pra `deviceDataCollectionUrl`; espera o `profile.completed`
 *  (postMessage de *.cardinalcommerce.com) até `timeoutMs`. Sempre resolve —
 *  `true` se completou, `false` no timeout/erro — e limpa o iframe. */
export function runTunaDeviceDataCollection(auth: TunaAuthInfo, timeoutMs = DDC_TIMEOUT_MS): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let done = false;
    let iframe: HTMLIFrameElement | null = null;
    let form: HTMLFormElement | null = null;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      // Dá um respiro pro iframe terminar de postar antes de remover.
      window.setTimeout(() => {
        iframe?.remove();
        form?.remove();
      }, 500);
      resolve(ok);
    };
    const onMessage = (e: MessageEvent) => {
      if (isCardinalOrigin(e.origin) && isDdcProfileCompleted(e.data)) finish(true);
    };
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    try {
      window.addEventListener("message", onMessage);
      const name = `tuna-ddc-${Date.now()}`;
      iframe = document.createElement("iframe");
      iframe.name = name;
      iframe.title = "3DS";
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.cssText = "position:absolute;width:1px;height:1px;border:0;left:-9999px;top:-9999px;";
      document.body.appendChild(iframe);
      form = document.createElement("form");
      form.method = "POST";
      form.action = auth.deviceDataCollectionUrl;
      form.target = name;
      form.style.display = "none";
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "JWT";
      input.value = auth.accessToken;
      form.appendChild(input);
      document.body.appendChild(form);
      form.submit();
    } catch {
      finish(false);
    }
  });
}
