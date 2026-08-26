/**
 * Geocodificação de endereços via Google Geocoding API.
 *
 * A chave fica em `process.env.GOOGLE_GEOCODING_API_KEY` (só no servidor —
 * nunca exponha no app). Sem chave, tudo vira no-op (retorna null), então o
 * app cai no fallback de ordenação por pedidos.
 */

export type LatLng = { lat: number; lng: number };

/** Monta a melhor query de endereço a partir dos campos do estabelecimento. */
export function establishmentAddressQuery(e: {
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
}): string {
  return [e.address, e.neighborhood, e.city, "Brasil"]
    .map((s) => (s ?? "").trim())
    .filter((s) => s.length > 0)
    .join(", ");
}

/**
 * Endereço (texto) → coordenadas. Retorna null se: não há chave, a query é
 * vazia, o Google não encontrou o endereço, ou deu erro/timeout. Nunca lança.
 */
export async function geocodeAddress(query: string): Promise<LatLng | null> {
  const key = process.env.GOOGLE_GEOCODING_API_KEY;
  const q = query.trim();
  if (!key || !q) return null;

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", q);
    url.searchParams.set("key", key);
    url.searchParams.set("region", "br");
    url.searchParams.set("language", "pt-BR");

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      status?: string;
      results?: { geometry?: { location?: { lat?: number; lng?: number } } }[];
    };
    if (data.status !== "OK" || !data.results?.length) return null;

    const loc = data.results[0]?.geometry?.location;
    if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") return null;
    return { lat: loc.lat, lng: loc.lng };
  } catch {
    return null;
  }
}

/**
 * Coordenadas → rótulo curto "Bairro, Cidade" (reverse geocoding), pro header
 * "Você está em…". Null se sem chave/erro. Nunca lança.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = process.env.GOOGLE_GEOCODING_API_KEY;
  if (!key) return null;

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("latlng", `${lat},${lng}`);
    url.searchParams.set("key", key);
    url.searchParams.set("language", "pt-BR");
    url.searchParams.set(
      "result_type",
      "neighborhood|sublocality|locality|administrative_area_level_2",
    );

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      status?: string;
      results?: { address_components?: { long_name: string; types: string[] }[] }[];
    };
    if (data.status !== "OK" || !data.results?.length) return null;

    const comps = data.results[0]?.address_components ?? [];
    const pick = (type: string) => comps.find((c) => c.types.includes(type))?.long_name;
    const hood = pick("neighborhood") ?? pick("sublocality") ?? pick("sublocality_level_1");
    const city = pick("administrative_area_level_2") ?? pick("locality");
    const parts = [hood, city].filter((s): s is string => !!s && s.length > 0);
    return parts.length ? parts.join(", ") : null;
  } catch {
    return null;
  }
}
