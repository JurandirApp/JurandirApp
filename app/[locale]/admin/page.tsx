import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/auth/session";
import {
  getAdminEstablishments,
  listAllOrders,
  listMonthlyStats,
  listSearchEvents,
} from "@/lib/db/admin";
import {
  toAdminEst,
  toAdminOrder,
  toMonthlyStatLite,
  toSearchEventRows,
} from "@/lib/admin/adapters";
import { AdminApp } from "@/components/admin/AdminApp";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "panel.placeholder.admin" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (session?.role !== "ADMIN") redirect({ href: "/login", locale });

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const nowD = new Date(now);
  const curY = nowD.getFullYear();
  const curM = nowD.getMonth() + 1;

  const [dbEsts, dbStats, dbOrders, dbEvents] = await Promise.all([
    getAdminEstablishments(),
    listMonthlyStats(),
    listAllOrders(),
    listSearchEvents(),
  ]);

  const stats = dbStats.map(toMonthlyStatLite);
  const ests = dbEsts.map((e) =>
    toAdminEst(
      e,
      stats.find((s) => s.establishmentId === e.id && s.year === curY && s.month === curM),
    ),
  );
  const orders = dbOrders.map((o, i) => toAdminOrder(o, i));
  const events = dbEvents.flatMap(toSearchEventRows);

  return <AdminApp now={now} ests={ests} stats={stats} orders={orders} events={events} />;
}
