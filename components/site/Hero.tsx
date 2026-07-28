"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Dropdown } from "@/components/ui/Dropdown";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/Badge";
import { useLeadModal } from "./lead-modal";
import { useRankingFilters } from "./ranking-filters";
import { Mascot } from "./Mascot";
import { Marquee } from "./Marquee";

export function Hero({ cities }: { cities: string[] }) {
  const t = useTranslations("hero");
  const { openLead } = useLeadModal();
  const { city, setCity } = useRankingFilters();
  const stats = t.raw("stats") as { n: string; label: string }[];

  const cityOptions = useMemo(
    () => [
      { value: "", label: t("allCities"), icon: "location_on" },
      ...cities.map((c) => ({
        value: c,
        label: c,
        icon: "location_on",
      })),
    ],
    [t, cities],
  );

  const goToRanking = () => {
    const el = document.getElementById("mais-hypados");
    if (el)
      window.scrollTo({
        top: el.getBoundingClientRect().top + window.scrollY - 20,
        behavior: "smooth",
      });
  };

  return (
    <header className="relative overflow-hidden bg-sand">
      {/* Giant background wordmark */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-24px] z-0 -translate-x-1/2 select-none whitespace-nowrap font-display text-[22vw] font-extrabold uppercase leading-none tracking-[-0.05em] text-ink/[0.055] lg:text-[25vw] xl:text-[27vw]"
      >
        Jurandir
      </span>
      {/* Sun glow */}
      <div className="pointer-events-none absolute right-[-96px] top-[-96px] h-96 w-96 rounded-full bg-sun/40 blur-[64px]" />

      <div className="relative mx-auto grid max-w-[1152px] items-center gap-10 px-6 pb-24 pt-20 md:grid-cols-[1.1fr_0.9fr]">
        {/* Left column */}
        <div>
          <span className="inline-flex animate-fade-up items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs font-bold uppercase tracking-[.1em] text-sand">
            <Icon name="location_on" size={14} className="text-sun" />
            {t("eyebrow")}
          </span>

          <h1
            className="mt-6 animate-fade-up font-display text-[3.25rem] font-extrabold uppercase leading-[.86] tracking-[-0.02em] sm:text-[4.25rem] md:text-[5.5rem]"
            style={{ animationDelay: ".08s" }}
          >
            {t("titleLine1")}
            <span className="mt-1 block text-coral-emph">{t("titleLine2")}</span>
          </h1>

          <p
            className="mt-6 max-w-[512px] animate-fade-up text-lg leading-[1.6] text-ink/70"
            style={{ animationDelay: ".16s" }}
          >
            {t.rich("subtitle", {
              b: (chunks) => <b className="text-ink">{chunks}</b>,
            })}
          </p>

          {/* Finder */}
          <Dropdown
            className="relative z-20 mt-8 animate-fade-up"
            align="stretch"
            value={city}
            onChange={setCity}
            options={cityOptions}
            panelClassName="rounded-[20px] p-2"
            renderTrigger={({ open, toggle }) => (
              <div className="flex flex-col gap-2 rounded-[26px] bg-white p-2 shadow-float sm:flex-row sm:items-center sm:gap-1 sm:rounded-full sm:py-1.5 sm:pl-5 sm:pr-1.5">
                {/* Campo cidade (label + valor empilhados) */}
                <button
                  type="button"
                  onClick={toggle}
                  aria-label={t("finderLabel")}
                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[18px] bg-[#f5f6f8] px-4 py-2.5 text-left sm:rounded-none sm:bg-transparent sm:px-0 sm:py-1.5"
                >
                  <Icon name="location_on" size={18} className="flex-shrink-0 text-coral" />
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="text-[11px] font-semibold text-ink/45">
                      {t("finderLabel")}
                    </span>
                    <span
                      className="truncate text-sm font-semibold"
                      style={{ color: city ? "#141821" : "rgba(20,24,33,.5)" }}
                    >
                      {city || t("finderPlaceholder")}
                    </span>
                  </span>
                  <Icon
                    name="expand_more"
                    size={18}
                    className="flex-shrink-0 text-ink/40 transition-transform duration-150"
                    style={{ transform: open ? "rotate(180deg)" : "none" }}
                  />
                </button>
                {/* Buscar — largura total no mobile, à direita no desktop */}
                <button
                  type="button"
                  onClick={goToRanking}
                  className="flex flex-shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink px-5 py-3 text-sm font-bold text-sand sm:py-2.5"
                >
                  {t("search")}
                  <Icon name="arrow_forward" size={15} />
                </button>
              </div>
            )}
          />

          <button
            type="button"
            onClick={openLead}
            className="mt-4 inline-flex animate-fade-up items-center gap-1.5 text-sm font-semibold text-ink/70 underline decoration-coral decoration-2 underline-offset-4"
            style={{ animationDelay: ".3s" }}
          >
            <Icon name="storefront" size={15} />
            {t("haveBusiness")}
          </button>

          <dl
            className="mx-auto mt-10 grid w-fit animate-fade-up grid-cols-2 gap-x-10 gap-y-6 text-center sm:mx-0 sm:w-auto sm:max-w-[512px] sm:grid-cols-4 sm:gap-x-4 sm:text-left"
            style={{ animationDelay: ".36s" }}
          >
            {stats.map((s) => (
              <div key={s.label} className="min-w-0">
                <dt className="font-display text-4xl font-extrabold">{s.n}</dt>
                <dd className="mt-0.5 text-xs font-medium leading-[1.3] text-ink/55">
                  {s.label}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Right column — mascot + floating cards */}
        <div
          className="relative mx-auto w-full max-w-[384px] animate-fade-up"
          style={{ animationDelay: ".4s" }}
        >
          <div className="absolute inset-0 m-auto h-80 w-80 translate-y-6 rounded-full bg-ocean-900" />
          <div className="relative flex animate-floaty items-center justify-center">
            <Mascot />
          </div>

          {/* Floating order card */}
          <div className="absolute bottom-[-24px] left-[-8px] w-56 -rotate-[4deg] rounded-2xl bg-white p-3.5 shadow-float">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-[11px] font-bold text-ocean-700">
                <Icon name="location_on" size={12} className="text-coral" />
                {t("demoCard.spot")}
              </span>
              <Badge tone="emerald" className="px-2 py-0.5 text-[9px]">
                {t("demoCard.paid")}
              </Badge>
            </div>
            <div className="mt-2 flex flex-col gap-1 text-[11px] text-ink/70">
              <div className="flex justify-between">
                <span className="flex items-center gap-1">
                  <Icon name="local_bar" size={12} />
                  {t("demoCard.item1")}
                </span>
                <span className="font-semibold">R$ 44</span>
              </div>
              <div className="flex justify-between">
                <span className="flex items-center gap-1">
                  <Icon name="set_meal" size={12} />
                  {t("demoCard.item2")}
                </span>
                <span className="font-semibold">R$ 68</span>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-[#ecfdf5] px-2 py-1 text-[10px] font-semibold text-status-emerald-fg">
              <Icon name="check" size={11} />
              {t("demoCard.onTheWay")}
            </div>
          </div>

          {/* QR badge */}
          <div className="absolute right-[-8px] top-2 flex h-16 w-16 rotate-[6deg] items-center justify-center rounded-2xl bg-ink shadow-float">
            <Icon name="qr_code_2" size={30} className="text-sun" />
          </div>
        </div>
      </div>

      <Marquee />
    </header>
  );
}
