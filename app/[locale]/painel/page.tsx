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
import { listWaiters } from "@/lib/db/waiters";
import { syncPagarmeRecipientStatus } from "@/lib/db/payments";
import { getPagarmeRecipientStatus } from "@/lib/payments/pagarme";
import { toMonthlyStatLite } from "@/lib/admin/adapters";
import {
  toPanelMenuItem,
  toPanelOrder,
  toPanelPrintJob,
  toPanelQr,
  toProfileForm,
} from "@/lib/panel/adapters";
import { periodRange } from "@/lib/domain/period";
import { normalizeWeekly } from "@/lib/domain/schedule";
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
  const est = await getEstablishment(estId);
  if (!est) {
    redirect({ href: "/login", locale });
    return null;
  }

  // Self-heal do status do recebedor Pagar.me: enquanto não está `active`,
  // consulta o status real na API (o webhook pode não estar configurado ou já
  // ter perdido a transição registration → affiliation → active). Best-effort,
  // com timeout curto; se falhar, mantém o status guardado.
  let pagarmeStatus = est.pagarmeRecipientStatus;
  if (est.pagarmeRecipientId && pagarmeStatus !== "active" && pagarmeStatus !== "refused") {
    const live = await getPagarmeRecipientStatus(est.pagarmeRecipientId);
    if (live && live !== pagarmeStatus) {
      await syncPagarmeRecipientStatus(est.pagarmeRecipientId, live);
      pagarmeStatus = live;
    }
  }

  // Server timestamp → deterministic seed for SSR/hydration (see PanelApp).
  // This Server Component renders per request (already dynamic via the session
  // cookie), so reading the request-time clock here is intentional.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  // Abre no dia operacional atual (respeita o "início do dia" do estabelecimento).
  const todayRange = periodRange({ kind: "hoje" }, est.dayStartHour, now);
  const [dbOrders, dbMenu, dbWaiters, dbQrs, dbStats, dbPrintJobs] = await Promise.all([
    listPanelOrders(estId, todayRange),
    listPanelMenu(estId),
    listWaiters(estId),
    listPanelQrSpots(estId),
    listPanelStats(estId),
    listPanelPrintJobs(estId),
  ]);
  return (
    <PanelApp
      now={now}
      slug={est.slug}
      dayStartHour={est.dayStartHour}
      dayStartSet={est.dayStartSet}
      weekly={normalizeWeekly(est.weeklyHours)}
      profile={toProfileForm(est)}
      images={{ cover: est.coverImg, logo: est.logoImg }}
      orders={dbOrders.map(toPanelOrder)}
      menu={dbMenu.map(toPanelMenuItem)}
      waiters={dbWaiters}
      qrs={dbQrs.map(toPanelQr)}
      stats={dbStats.map(toMonthlyStatLite)}
      printJobs={dbPrintJobs.map(toPanelPrintJob)}
      printer={{
        ip: est.printerIp ?? "",
        enabled: est.printEnabled,
        hasToken: Boolean(est.printAgentToken),
      }}
      mpConnected={Boolean(est.mpAccessToken)}
      mpPixReady={est.mpPixReady}
      mpResult={mp === "ok" ? "ok" : mp === "error" ? "error" : null}
      gatewayPix={est.gatewayPix}
      gatewayCredit={est.gatewayCredit}
      gatewayDebit={est.gatewayDebit}
      pagarmeReady={Boolean(est.pagarmeRecipientId)}
      pagarmeStatus={pagarmeStatus}
      asaasReady={Boolean(est.asaasWalletId)}
      waiterModule={est.waiterModuleEnabled}
    />
  );
}
