import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LeadModalProvider } from "@/components/site/lead-modal";
import { RankingFiltersProvider } from "@/components/site/ranking-filters";
import { LanguageSwitcher } from "@/components/site/LanguageSwitcher";
import { Hero } from "@/components/site/Hero";
import { Categories } from "@/components/site/Categories";
import { Benefits } from "@/components/site/Benefits";
import { HowItWorks } from "@/components/site/HowItWorks";
import { RankingHypados } from "@/components/site/RankingHypados";
import { Footer } from "@/components/site/Footer";
import { getRankingEstablishments } from "@/lib/db/ranking";
import { toRankingEstablishment } from "@/lib/site/adapters";
import { uniqueSorted } from "@/lib/data/establishments";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return {
    title: t("title"),
    description: t("description"),
    openGraph: {
      type: "website",
      locale: locale === "en" ? "en_US" : "pt_BR",
      siteName: "Jurandir",
      title: t("ogTitle"),
      description: t("ogDescription"),
    },
  };
}

export default async function SitePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ranking = (await getRankingEstablishments()).map(toRankingEstablishment);
  const cities = uniqueSorted(ranking.map((e) => e.city));

  return (
    <LeadModalProvider>
      <RankingFiltersProvider>
        <LanguageSwitcher />
        <Hero cities={cities} />
        <main>
          <Categories />
          <Benefits />
          <HowItWorks />
          <RankingHypados establishments={ranking} />
        </main>
        <Footer />
      </RankingFiltersProvider>
    </LeadModalProvider>
  );
}
