"use client";

import { useMemo, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Dropdown } from "@/components/ui/Dropdown";
import { Icon } from "@/components/ui/Icon";
import { GW } from "@/lib/data/panel";
import { fmtFull, money, orderTotal, padId, ymd } from "@/lib/panel/helpers";
import { usePanel } from "../context";

const AUD_SIZE = 8;

export function AuditoriaSection() {
  const { orders, aud, setAud, clearAud, audPage, setAudPage } = usePanel();
  const t = useTranslations("panel.audit");
  const tps = useTranslations("panel.payShort");
  const methodLabel = (m: string) => (m === "split" ? t("methodSplit") : tps(m));

  const audAll = useMemo(
    () =>
      [...orders]
        .sort((a, b) => b.ts - a.ts)
        .map((o) => {
          const total = orderTotal(o);
          const charged = total + total * 0.08 + total * 0.1;
          const m = o.splits ? "split" : o.pay;
          const gw = o.splits
            ? (o.splits.paidAmt * GW.pix) / 100
            : (charged * GW[o.pay]) / 100;
          return { o, m, charged, gw };
        }),
    [orders],
  );

  const filtered = audAll.filter((r) => {
    const y = ymd(r.o.ts);
    if (aud.from && y < aud.from) return false;
    if (aud.to && y > aud.to) return false;
    if (aud.mesa && r.o.loc !== aud.mesa) return false;
    if (aud.method && r.m !== aud.method) return false;
    return true;
  });

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / AUD_SIZE));
  const page = Math.min(Math.max(1, audPage), pages);
  const start = (page - 1) * AUD_SIZE;
  const rows = filtered.slice(start, start + AUD_SIZE);
  const totals = filtered.reduce(
    (s, r) => ({ g: s.g + r.gw, v: s.v + r.charged }),
    { g: 0, v: 0 },
  );

  const mesaOptions = [...new Set(audAll.map((r) => r.o.loc))].sort();
  const methodOptions = [...new Set(audAll.map((r) => r.m))];
  const hasFilter = Boolean(aud.from || aud.to || aud.mesa || aud.method);

  return (
    <div>
      <div className="mb-4 rounded-2xl bg-ink p-4 text-sand">
        <h2 className="m-0 flex items-center gap-1.5 font-display text-base font-extrabold">
          <Icon name="receipt_long" size={16} className="text-sun" />
          {t("title")}
        </h2>
        <p className="m-0 mt-1 text-xs text-sand/70">{t("description")}</p>
      </div>

      {/* Filters */}
      <div className="mb-4 rounded-2xl border-2 border-ink bg-white p-4 shadow-hard">
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}
        >
          <FilterLabel label={t("from")}>
            <input
              type="date"
              value={aud.from}
              onChange={(e) => setAud("from", e.target.value)}
              className="mt-1 w-full rounded-lg border-2 border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-ink"
            />
          </FilterLabel>
          <FilterLabel label={t("to")}>
            <input
              type="date"
              value={aud.to}
              onChange={(e) => setAud("to", e.target.value)}
              className="mt-1 w-full rounded-lg border-2 border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-ink"
            />
          </FilterLabel>
          <FilterLabel label={t("table")}>
            <FilterDd
              value={aud.mesa}
              display={aud.mesa || t("all")}
              options={[
                { value: "", label: t("all") },
                ...mesaOptions.map((m) => ({ value: m, label: m })),
              ]}
              onChange={(v) => setAud("mesa", v)}
            />
          </FilterLabel>
          <FilterLabel label={t("method")}>
            <FilterDd
              value={aud.method}
              display={aud.method ? methodLabel(aud.method) : t("all")}
              options={[
                { value: "", label: t("all") },
                ...methodOptions.map((m) => ({ value: m, label: methodLabel(m) })),
              ]}
              onChange={(v) => setAud("method", v)}
            />
          </FilterLabel>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-ink/60">
            {t("count", { shown: total, total: audAll.length })}
          </span>
          {hasFilter && (
            <button
              type="button"
              onClick={clearAud}
              className="flex items-center gap-1 bg-transparent p-0 text-xs font-bold text-ink/60"
            >
              <Icon name="close" size={13} />
              {t("clearFilters")}
            </button>
          )}
        </div>
      </div>

      {total === 0 ? (
        <div className="rounded-2xl border-2 border-ink bg-white p-10 text-center text-sm text-ink/50 shadow-hard">
          {t("empty")}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border-2 border-ink bg-white shadow-hard">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-ink">
                  <Th>{t("colDateTime")}</Th>
                  <Th>{t("colOrder")}</Th>
                  <Th>{t("colTable")}</Th>
                  <Th>{t("colItems")}</Th>
                  <Th>{t("colPayment")}</Th>
                  <Th right>{t("colGateway")}</Th>
                  <Th right>{t("colValue")}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr
                    key={r.o.id}
                    style={{
                      background: (start + ri) % 2 === 0 ? "#fff" : "rgba(237,216,163,.16)",
                    }}
                  >
                    <td className="whitespace-nowrap px-4 py-3 align-middle text-ink/70">
                      {fmtFull(r.o.ts)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-middle">
                      <span className="font-bold">#{padId(r.o.id, 2)}</span>{" "}
                      <span className="font-mono text-[11px] text-ink/40">
                        {r.o.code}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-middle text-ink/65">
                      <span className="flex items-center gap-1">
                        <Icon name="location_on" size={13} className="text-coral" />
                        {r.o.loc}
                      </span>
                    </td>
                    <td className="min-w-[200px] px-4 py-3 align-middle text-ink/65">
                      {r.o.items.map((i) => `${i[0]}× ${i[1]}`).join(", ")}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-middle text-ink/75">
                      {r.m === "split"
                        ? t("split", { people: r.o.splits!.people })
                        : methodLabel(r.m)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right align-middle text-ink/55">
                      {money(r.gw)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right align-middle font-bold">
                      {money(r.charged)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-sand/45 font-extrabold">
                  <td colSpan={5} className="border-t-2 border-ink px-4 py-3.5">
                    {t("total", { count: total })}
                  </td>
                  <td className="whitespace-nowrap border-t-2 border-ink px-4 py-3.5 text-right">
                    {money(totals.g)}
                  </td>
                  <td className="whitespace-nowrap border-t-2 border-ink px-4 py-3.5 text-right text-coral-emph">
                    {money(totals.v)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {pages > 1 && (
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-ink/55">
            {t("showing", {
              from: total === 0 ? 0 : start + 1,
              to: Math.min(start + AUD_SIZE, total),
              total,
            })}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label={t("prev")}
              onClick={() => setAudPage(Math.max(1, page - 1))}
              className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border-2 border-ink/15 bg-white text-ink"
              style={{ opacity: page <= 1 ? 0.4 : 1 }}
            >
              <Icon name="chevron_left" size={18} />
            </button>
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setAudPage(n)}
                className="h-[34px] min-w-[34px] rounded-[10px] border-2 px-2 text-sm font-bold"
                style={{
                  background: n === page ? "#141821" : "#fff",
                  color: n === page ? "#EDD8A3" : "rgba(20,24,33,.7)",
                  borderColor: n === page ? "#141821" : "rgba(20,24,33,.15)",
                }}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              aria-label={t("next")}
              onClick={() => setAudPage(Math.min(pages, page + 1))}
              className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border-2 border-ink/15 bg-white text-ink"
              style={{ opacity: page >= pages ? 0.4 : 1 }}
            >
              <Icon name="chevron_right" size={18} />
            </button>
          </div>
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

function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-4 py-3 text-[11px] font-bold uppercase tracking-[.06em] text-sand/85 ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
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
