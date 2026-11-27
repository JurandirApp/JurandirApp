import { authEstablishment } from "@/lib/auth/bearer";
import { getKitchenConfig, saveKitchenConfig } from "@/lib/db/kitchen";
import { kitchenPublicFields } from "@/lib/domain/kitchen";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * GET — horário da cozinha do estabelecimento logado.
 * Resposta: `{ kitchenHours, kitchenCategories, categories, kitchenOpenNow, kitchenNextOpenLabel? }`
 *  - kitchenHours: mesmo shape do weeklyHours — array de 7 (índice 0 = domingo),
 *    cada dia com 0..2 janelas `{ o: "HH:MM", c: "HH:MM" }` (c ≤ o = vira a madrugada).
 *  - kitchenCategories: categorias "da cozinha".
 *  - categories: todas as categorias do cardápio do bar (opções do multi-select).
 */
export async function GET(req: Request): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  const r = await getKitchenConfig(s.establishmentId!);
  if (!r) return Response.json({ error: "not found" }, { status: 404, headers: CORS });
  return Response.json(
    {
      kitchenHours: r.config.hours,
      kitchenCategories: r.config.categories,
      categories: r.categories,
      ...kitchenPublicFields(r.config, new Date()),
    },
    { headers: CORS },
  );
}

/** POST `{ kitchenHours, kitchenCategories }` — salva (normaliza) e devolve o
 *  que ficou gravado, no mesmo formato do GET. Vazio = cozinha sempre aberta. */
export async function POST(req: Request): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid" }, { status: 400, headers: CORS });
  }
  if (
    !body ||
    typeof body !== "object" ||
    (body.kitchenHours != null && !Array.isArray(body.kitchenHours)) ||
    (body.kitchenCategories != null && !Array.isArray(body.kitchenCategories))
  ) {
    return Response.json({ error: "invalid" }, { status: 422, headers: CORS });
  }

  const cfg = await saveKitchenConfig(s.establishmentId!, body.kitchenHours ?? [], body.kitchenCategories ?? []);
  const r = await getKitchenConfig(s.establishmentId!);
  return Response.json(
    {
      ok: true,
      kitchenHours: cfg.hours,
      kitchenCategories: cfg.categories,
      categories: r?.categories ?? [],
      ...kitchenPublicFields(cfg, new Date()),
    },
    { headers: CORS },
  );
}
