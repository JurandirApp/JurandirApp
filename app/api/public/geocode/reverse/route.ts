import { reverseGeocode } from "@/lib/geo/geocode";

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
 * GET /api/public/geocode/reverse?lat=..&lng=..
 * Coordenadas → "Bairro, Cidade" pro header "Você está em…". `label` null se
 * não der (sem chave, fora de cobertura, etc.).
 */
export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ label: null }, { headers: CORS });
  }
  const label = await reverseGeocode(lat, lng);
  return Response.json({ label }, { headers: CORS });
}
