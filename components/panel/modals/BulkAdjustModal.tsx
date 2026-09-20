"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { type MenuItem } from "@/lib/data/panel";
import { money } from "@/lib/panel/helpers";
import { bulkAdjustPricesAction } from "@/lib/actions/panel";
import type { ItemChange, RoundingMode } from "@/lib/pricing/bulk-adjust";

const ROUNDINGS: { mode: RoundingMode; key: string }[] = [
  { mode: "exact", key: "roundExact" },
  { mode: "end90", key: "roundEnd90" },
  { mode: "end99", key: "roundEnd99" },
  { mode: "whole", key: "roundWhole" },
];

interface Props {
  menu: MenuItem[];
  onClose: () => void;
  /** Chamado com as mudanças aplicadas: o PanelApp atualiza o estado + toast. */
  onApplied: (changes: ItemChange[]) => void;
  onError: () => void;
}

export function BulkAdjustModal({ menu, onClose, onApplied, onError }: Props) {
  const t = useTranslations("panel.bulkAdjust");
  const tcat = useTranslations("panel.cat");
  const tsub = useTranslations("panel.sub");

  const [cat, setCat] = useState("");
  const [sub, setSub] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dir, setDir] = useState<"up" | "down">("up");
  const [percentStr, setPercentStr] = useState("");
  const [rounding, setRounding] = useState<RoundingMode>("exact");
  const [includeAddons, setIncludeAddons] = useState(false);
  const [preview, setPreview] = useState<ItemChange[] | null>(null);
  const [busy, setBusy] = useState(false);

  // Só dá pra ajustar item já persistido (tem dbId).
  const items = useMemo(() => menu.filter((m) => m.dbId), [menu]);
  const cats = useMemo(() => [...new Set(items.map((m) => m.cat))], [items]);
  const subs = useMemo(
    () => [...new Set(items.filter((m) => !cat || m.cat === cat).map((m) => m.sub))],
    [items, cat],
  );
  const filtered = useMemo(
    () => items.filter((m) => (!cat || m.cat === cat) && (!sub || m.sub === sub)),
    [items, cat, sub],
  );

  const percent = useMemo(() => {
    const n = Number(percentStr.replace(",", "."));
    if (!Number.isFinite(n) || n === 0) return null;
    return dir === "up" ? Math.abs(n) : -Math.abs(n);
  }, [percentStr, dir]);

  const canPreview = selected.size > 0 && percent != null && !busy;

  // Qualquer mudança de parâmetro invalida a prévia (força reconferir antes de aplicar).
  const invalidate = () => setPreview(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    invalidate();
  }
  function selectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      filtered.forEach((m) => next.add(m.dbId!));
      return next;
    });
    invalidate();
  }
  function clearAll() {
    setSelected(new Set());
    invalidate();
  }

  async function run(dryRun: boolean) {
    if (percent == null || selected.size === 0) return;
    setBusy(true);
    try {
      const r = await bulkAdjustPricesAction({
        itemIds: [...selected],
        percent,
        rounding,
        includeAddons,
        dryRun,
      });
      if (!r.ok || !r.changes) {
        onError();
        return;
      }
      if (dryRun) {
        setPreview(r.changes);
      } else {
        onApplied(r.changes);
        onClose();
      }
    } catch {
      onError();
    } finally {
      setBusy(false);
    }
  }

  const catLabel = (c: string) => {
    try {
      return tcat(c);
    } catch {
      return c;
    }
  };
  const subLabel = (s: string) => {
    try {
      return tsub(s);
    } catch {
      return s;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4">
      <div className="box-border flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-white">
        <div className="flex items-center justify-between border-b border-ink/10 p-5 pb-3">
          <div>
            <h2 className="m-0 font-display text-lg font-bold">{t("title")}</h2>
            <p className="m-0 mt-0.5 text-xs text-ink/50">{t("subtitle")}</p>
          </div>
          <button
            type="button"
            aria-label={t("cancel")}
            onClick={onClose}
            className="bg-transparent p-0 text-ink/40"
          >
            <Icon name="close" size={22} />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto p-5">
          {/* 1. Seleção */}
          <section>
            <h3 className="m-0 mb-2 text-sm font-bold text-ink/70">{t("step1")}</h3>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={cat}
                onChange={(e) => {
                  setCat(e.target.value);
                  setSub("");
                }}
                className="rounded-xl border-2 border-ink bg-white px-3 py-2 text-sm"
              >
                <option value="">{t("allCats")}</option>
                {cats.map((c) => (
                  <option key={c} value={c}>
                    {catLabel(c)}
                  </option>
                ))}
              </select>
              <select
                value={sub}
                onChange={(e) => setSub(e.target.value)}
                className="rounded-xl border-2 border-ink bg-white px-3 py-2 text-sm"
              >
                <option value="">{t("allSubs")}</option>
                {subs.map((s) => (
                  <option key={s} value={s}>
                    {subLabel(s)}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border-2 border-ink/15">
              {filtered.map((m) => (
                <label
                  key={m.dbId}
                  className="flex cursor-pointer items-center gap-2 border-b border-ink/5 px-3 py-2 text-sm last:border-b-0 hover:bg-dune-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(m.dbId!)}
                    onChange={() => toggle(m.dbId!)}
                    className="h-4 w-4 accent-coral"
                  />
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  <span className="text-xs text-ink/50">{money(m.price)}</span>
                </label>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink/60">
                {t("selectedCount", { count: selected.size })}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="rounded-lg bg-dune-50 px-2.5 py-1 text-xs font-medium text-ink/70"
                >
                  {t("selectAllFiltered", { count: filtered.length })}
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-lg bg-dune-50 px-2.5 py-1 text-xs font-medium text-ink/70"
                >
                  {t("clear")}
                </button>
              </div>
            </div>
          </section>

          {/* 2. Ajuste */}
          <section>
            <h3 className="m-0 mb-2 text-sm font-bold text-ink/70">{t("step2")}</h3>
            <div className="grid grid-cols-[1fr_130px] gap-2">
              <div className="flex overflow-hidden rounded-xl border-2 border-ink">
                {(["up", "down"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setDir(d);
                      invalidate();
                    }}
                    className={`flex-1 px-2 py-2 text-sm font-medium ${
                      dir === d ? "bg-ink text-dune" : "bg-white text-ink/60"
                    }`}
                  >
                    {d === "up" ? t("increase") : t("decrease")}
                  </button>
                ))}
              </div>
              <div className="flex items-center rounded-xl border-2 border-ink px-3">
                <input
                  inputMode="decimal"
                  value={percentStr}
                  onChange={(e) => {
                    setPercentStr(e.target.value.replace(/[^\d.,]/g, ""));
                    invalidate();
                  }}
                  placeholder="20"
                  aria-label={t("percent")}
                  className="w-full border-0 py-2 text-sm outline-none"
                />
                <span className="text-sm font-bold text-ink/50">%</span>
              </div>
            </div>

            <p className="m-0 mb-1 mt-3 text-xs font-medium text-ink/60">{t("rounding")}</p>
            <div className="flex flex-wrap gap-2">
              {ROUNDINGS.map(({ mode, key }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setRounding(mode);
                    invalidate();
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    rounding === mode ? "bg-ink text-dune" : "bg-dune-50 text-ink/70"
                  }`}
                >
                  {t(key)}
                </button>
              ))}
            </div>

            <label className="mt-3 flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={includeAddons}
                onChange={(e) => {
                  setIncludeAddons(e.target.checked);
                  invalidate();
                }}
                className="mt-0.5 h-4 w-4 accent-coral"
              />
              <span>
                <span className="text-sm font-medium">{t("includeAddons")}</span>
                <span className="mt-0.5 block text-xs text-ink/50">{t("includeAddonsHelp")}</span>
              </span>
            </label>
          </section>

          {/* 3. Prévia */}
          {preview && (
            <section>
              <h3 className="m-0 mb-2 text-sm font-bold text-ink/70">{t("step3")}</h3>
              <p className="m-0 mb-2 text-xs font-medium text-ink/60">
                {t("changeCount", { count: preview.length })}
              </p>
              <div className="max-h-52 overflow-y-auto rounded-xl border-2 border-ink/15">
                {preview.map((c) => (
                  <div key={c.id} className="border-b border-ink/5 px-3 py-2 last:border-b-0">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      <span className="whitespace-nowrap text-ink/40 line-through">
                        {money(c.oldPrice)}
                      </span>
                      <Icon name="arrow_forward" size={13} />
                      <span className="whitespace-nowrap font-bold text-emerald-600">
                        {money(c.newPrice)}
                      </span>
                    </div>
                    {c.options.map((o) => (
                      <div
                        key={o.id}
                        className="mt-0.5 flex items-center justify-between gap-2 pl-3 text-xs text-ink/50"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {t("addonRow", { name: o.name })}
                        </span>
                        <span className="whitespace-nowrap line-through">+{money(o.oldDelta)}</span>
                        <Icon name="arrow_forward" size={11} />
                        <span className="whitespace-nowrap font-semibold">+{money(o.newDelta)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          )}

          {!preview && (
            <p className="m-0 rounded-xl bg-dune-50 px-3 py-2 text-xs text-ink/50">{t("hint")}</p>
          )}
        </div>

        <div className="flex gap-2 border-t border-ink/10 p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-dune-50 px-4 py-2.5 text-sm font-medium text-ink/70"
          >
            {t("cancel")}
          </button>
          {preview ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(false)}
              className="flex-1 rounded-xl bg-coral px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? t("applying") : t("apply")}
            </button>
          ) : (
            <button
              type="button"
              disabled={!canPreview}
              onClick={() => run(true)}
              className="flex-1 rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-dune disabled:opacity-40"
            >
              {t("preview")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
