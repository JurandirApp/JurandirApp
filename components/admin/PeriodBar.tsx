"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Dropdown } from "@/components/ui/Dropdown";
import { Icon } from "@/components/ui/Icon";
import { PERIODS, monthOptions } from "@/lib/admin/scale";
import { useAdmin } from "./context";

export function PeriodBar() {
  const {
    ests,
    estabScope,
    setEstabScope,
    period,
    setPeriod,
    month,
    setMonth,
    now,
  } = useAdmin();
  const t = useTranslations("admin.period");
  const locale = useLocale();

  const months = useMemo(() => monthOptions(now, locale), [now, locale]);
  const scopeName = estabScope
    ? (ests.find((e) => e.id === estabScope)?.name ?? "")
    : t("allEst");
  const monthLabel =
    months.find((m) => m.value === month)?.label ?? months[0].label;

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex-shrink-0 text-xs font-semibold text-ink/50">
          {t("establishment")}
        </span>
        <Dropdown
          className="relative max-w-[380px] flex-1"
          align="stretch"
          value={estabScope}
          onChange={setEstabScope}
          panelClassName="max-h-[320px] overflow-y-auto"
          options={[
            { value: "", label: t("allEst") },
            ...ests.map((e) => ({ value: e.id, label: e.name })),
          ]}
          renderTrigger={({ open, toggle }) => (
            <button
              type="button"
              onClick={toggle}
              className="box-border flex w-full items-center justify-between gap-2 rounded-xl border-2 bg-white px-3.5 py-2.5 text-left text-sm font-semibold text-ink"
              style={{ borderColor: estabScope ? "#FF6B4A" : "rgba(20,24,33,.15)" }}
            >
              <span className="flex flex-1 items-center gap-2 truncate">
                <Icon name="storefront" size={16} className="text-coral" />
                {scopeName}
              </span>
              <Icon
                name="expand_more"
                size={18}
                className="text-ink/40 transition-transform duration-150"
                style={{ transform: open ? "rotate(180deg)" : "none" }}
              />
            </button>
          )}
        />
        {estabScope && (
          <span className="whitespace-nowrap rounded-full bg-coral/10 px-2.5 py-[5px] text-[11px] font-bold text-coral-emph">
            {t("oneEst")}
          </span>
        )}
      </div>

      <div className="flex gap-1 rounded-xl border-2 border-ink bg-white p-1 shadow-hard">
        {PERIODS.map(([id]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPeriod(id)}
            className="flex-1 rounded-lg py-2 text-sm font-bold"
            style={{
              background: period === id ? "#141821" : "transparent",
              color: period === id ? "#EDD8A3" : "rgba(20,24,33,.5)",
            }}
          >
            {t(id)}
          </button>
        ))}
      </div>

      {period === "mes" && (
        <div className="mt-2 flex items-center gap-2">
          <span className="flex-shrink-0 text-xs text-ink/50">{t("month")}</span>
          <Dropdown
            className="relative flex-1"
            align="stretch"
            value={month}
            onChange={setMonth}
            panelClassName="max-h-[280px] overflow-y-auto"
            options={months.map((m) => ({ value: m.value, label: m.label }))}
            renderTrigger={({ open, toggle }) => (
              <button
                type="button"
                onClick={toggle}
                className="box-border flex w-full items-center justify-between gap-2 rounded-xl border-2 border-ink/15 bg-white px-3 py-2 text-left text-sm font-medium text-ink"
              >
                <span className="flex-1 truncate">{monthLabel}</span>
                <Icon
                  name="expand_more"
                  size={16}
                  className="text-ink/40 transition-transform duration-150"
                  style={{ transform: open ? "rotate(180deg)" : "none" }}
                />
              </button>
            )}
          />
        </div>
      )}
    </div>
  );
}
