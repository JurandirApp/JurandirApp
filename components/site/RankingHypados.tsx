"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { Icon } from "@/components/ui/Icon";
import { isOpenAt, uniqueSorted, type Establishment } from "@/lib/data/establishments";
import { formatDayWindows } from "@/lib/domain/schedule";
import { Link } from "@/i18n/navigation";
import { useRankingFilters } from "./ranking-filters";
import { Reveal } from "./Reveal";

export function RankingHypados({ establishments }: { establishments: Establishment[] }) {
  const t = useTranslations("ranking");
  const wd = t.raw("weekdays") as string[];
  const {
    city,
    bairro,
    cuisine,
    tipo,
    day,
    openNow,
    setCity,
    setBairro,
    setCuisine,
    setTipo,
    setDay,
    toggleOpenNow,
    clear,
    hasFilter,
  } = useRankingFilters();

  // Time is client-only to avoid SSR hydration mismatch; refreshes each minute.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const dayN = day === "" ? null : Number(day);

  const cityOptions = useMemo(
    () => uniqueSorted(establishments.map((e) => e.city)),
    [establishments],
  );
  const bairroOptions = useMemo(
    () =>
      uniqueSorted(
        establishments.filter((e) => !city || e.city === city).map((e) => e.neigh),
      ),
    [establishments, city],
  );
  const cuisineOptions = useMemo(
    () => uniqueSorted(establishments.map((e) => e.cuisine)),
    [establishments],
  );
  const tipoOptions = useMemo(
    () => uniqueSorted(establishments.map((e) => e.tipo)),
    [establishments],
  );

  const filters: {
    placeholder: string;
    display: string;
    value: string;
    onChange: (v: string) => void;
    options: DropdownOption[];
    active: boolean;
  }[] = [
    {
      placeholder: t("allCities"),
      display: city,
      value: city,
      onChange: setCity,
      active: Boolean(city),
      options: [
        { value: "", label: t("allCities") },
        ...cityOptions.map((v) => ({ value: v, label: v })),
      ],
    },
    {
      placeholder: t("allNeighborhoods"),
      display: bairro,
      value: bairro,
      onChange: setBairro,
      active: Boolean(bairro),
      options: [
        { value: "", label: t("allNeighborhoods") },
        ...bairroOptions.map((v) => ({ value: v, label: v })),
      ],
    },
    {
      placeholder: t("allCuisines"),
      display: cuisine,
      value: cuisine,
      onChange: setCuisine,
      active: Boolean(cuisine),
      options: [
        { value: "", label: t("allCuisines") },
        ...cuisineOptions.map((v) => ({ value: v, label: v })),
      ],
    },
    {
      placeholder: t("allTypes"),
      display: tipo,
      value: tipo,
      onChange: setTipo,
      active: Boolean(tipo),
      options: [
        { value: "", label: t("allTypes") },
        ...tipoOptions.map((v) => ({ value: v, label: v })),
      ],
    },
    {
      placeholder: t("anyDay"),
      display: dayN !== null ? wd[dayN] : "",
      value: day,
      onChange: setDay,
      active: day !== "",
      options: [
        { value: "", label: t("anyDay") },
        ...wd.map((d, i) => ({ value: String(i), label: d })),
      ],
    },
  ];

  const filtered = useMemo(
    () =>
      establishments
        .filter((e) => !city || e.city === city)
        .filter((e) => !bairro || e.neigh === bairro)
        .filter((e) => !cuisine || e.cuisine === cuisine)
        .filter((e) => !tipo || e.tipo === tipo)
        .filter((e) => dayN === null || (e.hours[dayN]?.length ?? 0) > 0)
        .filter((e) => !openNow || (now !== null && isOpenAt(e.hours, now)))
        .sort((a, b) => b.orders - a.orders),
    [establishments, city, bairro, cuisine, tipo, dayN, openNow, now],
  );

  const showDay = dayN !== null ? dayN : now ? now.getDay() : null;

  return (
    <section id="mais-hypados" className="mx-auto max-w-[1024px] px-5 py-14">
      <Reveal>
        <div className="mb-2 flex items-center gap-2 text-coral-emph">
          <Icon name="local_fire_department" size={20} />
          <span className="text-xs font-bold uppercase tracking-[.1em]">
            {t("eyebrow")}
          </span>
        </div>
        <h2 className="m-0 font-display text-4xl font-extrabold uppercase tracking-[-0.02em]">
          {t("heading")}
        </h2>
        <p className="mt-2 text-ink/60">
          {t.rich("subtitle", { b: (chunks) => <b>{chunks}</b> })}
        </p>
      </Reveal>

      {/* Filters */}
      <Reveal
        delay={0.06}
        className="mt-6 flex flex-wrap items-center gap-2"
      >
        {filters.map((f) => (
          <Dropdown
            key={f.placeholder}
            value={f.value}
            onChange={f.onChange}
            options={f.options}
            panelClassName="min-w-[220px] max-h-[280px] overflow-y-auto"
            renderTrigger={({ open, toggle }) => (
              <button
                type="button"
                onClick={toggle}
                className="flex items-center gap-2 whitespace-nowrap rounded-xl border-2 bg-white px-3 py-2 text-sm font-semibold"
                style={{
                  borderColor: f.active ? "#FF6B4A" : "rgba(20,24,33,.1)",
                  color: f.active ? "#141821" : "rgba(20,24,33,.7)",
                }}
              >
                {f.active ? f.display : f.placeholder}
                <Icon
                  name="expand_more"
                  size={16}
                  className="text-ink/40 transition-transform duration-150"
                  style={{ transform: open ? "rotate(180deg)" : "none" }}
                />
              </button>
            )}
          />
        ))}

        <button
          type="button"
          onClick={toggleOpenNow}
          className="rounded-xl border-2 px-3 py-2 text-sm font-bold transition-colors"
          style={{
            borderColor: openNow ? "#10b981" : "rgba(20,24,33,.1)",
            background: openNow ? "#10b981" : "#fff",
            color: openNow ? "#fff" : "rgba(20,24,33,.7)",
          }}
        >
          {t("openNow")}
        </button>

        {hasFilter && (
          <button
            type="button"
            onClick={clear}
            className="bg-transparent px-2 py-2 text-sm font-semibold text-coral-emph"
          >
            {t("clear")}
          </button>
        )}
      </Reveal>

      {filtered.length === 0 && (
        <p className="mt-8 rounded-2xl border-2 border-dashed border-ink/15 bg-sand/20 px-4 py-10 text-center text-ink/50">
          {t("noResults")}
        </p>
      )}

      <Reveal delay={0.1}>
        <ul className="mt-6 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
          {filtered.map((e, idx) => {
          const top3 = idx < 3;
          const aberto = now ? isOpenAt(e.hours, now) : null;
          const dayWins = showDay !== null ? e.hours[showDay] : null;
          const hoursLabel =
            showDay !== null
              ? `${wd[showDay]} ${dayWins && dayWins.length ? formatDayWindows(dayWins) : t("closedHours")}`
              : null;

          return (
            <li
              key={e.id}
              className="flex items-center gap-3 rounded-2xl border-2 border-ink/10 bg-white p-3"
            >
              {/* Logo com a posição sobreposta no canto (sem logo → só o número). */}
              <div className="relative flex-shrink-0">
                {e.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={e.logo}
                    alt=""
                    className="h-14 w-14 rounded-xl border border-ink/10 object-cover"
                  />
                ) : (
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-xl font-display text-lg font-extrabold"
                    style={{
                      background: top3 ? "#FFC24B" : "rgba(20,24,33,.05)",
                      color: top3 ? "#141821" : "rgba(20,24,33,.5)",
                    }}
                  >
                    {idx + 1}º
                  </div>
                )}
                {e.logo && (
                  <span
                    className="absolute -left-2 -top-2 flex h-6 min-w-[24px] items-center justify-center rounded-full border-2 border-white px-1 font-display text-[11px] font-extrabold shadow-[0_2px_6px_-1px_rgba(0,0,0,.3)]"
                    style={{
                      background: top3 ? "#FFC24B" : "#141821",
                      color: top3 ? "#141821" : "#fff",
                    }}
                  >
                    {idx + 1}º
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="m-0 truncate font-display text-lg font-bold">
                    {e.name}
                  </p>
                  {aberto !== null && (
                    <span
                      className="flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
                      style={{
                        background: aberto ? "#d1fae5" : "rgba(20,24,33,.1)",
                        color: aberto ? "#047857" : "rgba(20,24,33,.5)",
                      }}
                    >
                      {aberto ? t("open") : t("closed")}
                    </span>
                  )}
                </div>

                <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                  {e.rating == null ? (
                    <span className="rounded-full bg-[#10b981]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[.04em] text-[#059669]">
                      {t("new")}
                    </span>
                  ) : (
                    <>
                      <span className="inline-flex gap-px">
                        {[0, 1, 2, 3, 4].map((i) => {
                          const w = Math.max(0, Math.min(1, e.rating! - i)) * 100;
                          return (
                            <span
                              key={i}
                              className="relative inline-block h-3.5 w-3.5 leading-none"
                            >
                              <Icon
                                name="star"
                                size={14}
                                className="absolute inset-0 text-ink/20"
                              />
                              <span
                                className="absolute inset-0 overflow-hidden"
                                style={{ width: `${w}%` }}
                              >
                                <Icon
                                  name="star"
                                  size={14}
                                  fill
                                  className="text-[#fbbf24]"
                                />
                              </span>
                            </span>
                          );
                        })}
                      </span>
                      <span className="font-bold">{e.rating!.toFixed(1)}</span>
                    </>
                  )}
                </div>

                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink/60">
                  <span className="inline-flex items-center gap-1 rounded-full bg-coral/10 px-2 py-0.5 font-semibold text-[#c2410c]">
                    <Icon name="restaurant" size={11} />
                    {e.cuisine}
                  </span>
                  <span className="rounded-full bg-ocean-900/10 px-2 py-0.5 font-semibold text-ocean-900">
                    {e.tipo}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Icon name="location_on" size={11} />
                    {e.neigh} · {e.city}
                  </span>
                  {hoursLabel && (
                    <span className="inline-flex items-center gap-1">
                      <Icon name="schedule" size={11} />
                      {hoursLabel}
                    </span>
                  )}
                </p>
              </div>

              <Link
                href={`/${e.slug}`}
                aria-label={`${t("viewMenu")} · ${e.name}`}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 py-2.5 text-sm font-bold text-sand"
              >
                {t("viewMenu")}
                <Icon name="arrow_forward" size={15} />
              </Link>
            </li>
          );
        })}
        </ul>
      </Reveal>
    </section>
  );
}
