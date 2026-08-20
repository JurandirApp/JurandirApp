import { toAppEstablishment, toAppMenuItem } from "@/lib/app/adapters";
import { getEstablishmentBySlug } from "@/lib/db/establishments";
import { getPopularItemNames, listMenu } from "@/lib/db/menu";
import { listQrSpots } from "@/lib/db/qr";

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
 * GET /api/public/{slug}
 * Retorna o estabelecimento + cardápio + mesas (QR) + mais pedidos.
 * Segredos de pagamento/impressora são removidos por `toAppEstablishment`.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await ctx.params;

  const est = await getEstablishmentBySlug(slug);
  if (!est) {
    return Response.json({ error: "not found" }, { status: 404, headers: CORS });
  }

  const [menu, spots, popularNames] = await Promise.all([
    listMenu(est.id),
    listQrSpots(est.id),
    getPopularItemNames(est.id),
  ]);

  return Response.json(
    {
      est: toAppEstablishment(est),
      menu: menu.filter((m) => m.active).map(toAppMenuItem),
      spots: spots.map((s) => s.label),
      popularNames,
    },
    { headers: CORS },
  );
}
