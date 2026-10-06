"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { money } from "@/lib/panel/helpers";
import { listDebitPayoutAction, type DebitPayoutPeriod } from "@/lib/actions/admin";

type Row = Awaited<ReturnType<typeof listDebitPayoutAction>>[number];

const PERIODS: DebitPayoutPeriod[] = ["hoje", "7d", "30d", "tudo"];

/** Relatório read-only: quanto repassar (Pix) a cada bar do débito Pagar.me pago. */
export function RepasseDebitoSection() {
  const t = useTranslations("admin.repasseDebito");
  const [period, setPeriod] = useState<DebitPayoutPeriod>("hoje");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(false);
    listDebitPayoutAction(period)
      .then((r) => !cancelled && setRows(r))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [period]);

  const total = (rows ?? []).reduce((s, r) => s + r.aRepassar, 0);

  return (
    <div>
      <div className="mb-4 rounded-2xl bg-ink p-4 text-sand">
        <h2 className="m-0 mb-1 flex items-center gap-1.5 font-display text-base font-extrabold">
          <Icon name="payments" size={16} className="text-sun" />
          {t("title")}
        </h2>
        <p className="m-0 text-sm text-sand/70">{t("desc")}</p>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`rounded-full border-2 border-ink px-3 py-1.5 text-sm font-semibold ${
              period === p ? "bg-ink text-sand" : "bg-white text-ink"
            }`}
          >
            {t(p)}
          </button>
        ))}
      </div>

      {error ? (
        <p className="text-sm text-red-600">{t("error")}</p>
      ) : rows === null ? (
        <p className="text-sm text-ink/50">{t("loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink/50">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border-2 border-ink bg-white shadow-hard">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-ink text-left text-xs uppercase text-ink/60">
                <th className="px-3 py-2">{t("bar")}</th>
                <th className="px-3 py-2 text-right">{t("qtd")}</th>
                <th className="px-3 py-2 text-right">{t("bruto")}</th>
                <th className="px-3 py-2 text-right">{t("taxa")}</th>
                <th className="px-3 py-2 text-right">{t("repassar")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.establishmentId} className="border-b border-ink/10">
                  <td className="px-3 py-2 font-semibold">{r.nome}</td>
                  <td className="px-3 py-2 text-right">{r.qtd}</td>
                  <td className="px-3 py-2 text-right">{money(r.bruto)}</td>
                  <td className="px-3 py-2 text-right">{money(r.taxa)}</td>
                  <td className="px-3 py-2 text-right font-bold">{money(r.aRepassar)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td className="px-3 py-2" colSpan={4}>
                  {t("total")}
                </td>
                <td className="px-3 py-2 text-right">{money(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
