import { authAdmin } from "@/lib/auth/bearer";
import { getAppSettings, setPagbankMode, setPagarmeMode } from "@/lib/db/settings";
import { bustPagbankModeCache } from "@/lib/payments/pagbank";
import { bustPagarmeModeCache } from "@/lib/payments/pagarme";
import { revalidatePath } from "next/cache";
import type { PaymentEnv } from "@prisma/client";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

// Qualquer coisa que não seja "PRODUCTION" vira "TEST" (igual ao safeEnv do action).
const safeEnv = (mode: unknown): PaymentEnv => (mode === "PRODUCTION" ? "PRODUCTION" : "TEST");

/**
 * GET /api/public/admin/payment-mode (ADMIN, Bearer): ambiente em vigor de cada
 * gateway. Resposta: { pagbankMode, pagarmeMode } (cada um "TEST" | "PRODUCTION").
 */
export async function GET(req: Request): Promise<Response> {
  const s = await authAdmin(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  const settings = await getAppSettings();
  return Response.json(
    { pagbankMode: settings.pagbankMode, pagarmeMode: settings.pagarmeMode },
    { headers: CORS },
  );
}

/**
 * POST /api/public/admin/payment-mode (ADMIN, Bearer): troca o ambiente de UM
 * gateway. Body { gateway: "pagbank"|"pagarme", mode: "TEST"|"PRODUCTION" }.
 * Espelha set(Pagbank|Pagarme)ModeAction (persiste + invalida o cache do provider).
 * Resposta: { ok: true, mode }.
 */
export async function POST(req: Request): Promise<Response> {
  const s = await authAdmin(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });

  const body = (await req.json().catch(() => ({}))) as { gateway?: string; mode?: string };
  const mode = safeEnv(body.mode);
  if (body.gateway === "pagbank") {
    await setPagbankMode(mode);
    bustPagbankModeCache(); // o provider relê o modo na próxima cobrança
  } else if (body.gateway === "pagarme") {
    await setPagarmeMode(mode);
    bustPagarmeModeCache();
  } else {
    return Response.json({ error: "bad-gateway" }, { status: 400, headers: CORS });
  }
  revalidatePath("/admin");
  return Response.json({ ok: true, mode }, { headers: CORS });
}
