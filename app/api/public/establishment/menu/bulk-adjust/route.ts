import { authEstablishment } from "@/lib/auth/bearer";
import { bulkAdjustPrices } from "@/lib/db/menu";
import { bulkPriceAdjustSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/** POST — ajuste de preço em massa. `dryRun:true` = preview (não grava).
 *  O establishmentId vem SEMPRE do token; ids de outro tenant são ignorados. */
export async function POST(req: Request): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid" }, { status: 400, headers: CORS });
  }

  const parsed = bulkPriceAdjustSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 422, headers: CORS });

  const res = await bulkAdjustPrices(s.establishmentId!, parsed.data);
  return Response.json({ changes: res.changes, applied: res.applied }, { headers: CORS });
}
