"use client";

import { useTranslations } from "next-intl";
import { feeNum } from "@/lib/data/admin";
import { money } from "@/lib/panel/helpers";
import { useAdmin } from "../context";

const stColors = (status: string): [string, string] =>
  status === "ativo" ? ["#d1fae5", "#047857"] : ["#fef3c7", "#b45309"];

export function FaturamentoSection() {
  const { scopedScaled } = useAdmin();
  const t = useTranslations("admin.faturamento");
  const ts = useTranslations("admin.status");
  const td = useTranslations("admin.dashboard");

  return (
    <div>
      <h2 className="m-0 mb-3 font-display text-base font-bold">
        {t("title")}{" "}
        <span className="text-xs font-normal text-ink/50">· {t("inPeriod")}</span>
      </h2>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(auto-fill,minmax(330px,1fr))" }}
      >
        {scopedScaled.map((e) => {
          const [stBg, stFg] = stColors(e.status);
          return (
            <div
              key={e.id}
              className="rounded-xl border-2 border-ink bg-white p-3 shadow-hard"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="m-0 flex items-center gap-1.5 text-sm font-semibold">
                    {e.name}
                    {e.isLive && (
                      <span className="flex-shrink-0 rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-bold text-sand">
                        {td("live")}
                      </span>
                    )}
                  </p>
                  <p className="m-0 text-xs text-ink/50">
                    {e.owner} · {e.city}
                  </p>
                </div>
                <span
                  className="flex-shrink-0 rounded-full px-2 py-1 text-xs font-medium"
                  style={{ background: stBg, color: stFg }}
                >
                  {ts(e.status)}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Metric label={t("revenue")} value={money(e.pRevenue)} />
                <Metric label={t("orders")} value={e.pOrders.toLocaleString("pt-BR")} />
                <Metric
                  label={t("fee", { fee: e.fee })}
                  value={money((e.pRevenue * feeNum(e.fee)) / 100)}
                  valueColor="#059669"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-lg bg-sand/40 px-1 py-2">
      <p className="m-0 text-[11px] text-ink/50">{label}</p>
      <p
        className="m-0 font-display text-sm font-extrabold"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </p>
    </div>
  );
}
