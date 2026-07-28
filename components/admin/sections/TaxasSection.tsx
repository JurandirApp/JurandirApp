"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { feeNum } from "@/lib/data/admin";
import { money } from "@/lib/panel/helpers";
import { useAdmin } from "../context";

export function TaxasSection() {
  const { ests, updateFee } = useAdmin();
  const t = useTranslations("admin.taxas");
  const td = useTranslations("admin.dashboard");

  return (
    <div>
      <div className="mb-4 rounded-2xl bg-ink p-4 text-sand">
        <h2 className="m-0 mb-1 flex items-center gap-1.5 font-display text-base font-extrabold">
          <Icon name="percent" size={16} className="text-sun" />
          {t("title")}
        </h2>
        <p className="m-0 text-sm text-sand/70">
          {t.rich("desc", { b: (c) => <b>{c}</b> })}
        </p>
      </div>

      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(auto-fill,minmax(440px,1fr))" }}
      >
        {ests.map((e) => (
          <div
            key={e.id}
            className="flex items-center justify-between gap-3 rounded-xl border-2 border-ink bg-white p-3 shadow-hard"
          >
            <div className="min-w-0">
              <p className="m-0 flex items-center gap-1.5 text-sm font-semibold">
                {e.name}
                {e.isLive && (
                  <span className="rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-bold text-sand">
                    {td("live")}
                  </span>
                )}
              </p>
              <p className="m-0 text-xs text-ink/50">
                {t("feeEst")}{" "}
                <b className="text-[#059669]">
                  {money((e.revenue * feeNum(e.fee)) / 100)}
                </b>
              </p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1">
              <FeeInput value={e.fee} onCommit={(v) => updateFee(e.id, v)} />
              <span className="text-sm text-ink/50">%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeeInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      className="w-16 rounded-lg border-2 border-ink/15 p-2 text-right text-sm outline-none focus:border-ink"
    />
  );
}
