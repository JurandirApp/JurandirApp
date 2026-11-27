import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/auth/session";
import { getEstablishment, listPanelQrSpots } from "@/lib/db/panel";
import { qrUrl } from "@/lib/panel/helpers";
import { qrSvg } from "@/lib/qr/encode";
import { BEACH_TYPES } from "@/lib/data/admin";
import { Icon } from "@/components/ui/Icon";
import { PrintButton } from "./PrintButton";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "panel.qr" });
  return { title: t("batchTitle"), robots: { index: false } };
}

/**
 * Folha de impressão com o QR de TODAS as mesas/guarda-sóis do estabelecimento
 * logado. Os QRs são gerados aqui no servidor (SVG, sem API externa); o
 * "Imprimir" do navegador também salva em PDF.
 */
export default async function QrLotePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (session?.role !== "ESTABLISHMENT" || !session.establishmentId) {
    redirect({ href: "/login", locale });
    return null;
  }
  const est = await getEstablishment(session.establishmentId);
  if (!est) {
    redirect({ href: "/login", locale });
    return null;
  }
  const spots = await listPanelQrSpots(est.id);
  const t = await getTranslations({ locale, namespace: "panel.qr" });
  const beach = BEACH_TYPES.includes(est.type);
  const cards = spots.map((s) => ({ id: s.id, label: s.label, svg: qrSvg(qrUrl(est.slug, s.label)) }));

  return (
    <div className="min-h-screen bg-white px-6 py-6 text-ink print:p-0">
      <div className="mx-auto mb-6 flex max-w-[1000px] flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <Link
            href="/painel"
            className="mb-1 inline-flex items-center gap-1 text-sm font-semibold text-ink/60 no-underline"
          >
            <Icon name="arrow_back" size={16} />
            {t("batchBack")}
          </Link>
          <h1 className="m-0 font-display text-[22px] font-extrabold">{t("batchTitle")}</h1>
          <p className="m-0 mt-0.5 text-[13px] text-ink/50">
            {t("batchSubtitle", { n: cards.length, name: est.name })}
          </p>
        </div>
        {cards.length > 0 && <PrintButton label={t("batchPrint")} />}
      </div>

      {cards.length === 0 ? (
        <p className="mx-auto max-w-[1000px] text-sm text-ink/50">
          {beach ? t("batchEmptyBeach") : t("batchEmptyTable")}
        </p>
      ) : (
        <div className="mx-auto grid max-w-[1000px] grid-cols-2 gap-4 sm:grid-cols-3 print:max-w-none print:grid-cols-3 print:gap-3">
          {cards.map((c) => (
            <div
              key={c.id}
              className="flex break-inside-avoid flex-col items-center rounded-2xl border-2 border-ink p-3 text-center"
            >
              <p className="m-0 font-display text-[13px] font-bold uppercase tracking-[.04em] text-ink/60">
                {est.name}
              </p>
              {/* SVG gerado por lib/qr/encode (só números e atributos fixos). */}
              <div
                className="my-2 aspect-square w-full max-w-[220px]"
                dangerouslySetInnerHTML={{ __html: c.svg }}
              />
              <p className="m-0 font-display text-[18px] font-extrabold">{c.label}</p>
              <p className="m-0 mt-1 text-[11px] text-ink/50">{t("batchScanHint")}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
