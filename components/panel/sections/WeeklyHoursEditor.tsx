"use client";

import { useTranslations } from "next-intl";
import { Dropdown } from "@/components/ui/Dropdown";
import { Icon } from "@/components/ui/Icon";
import { Toggle } from "@/components/ui/Toggle";
import {
  MON_FIRST,
  isOvernight,
  type DayWindows,
  type TimeWindow,
} from "@/lib/domain/schedule";
import { usePanel } from "../context";

// Opções de horário em passos de 30 min (00:00 … 23:30).
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const v = `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`;
  return { value: v, label: v };
});

/** Primeira janela de um dia já aberto (pra copiar como padrão), ou 09h–18h. */
function firstOpenWindow(week: DayWindows[]): TimeWindow {
  for (const day of week) if (day[0]) return { ...day[0] };
  return { o: "09:00", c: "18:00" };
}

export function WeeklyHoursEditor() {
  const { weekly, setWeekly } = usePanel();
  const t = useTranslations("panel.perfil");
  const days = t.raw("weekdaysFull") as string[];

  const setDay = (idx: number, next: DayWindows) =>
    setWeekly(weekly.map((d, k) => (k === idx ? next : d)));

  const toggleDay = (idx: number) => {
    const open = (weekly[idx]?.length ?? 0) > 0;
    setDay(idx, open ? [] : [firstOpenWindow(weekly)]);
  };

  const setWindow = (idx: number, wi: number, part: "o" | "c", val: string) =>
    setDay(
      idx,
      (weekly[idx] ?? []).map((w, k) => (k === wi ? { ...w, [part]: val } : w)),
    );

  const addShift = (idx: number) =>
    setDay(idx, [...(weekly[idx] ?? []), { o: "19:00", c: "23:00" }]);

  const removeShift = (idx: number, wi: number) =>
    setDay(idx, (weekly[idx] ?? []).filter((_, k) => k !== wi));

  const copyMondayToAll = () => {
    const src = weekly[1] ?? [];
    setWeekly(weekly.map(() => src.map((w) => ({ ...w }))));
  };

  const closeAll = () => setWeekly(weekly.map(() => []));

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-[11px] leading-relaxed text-ink/45">{t("hoursHint")}</p>
        <div className="flex flex-shrink-0 gap-2">
          <button
            type="button"
            onClick={copyMondayToAll}
            className="flex items-center gap-1 rounded-lg bg-dune-50 px-2.5 py-1.5 text-[11px] font-bold text-ink/60"
          >
            <Icon name="content_copy" size={13} />
            {t("copyMonToAll")}
          </button>
          <button
            type="button"
            onClick={closeAll}
            className="rounded-lg bg-dune-50 px-2.5 py-1.5 text-[11px] font-bold text-ink/60"
          >
            {t("closeAll")}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {MON_FIRST.map((idx) => {
          const windows = weekly[idx] ?? [];
          const open = windows.length > 0;
          return (
            <div
              key={idx}
              className="rounded-xl border-2 border-ink/10 p-3"
              style={open ? undefined : { opacity: 0.7 }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-display text-sm font-bold text-ink/80">
                  {days[idx]}
                </span>
                <label className="flex items-center gap-2">
                  <span className="text-xs font-medium text-ink/50">
                    {open ? t("open") : t("closed")}
                  </span>
                  <Toggle
                    checked={open}
                    onChange={() => toggleDay(idx)}
                    aria-label={days[idx]}
                  />
                </label>
              </div>

              {open && (
                <div className="mt-3 flex flex-col gap-2">
                  {windows.map((w, wi) => (
                    <div key={wi} className="flex flex-wrap items-center gap-2">
                      <div className="w-[92px]">
                        <TimeSelect
                          value={w.o}
                          onChange={(v) => setWindow(idx, wi, "o", v)}
                          ariaLabel={`${days[idx]} — ${t("opensAt")}`}
                        />
                      </div>
                      <span className="text-xs font-medium text-ink/40">{t("to")}</span>
                      <div className="w-[92px]">
                        <TimeSelect
                          value={w.c}
                          onChange={(v) => setWindow(idx, wi, "c", v)}
                          ariaLabel={`${days[idx]} — ${t("closesAt")}`}
                        />
                      </div>
                      {isOvernight(w) && (
                        <span className="flex items-center gap-1 rounded-full bg-[#eef2ff] px-2 py-0.5 text-[10px] font-bold text-[#4f46e5]">
                          <Icon name="bedtime" size={11} />
                          {t("overnightNote")}
                        </span>
                      )}
                      {wi === 1 && (
                        <button
                          type="button"
                          onClick={() => removeShift(idx, wi)}
                          aria-label={t("removeShift")}
                          className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg bg-dune-50 text-ink/50"
                        >
                          <Icon name="close" size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                  {windows.length < 2 && (
                    <button
                      type="button"
                      onClick={() => addShift(idx)}
                      className="flex w-fit items-center gap-1 text-[11px] font-bold text-ocean-700"
                    >
                      <Icon name="add" size={14} />
                      {t("addShift")}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimeSelect({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  return (
    <Dropdown
      align="stretch"
      value={value}
      onChange={onChange}
      options={TIME_OPTIONS}
      panelClassName="max-h-56"
      renderTrigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label={ariaLabel}
          className="box-border flex w-full items-center justify-between gap-1 rounded-lg border-2 border-ink/15 bg-white px-2.5 py-2 text-sm font-medium text-ink"
        >
          <span className="tabular-nums">{value}</span>
          <Icon
            name="expand_more"
            size={14}
            className="text-ink/40 transition-transform duration-150"
            style={{ transform: open ? "rotate(180deg)" : "none" }}
          />
        </button>
      )}
    />
  );
}
