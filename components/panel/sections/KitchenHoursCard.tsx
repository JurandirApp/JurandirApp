"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { CATS } from "@/lib/data/panel";
import { saveKitchenConfigAction } from "@/lib/actions/panel";
import { kitchenConfigured, type KitchenConfig } from "@/lib/domain/kitchen";
import type { WeekSchedule } from "@/lib/domain/schedule";
import { usePanel } from "../context";
import { WeeklyHoursEditor } from "./WeeklyHoursEditor";

/** Horário da cozinha (Configurações): categorias "da cozinha" + semana no
 *  mesmo editor do horário de funcionamento. Fora do horário, os itens dessas
 *  categorias ficam "Cozinha fechada" no cardápio; bebidas seguem vendendo. */
export function KitchenHoursCard({
  initial,
  onSaved,
}: {
  initial: KitchenConfig;
  onSaved: (cfg: KitchenConfig) => void;
}) {
  const { menu, toast } = usePanel();
  const t = useTranslations("panel.kitchen");
  const tcat = useTranslations("panel.cat");
  const [hours, setHours] = useState<WeekSchedule>(initial.hours);
  const [cats, setCats] = useState<string[]>(initial.categories);
  const [saving, startSaving] = useTransition();

  // Opções: categorias fixas do cardápio + qualquer outra que já exista nos itens.
  const options = useMemo(
    () => [...new Set([...Object.keys(CATS), ...menu.map((m) => m.cat), ...initial.categories])],
    [menu, initial.categories],
  );
  const label = (c: string) => (tcat.has(c) ? tcat(c) : c);

  const toggleCat = (c: string) =>
    setCats((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));

  const save = () =>
    startSaving(async () => {
      try {
        const r = await saveKitchenConfigAction(hours, cats);
        if (r.ok && r.config) {
          onSaved(r.config);
          toast(t("saved"));
        } else toast(t("saveError"));
      } catch {
        toast(t("saveError"));
      }
    });

  const active = kitchenConfigured({ hours, categories: cats });

  return (
    <div>
      <p className="m-0 -mt-2 mb-3 text-xs text-ink/50">{t("hint")}</p>

      <p className="m-0 mb-2 text-[11px] font-bold uppercase tracking-wide text-ink/45">
        {t("categories")}
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {options.map((c) => {
          const on = cats.includes(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => toggleCat(c)}
              aria-pressed={on}
              className="flex items-center gap-1 rounded-full border-2 px-3 py-1.5 text-xs font-bold"
              style={
                on
                  ? { background: "#141821", borderColor: "#141821", color: "#EDD8A3" }
                  : { background: "#fff", borderColor: "rgba(20,24,33,.12)", color: "rgba(20,24,33,.6)" }
              }
            >
              {on && <Icon name="check" size={13} />}
              {label(c)}
            </button>
          );
        })}
      </div>

      <p className="m-0 mb-2 text-[11px] font-bold uppercase tracking-wide text-ink/45">
        {t("hours")}
      </p>
      <WeeklyHoursEditor value={hours} onChange={setHours} />

      <p
        className="m-0 mt-3 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium"
        style={
          active
            ? { background: "#ecfdf5", color: "#047857" }
            : { background: "#f8fafc", color: "#64748b" }
        }
      >
        <Icon name={active ? "soup_kitchen" : "info"} size={14} />
        {active ? t("statusActive") : t("statusInactive")}
      </p>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-3 w-full rounded-xl bg-ink p-3 text-sm font-semibold text-sand disabled:opacity-60"
      >
        {saving ? t("saving") : t("save")}
      </button>
    </div>
  );
}
