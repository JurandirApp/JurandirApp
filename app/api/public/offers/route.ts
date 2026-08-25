import { toAppMenuItem } from "@/lib/app/adapters";
import { listOffers } from "@/lib/db/menu";

// Consultas ao Neon a cada request.
export const dynamic = "force-dynamic";

// API pública (cliente anônimo) — liberada p/ o app Flutter (web/emulador).
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * GET /api/public/offers
 * Itens com desconto real de bares ativos (Home · "Ofertas do dia"). Cada
 * oferta carrega o slug/nome do bar pra abrir o cardápio certo ao tocar.
 */
export async function GET(): Promise<Response> {
  const rows = await listOffers();
  const offers = rows.map((m) => ({
    ...toAppMenuItem(m),
    estSlug: m.establishment.slug,
    estName: m.establishment.name,
  }));

  return Response.json({ offers }, { headers: CORS });
}
