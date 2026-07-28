import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getEstablishmentBySlug } from "@/lib/db/establishments";
import { listMenu, getPopularItemNames } from "@/lib/db/menu";
import { listQrSpots } from "@/lib/db/qr";
import { toAppEstablishment, toAppMenuItem } from "@/lib/app/adapters";
import { ClientApp } from "@/components/app/ClientApp";
import { BEACH_TYPES } from "@/lib/data/admin";
import { DEFAULT_LOC_BEACH, DEFAULT_LOC_TABLE } from "@/lib/data/app";

// Public customer app (Fase 4): establishment + menu are fetched by slug from
// the DB. `local` (from the QR) sets the spot label shown throughout the flow.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const est = await getEstablishmentBySlug(slug);
  return { title: est?.name ?? "Jurandir" };
}

export default async function ClientAppPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ local?: string; paid?: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const dbEst = await getEstablishmentBySlug(slug);
  if (!dbEst) notFound();
  const [dbMenu, dbSpots, popularNames] = await Promise.all([
    listMenu(dbEst.id),
    listQrSpots(dbEst.id),
    getPopularItemNames(dbEst.id),
  ]);

  const beach = BEACH_TYPES.includes(dbEst.type);
  const { local, paid } = await searchParams;
  const loc = local ?? (beach ? DEFAULT_LOC_BEACH : DEFAULT_LOC_TABLE);

  return (
    <ClientApp
      est={toAppEstablishment(dbEst)}
      menu={dbMenu.map(toAppMenuItem)}
      beach={beach}
      loc={loc}
      spotFromQr={Boolean(local)}
      spots={dbSpots.map((s) => s.label)}
      popularNames={popularNames}
      paidReturn={Boolean(paid)}
    />
  );
}
