import { createHelpRequest } from "@/lib/db/help";
import { helpCallSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/** POST — cliente chama o garçom até a mesa (fallback de pagamento). Anônima. */
export async function POST(req: Request): Promise<Response> {
  const parsed = helpCallSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "invalid" }, { status: 422, headers: CORS });
  const { establishmentId, locationLabel, clientId, orderId, reason } = parsed.data;
  const r = await createHelpRequest({ establishmentId, locationLabel, clientId, orderId, reason });
  // TODO(Fase 2 / Plano 5): push aos garçons (notifyWaitersHelp) aqui, best-effort.
  return Response.json({ ok: true, reused: r.reused }, { headers: CORS });
}
