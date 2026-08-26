/**
 * Preenche lat/lng dos estabelecimentos que ainda não têm coordenadas,
 * geocodificando o endereço (Google Geocoding).
 *
 * Requer GOOGLE_GEOCODING_API_KEY + DATABASE_URL no ambiente.
 *   npx tsx scripts/backfill-geo.ts          (só os sem coords)
 *   npx tsx scripts/backfill-geo.ts --all    (re-geocodifica todos)
 */
import { PrismaClient } from "@prisma/client";
import { establishmentAddressQuery, geocodeAddress } from "../lib/geo/geocode";

const prisma = new PrismaClient();

async function main() {
  const all = process.argv.includes("--all");
  if (!process.env.GOOGLE_GEOCODING_API_KEY) {
    console.error("Faltando GOOGLE_GEOCODING_API_KEY no ambiente.");
    process.exit(1);
  }

  const ests = await prisma.establishment.findMany({
    where: all ? {} : { OR: [{ lat: null }, { lng: null }] },
    select: { id: true, name: true, address: true, neighborhood: true, city: true },
  });
  console.log(`${ests.length} estabelecimento(s) pra geocodificar${all ? " (todos)" : ""}.`);

  let ok = 0;
  let fail = 0;
  for (const e of ests) {
    const query = establishmentAddressQuery(e);
    const coords = await geocodeAddress(query);
    if (coords) {
      await prisma.establishment.update({
        where: { id: e.id },
        data: { lat: coords.lat, lng: coords.lng },
      });
      ok++;
      console.log(`OK    ${e.name} → ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}  [${query}]`);
    } else {
      fail++;
      console.log(`FALHA ${e.name}  [${query}]`);
    }
    // Respeita rate-limit / evita rajada.
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`\nPronto: ${ok} geocodificado(s), ${fail} falha(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
