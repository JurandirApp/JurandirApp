import { PUBLIC_READ_CACHE } from "@/lib/app/public-cache";
import { toAppEstablishment, toAppMenuItem } from "@/lib/app/adapters";
import { getEstablishmentBySlug } from "@/lib/db/establishments";
import { getPopularItemNames, listMenu } from "@/lib/db/menu";
import { listQrSpots } from "@/lib/db/qr";
import { tunaPublicReadiness } from "@/lib/payments/tuna-public";
import { isKitchenCategory, kitchenConfigOf, kitchenPublicFields } from "@/lib/domain/kitchen";

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
 * Cozinha: `est.kitchenOpenNow`, `est.kitchenNextOpenLabel?` e `menu[].kitchen`
 * (`?lang=en` traduz o rótulo; padrão pt).
 * Segredos de pagamento/impressora são removidos por `toAppEstablishment`.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await ctx.params;

  const est = await getEstablishmentBySlug(slug);
  if (!est) {
    return Response.json({ error: "not found" }, { status: 404, headers: CORS });
  }

  const [menu, spots, popularNames, tunaOf] = await Promise.all([
    listMenu(est.id),
    listQrSpots(est.id),
    getPopularItemNames(est.id),
    tunaPublicReadiness([est]),
  ]);

  // Cozinha: status calculado no relógio de Brasília. A resposta fica em cache
  // de CDN por ~30 s (+ SWR), então a virada de horário pode atrasar um pouco —
  // a criação do pedido sempre revalida no servidor (erro `kitchenClosed`).
  const kitchen = kitchenConfigOf(est);
  const lang = new URL(req.url).searchParams.get("lang") === "en" ? "en" : "pt";

  return Response.json(
    {
      est: {
        ...toAppEstablishment({ ...est, tuna: tunaOf(est) }),
        ...kitchenPublicFields(kitchen, new Date(), lang),
      },
      menu: menu
        .filter((m) => m.active)
        .map((m) => ({ ...toAppMenuItem(m), kitchen: isKitchenCategory(kitchen, m.category) })),
      spots: spots.map((s) => s.label),
      popularNames,
    },
    { headers: { ...CORS, ...PUBLIC_READ_CACHE } },
  );
}
