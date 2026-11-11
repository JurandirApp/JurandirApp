import { listEstablishments } from "@/lib/db/establishments";
import { toAppPayments } from "@/lib/app/adapters";
import { tunaPublicReadiness } from "@/lib/payments/tuna-public";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * GET /api/public/establishments
 * Lista pública (card da Home/Buscar): nome, local, culinária, pedidos, rating.
 * Só estabelecimentos ativos; sem segredos.
 */
export async function GET(): Promise<Response> {
  const ests = (await listEstablishments()).filter((e) => e.status === "ACTIVE");
  // Prontidão da Tuna: modo + chave dos cartões lidos uma vez pra lista toda.
  const tunaOf = await tunaPublicReadiness(ests);
  const establishments = ests.map((e) => ({
    id: e.id,
    slug: e.slug,
    name: e.name,
    location: [e.neighborhood, e.city].filter(Boolean).join(", "),
    cuisine: e.cuisine ?? e.type,
    orders: e.rankingOrders,
    rating: e.rating == null ? null : Number(e.rating),
    open: e.status === "ACTIVE",
    // Taxas reais do bar (o checkout do app usa pra mostrar o total certo).
    platformFeePct: e.platformFeePct,
    serviceFeePct: e.serviceFeePct,
    // Coordenadas p/ ordenar por proximidade no app (null = sem geocode ainda).
    lat: e.lat ?? null,
    lng: e.lng ?? null,
    // Imagens do bar (thumb dos cards). logo = quadrado; cover = capa.
    logo: e.logoImg ?? null,
    cover: e.coverImg ?? null,
    ...toAppPayments({ ...e, tuna: tunaOf(e) }),
  }));

  return Response.json({ establishments }, { headers: CORS });
}
