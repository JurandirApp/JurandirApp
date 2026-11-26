import { getTunaCardsEnabled } from "@/lib/db/settings";
import {
  createTunaSession,
  ensureTunaMode,
  TunaError,
  tunaSafeMessage,
  tunaTokenUrl,
} from "@/lib/payments/tuna";
import { deriveTunaDeviceCustomer } from "@/lib/payments/tuna-cards";
import { tunaErrorSummary } from "@/lib/payments/tuna-webhook";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const HEADERS: Record<string, string> = { ...CORS, "Cache-Control": "no-store" };

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * POST /api/public/tuna/cards/session
 * Body: { deviceKey } — chave secreta do aparelho (base64url, 32–128 chars).
 * Abre uma sessão de tokenização (Token/NewSession) no customer da Tuna DO
 * APARELHO (derivado da chave por HMAC — `lib/payments/tuna-cards.ts`) e devolve
 * `{ sessionId, tokenUrl }`. Com ela o app lista (Token/List), apaga
 * (Token/Delete), vincula o CVV (Token/Bind) e salva cartão novo
 * (Token/Generate com `singleUse: false`) direto na Tuna; a cobrança vai em
 * `/api/public/orders/card` com `tuna.sessionId` = esta sessão + `tuna.deviceKey`.
 * Chave ausente/inválida → 422. Modo da Tuna (ou segredo) indisponível → 503.
 * Cartões da Tuna desligados → 403. Falha da Tuna → 502. Nada aqui é logado
 * além da mensagem curta do erro (nunca a chave, o customer ou a sessão).
 */
export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = ((await req.json()) as { deviceKey?: unknown } | null)?.deviceKey;
  } catch {
    raw = undefined;
  }

  let customer: ReturnType<typeof deriveTunaDeviceCustomer>;
  try {
    customer = deriveTunaDeviceCustomer(raw);
  } catch {
    console.error("[tuna/cards/session] segredo dos cartões salvos ausente");
    return Response.json({ error: "unavailable" }, { status: 503, headers: HEADERS });
  }
  if (!customer) {
    return Response.json({ error: "invalidDeviceKey" }, { status: 422, headers: HEADERS });
  }

  let mode: Awaited<ReturnType<typeof ensureTunaMode>>;
  try {
    if (!(await getTunaCardsEnabled())) {
      return Response.json({ error: "cardsDisabled" }, { status: 403, headers: HEADERS });
    }
    mode = await ensureTunaMode();
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers: HEADERS });
  }

  try {
    const tokenUrl = tunaTokenUrl();
    const sessionId = await createTunaSession(customer, mode);
    return Response.json({ sessionId, tokenUrl }, { headers: HEADERS });
  } catch (e) {
    const why = e instanceof TunaError ? tunaSafeMessage(e) : tunaErrorSummary(e);
    console.error("[tuna/cards/session] falha:", why);
    return Response.json({ error: "unavailable" }, { status: 502, headers: HEADERS });
  }
}
