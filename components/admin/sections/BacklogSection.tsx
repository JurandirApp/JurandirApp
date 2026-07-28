"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Dropdown } from "@/components/ui/Dropdown";
import { Icon } from "@/components/ui/Icon";
import { fmtFull, money } from "@/lib/panel/helpers";
import { useAdmin } from "../context";

type BlFilters = { estab: string; method: string; day: string; item: string; card: string; q: string };
const EMPTY: BlFilters = { estab: "", method: "", day: "", item: "", card: "", q: "" };

function ymd(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function BacklogSection() {
  const { ests, orders } = useAdmin();
  const t = useTranslations("admin.backlog");
  const tm = useTranslations("admin.method");
  const [bl, setBl] = useState<BlFilters>(EMPTY);
  const set = (k: keyof BlFilters, v: string) => setBl((f) => ({ ...f, [k]: v }));

  const rows = useMemo(() => {
    const byId: Record<string, { name: string; city: string }> = {};
    ests.forEach((e) => (byId[e.id] = { name: e.name, city: e.city }));
    return [...orders]
      .sort((a, b) => b.ts - a.ts)
      .map((o) => {
        const est = byId[o.est] ?? { name: "—", city: "—/—" };
        const [city = "—", uf = "—"] = est.city.split("/").map((s) => s.trim());
        return { o, estab: est.name, city, uf, method: o.m };
      });
  }, [ests, orders]);

  const filtered = rows.filter((r) => {
    if (bl.estab && r.estab !== bl.estab) return false;
    if (bl.method && r.method !== bl.method) return false;
    if (bl.day && ymd(r.o.ts) !== bl.day) return false;
    if (bl.item && !r.o.items.toLowerCase().includes(bl.item.toLowerCase())) return false;
    if (bl.card && !r.o.card.toLowerCase().includes(bl.card.toLowerCase())) return false;
    if (bl.q) {
      const hay = [r.o.code, r.estab, r.city, r.uf, tm(r.method), r.o.items, r.o.card]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(bl.q.toLowerCase())) return false;
    }
    return true;
  });

  const estabOptions = [...new Set(rows.map((r) => r.estab))];
  const hasFilter = Boolean(bl.estab || bl.method || bl.day || bl.item || bl.card || bl.q);

  return (
    <div>
      <div className="mb-4 rounded-2xl bg-ink p-4 text-sand">
        <h2 className="m-0 flex items-center gap-1.5 font-display text-base font-extrabold">
          <Icon name="search" size={16} className="text-sun" />
          {t("title")}
        </h2>
        <p className="m-0 mt-1 text-xs text-sand/70">{t("desc")}</p>
      </div>

      <div className="mb-4 rounded-2xl border-2 border-ink bg-white p-4 shadow-hard">
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}
        >
          <FilterLabel label={t("estab")}>
            <FilterDd
              value={bl.estab}
              display={bl.estab || t("all")}
              options={[{ value: "", label: t("all") }, ...estabOptions.map((v) => ({ value: v, label: v }))]}
              onChange={(v) => set("estab", v)}
            />
          </FilterLabel>
          <FilterLabel label={t("method")}>
            <FilterDd
              value={bl.method}
              display={bl.method ? tm(bl.method) : t("all")}
              options={[
                { value: "", label: t("all") },
                ...["credito", "debito", "pix", "usdc", "split"].map((v) => ({ value: v, label: tm(v) })),
              ]}
              onChange={(v) => set("method", v)}
            />
          </FilterLabel>
          <FilterLabel label={t("day")}>
            <input
              type="date"
              value={bl.day}
              onChange={(e) => set("day", e.target.value)}
              className="mt-1 w-full rounded-lg border-2 border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-ink"
            />
          </FilterLabel>
          <FilterLabel label={t("item")}>
            <TextInput value={bl.item} onChange={(v) => set("item", v)} placeholder={t("itemPh")} />
          </FilterLabel>
          <FilterLabel label={t("card")}>
            <TextInput value={bl.card} onChange={(v) => set("card", v)} placeholder={t("cardPh")} />
          </FilterLabel>
          <FilterLabel label={t("freeSearch")}>
            <TextInput value={bl.q} onChange={(v) => set("q", v)} placeholder={t("qPh")} />
          </FilterLabel>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-ink/60">
            {t("count", { shown: filtered.length, total: rows.length })}
          </span>
          {hasFilter && (
            <button
              type="button"
              onClick={() => setBl(EMPTY)}
              className="flex items-center gap-1 bg-transparent p-0 text-xs font-bold text-ink/60"
            >
              <Icon name="close" size={13} />
              {t("clear")}
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-ink bg-white p-10 text-center text-sm text-ink/50 shadow-hard">
          {t("empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border-2 border-ink bg-white shadow-hard">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <Th>{t("colDate")}</Th>
                <Th>{t("colEstab")}</Th>
                <Th>{t("colCity")}</Th>
                <Th>{t("colOrder")}</Th>
                <Th>{t("colCard")}</Th>
                <Th>{t("colMethod")}</Th>
                <Th>{t("colItems")}</Th>
                <Th right>{t("colTotal")}</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.o.code}>
                  <Td className="whitespace-nowrap text-ink/70">{fmtFull(r.o.ts)}</Td>
                  <Td className="whitespace-nowrap font-semibold">{r.estab}</Td>
                  <Td className="whitespace-nowrap text-ink/60">
                    <span className="flex items-center gap-1">
                      <Icon name="location_on" size={13} className="text-ink/40" />
                      {r.city} · {r.uf}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap font-mono text-xs text-ink/70">{r.o.code}</Td>
                  <Td className="whitespace-nowrap text-ink/70">{r.o.card || "—"}</Td>
                  <Td className="whitespace-nowrap text-ink/70">{tm(r.method)}</Td>
                  <Td className="min-w-[200px] text-ink/60">{r.o.items}</Td>
                  <Td className="whitespace-nowrap text-right font-semibold">{money(r.o.total)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold tracking-[.03em] text-coral-emph">
        {label}
      </span>
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="mt-1 w-full rounded-lg border-2 border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink"
    />
  );
}

function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <th
      className={`border-b border-ink/10 px-4 py-3 text-[11px] font-medium uppercase tracking-[.05em] text-ink/50 ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <td className={`border-b border-ink/[0.05] px-4 py-3 align-top ${className}`}>
      {children}
    </td>
  );
}

function FilterDd({
  value,
  display,
  options,
  onChange,
}: {
  value: string;
  display: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <Dropdown
      className="mt-1"
      align="stretch"
      value={value}
      onChange={onChange}
      options={options}
      panelClassName="max-h-[240px] overflow-y-auto"
      renderTrigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="box-border flex w-full items-center justify-between gap-2 rounded-lg border-2 border-ink/15 bg-white px-3 py-2 text-left text-sm font-medium text-ink"
        >
          <span className="flex-1 truncate">{display}</span>
          <Icon
            name="expand_more"
            size={16}
            className="text-ink/40 transition-transform duration-150"
            style={{ transform: open ? "rotate(180deg)" : "none" }}
          />
        </button>
      )}
    />
  );
}
