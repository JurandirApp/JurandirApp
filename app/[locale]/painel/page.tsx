import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/auth/session";
import {
  getEstablishment,
  listPanelMenu,
  listPanelOrders,
  listPanelPrintJobs,
  listPanelQrSpots,
  listPanelStats,
} from "@/lib/db/panel";
import { toMonthlyStatLite } from "@/lib/admin/adapters";
import {
  toPanelMenuItem,
  toPanelOrder,
  toPanelPrintJob,
  toPanelQr,
  toProfileForm,
} from "@/lib/panel/adapters";
import { PanelApp } from "@/components/panel/PanelApp";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "panel" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function PainelPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ mp?: string }>;
}) {
  const { locale } = await params;
  const { mp } = await searchParams;
  setRequestLocale(locale);
  const session = await getSession();
  if (session?.role !== "ESTABLISHMENT" || !session.establishmentId) {
    redirect({ href: "/login", locale });
    return null;
  }

  const estId = session.establishmentId;
  const [est, dbOrders, dbMenu, dbQrs, dbStats, dbPrintJobs] = await Promise.all([
    getEstablishment(estId),
    listPanelOrders(estId),
    listPanelMenu(estId),
    listPanelQrSpots(estId),
    listPanelStats(estId),
    listPanelPrintJobs(estId),
  ]);
  if (!est) {
    redirect({ href: "/login", locale });
    return null;
  }

  // Server timestamp → deterministic seed for SSR/hydration (see PanelApp).
  // This Server Component renders per request (already dynamic via the session
  // cookie), so reading the request-time clock here is intentional.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  return (
    <PanelApp
      now={now}
      slug={est.slug}
      profile={toProfileForm(est)}
      images={{ cover: est.coverImg, logo: est.logoImg }}
      orders={dbOrders.map(toPanelOrder)}
      menu={dbMenu.map(toPanelMenuItem)}
      qrs={dbQrs.map(toPanelQr)}
      stats={dbStats.map(toMonthlyStatLite)}
      printJobs={dbPrintJobs.map(toPanelPrintJob)}
      printer={{
        ip: est.printerIp ?? "",
        enabled: est.printEnabled,
        hasToken: Boolean(est.printAgentToken),
      }}
      mpConnected={Boolean(est.mpAccessToken)}
      mpResult={mp === "ok" ? "ok" : mp === "error" ? "error" : null}
    />
  );
}
