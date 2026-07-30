"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { money, padId } from "@/lib/panel/helpers";
import { PAY_IDS, PM, isComingSoon } from "@/lib/data/app";
import { paidAmount, paidCount } from "@/lib/app/helpers";
import { useApp } from "../context";

export function MyOrdersScreen() {
  const { est, loc, myOrders, exp, toggleExp, payShare, goMenu, openOrder } = useApp();
  const t = useTranslations("app");
  const tShort = useTranslations("app.payShort");

  return (
    <div className="px-4 pb-10 pt-5">
      {/* Tab toggle */}
      <div
        className="mb-4 flex gap-1 rounded-xl bg-white p-1"
        style={{ boxShadow: "0 4px 12px -6px rgba(12,67,71,.15)" }}
      >
        <button
          type="button"
          onClick={goMenu}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-transparent py-2 text-sm font-semibold text-ink/50"
        >
          <Icon name="restaurant" size={15} />
          {t("tabMenu")}
        </button>
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-coral py-2 text-sm font-medium text-white"
        >
          <Icon name="space_dashboard" size={15} />
          {myOrders.length > 0 ? t("tabOrdersCount", { n: myOrders.length }) : t("tabOrders")}
        </button>
      </div>

      <h1 className="m-0 mx-1 mb-1 font-display text-2xl font-extrabold uppercase tracking-[-0.02em]">
        {t("myOrdersTitle")}
      </h1>
      <p className="m-0 mx-1 mb-4 flex items-center gap-1 text-sm text-[#94a3b8]">
        <Icon name="storefront" size={13} />
        {est.name}
      </p>

      {myOrders.length === 0 && (
        <div className="py-16 text-center text-[#94a3b8]">
          <Icon name="space_dashboard" size={40} className="mb-3 block opacity-40" />
          <p className="m-0">{t("moEmpty")}</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {myOrders.map((o) => {
          const inc = o.status === "aguardando" && !o.expired;
          const meta = o.expired
            ? { key: "statusExpired", bg: "#f1f5f9", fg: "#64748b" }
            : inc
              ? { key: "statusPending", bg: "#ffe4e6", fg: "#be123c" }
              : o.status === "producao"
                ? { key: "statusPaid", bg: "#fef3c7", fg: "#b45309" }
                : { key: "statusDelivered", bg: "#d1fae5", fg: "#047857" };
          const incomplete = inc && !!o.splits;
          const grand = o.grand;
          const nPaid = o.splits ? paidCount(o.splits) : 0;
          const oPaid = o.splits ? paidAmount(o.splits) : 0;
          const isExp = exp === o.id;
          const time = new Date(o.ts).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          });

          return (
            <div
              key={o.id}
              className="rounded-2xl bg-white p-4"
              style={{
                boxShadow: inc
                  ? "0 4px 12px -6px rgba(12,67,71,.15),0 0 0 1px #fecdd3"
                  : "0 4px 12px -6px rgba(12,67,71,.15)",
              }}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="font-bold">
                  {t("orderNum", { id: padId(o.id) })}{" "}
                  <span className="ml-1 font-mono text-[11px] font-medium text-[#94a3b8]">
                    {o.code}
                  </span>
                </span>
                <span
                  className="rounded-full px-2 py-1 text-[11px] font-medium"
                  style={{ background: meta.bg, color: meta.fg }}
                >
                  {t(meta.key)}
                </span>
              </div>
              <div className="mb-1 flex items-center gap-1 text-xs font-medium text-[#64748b]">
                <Icon name="storefront" size={12} style={{ color: "#FF6B4A" }} />
                {est.name}
              </div>
              <div className="mb-2 flex items-center gap-1 text-xs text-[#94a3b8]">
                <Icon name="location_on" size={12} />
                {loc} · <Icon name="schedule" size={12} />
                {time}
              </div>

              <div className="mb-2 flex flex-col gap-1">
                {o.items.map((i, k) => (
                  <div key={k} className="flex justify-between text-sm">
                    <span>
                      {i.qty}× {i.name}
                    </span>
                    <span className="text-[#94a3b8]">{money(i.price * i.qty)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between border-t border-[#f1f5f9] pt-2 text-sm font-bold">
                <span>{t("total")}</span>
                <span className="text-coral-emph">{money(o.grand)}</span>
              </div>

              {/* Pix cheio aguardando → botão pra retomar o pagamento (ver o QR). */}
              {inc && !o.splits && (
                <button
                  type="button"
                  onClick={() => openOrder(o)}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-coral py-2.5 text-sm font-semibold text-white"
                >
                  <Icon name="qr_code_2" size={16} />
                  {t("moPayNow")}
                </button>
              )}

              {incomplete && o.splits && (
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-[#64748b]">
                    <span>{t("paidCountSplit", { paid: nPaid, people: o.splits.length })}</span>
                    <span>{t("paidAmtOf", { paid: money(oPaid), total: money(grand) })}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#f1f5f9]">
                    <div
                      className="h-full rounded-full bg-[#10b981]"
                      style={{ width: `${Math.round((oPaid / grand) * 100)}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleExp(o.id)}
                    className="mt-3 w-full rounded-xl bg-coral py-2.5 text-sm font-semibold text-white"
                  >
                    {isExp ? t("expandHide") : t("expandComplete")}
                  </button>
                  {isExp && (
                    <div className="mt-3 flex flex-col gap-2">
                      {o.splits.map((s, idx) => (
                        <div key={idx} className="rounded-xl border border-[#e2e8f0] p-2.5">
                          <div className="mb-1.5 flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-sm font-medium">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f1f5f9] text-xs font-bold">
                                {idx + 1}
                              </span>
                              {t("friend", { n: idx + 1 })}
                            </span>
                            {s.m ? (
                              <span className="flex items-center gap-1 text-xs font-medium text-[#059669]">
                                <Icon name="check" size={13} />
                                {t("paidWith", { method: tShort(s.m) })}
                              </span>
                            ) : (
                              <span className="text-xs text-[#94a3b8]">{money(s.amount)}</span>
                            )}
                          </div>
                          {!s.m && (
                            <div className="grid grid-cols-4 gap-1.5">
                              {PAY_IDS.map((id) => {
                                const soon = isComingSoon(id);
                                return (
                                  <button
                                    key={id}
                                    type="button"
                                    disabled={soon}
                                    onClick={() => payShare(o.id, idx, id)}
                                    className="flex flex-col items-center gap-0.5 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] py-1.5 disabled:opacity-50"
                                  >
                                    <Icon name={PM[id].icon} size={15} className="text-[#475569]" />
                                    <span className="text-center text-[9px] leading-none text-[#64748b]">
                                      {soon ? t("comingSoon") : tShort(id)}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {o.status === "producao" && (
                <p className="m-0 mt-2 flex items-center gap-1 text-xs text-[#d97706]">
                  <Icon name="schedule" size={13} />
                  {t("beingPrepared")}
                </p>
              )}
              {o.status === "entregue" && (
                <p className="m-0 mt-2 flex items-center gap-1 text-xs text-[#059669]">
                  <Icon name="check" size={13} />
                  {t("delivered")}
                </p>
              )}
              {o.expired && (
                <p className="m-0 mt-2 flex items-center gap-1 text-xs text-[#94a3b8]">
                  <Icon name="block" size={13} />
                  {t("moExpired")}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
