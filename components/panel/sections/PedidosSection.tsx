"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import type { Order } from "@/lib/data/panel";
import {
  fmtDateTime,
  money,
  orderTotal,
  padId,
  statusColors,
} from "@/lib/panel/helpers";
import { usePanel } from "../context";

const pillStyle = (active: boolean) =>
  active
    ? { background: "#141821", color: "#EDD8A3" }
    : { background: "#fff", color: "rgba(20,24,33,.6)" };

export function PedidosSection() {
  const {
    orders,
    orderFilter,
    setOrderFilter,
    ordersPeriod,
    setOrdersPeriod,
    dayStartSet,
    setTab,
  } = usePanel();
  const t = useTranslations("panel.pedidos");
  const [cFrom, setCFrom] = useState("");
  const [cTo, setCTo] = useState("");

  // Pix expirado sai do "aguardando" (QR morto no MP) → não superlota a lista.
  const agu = orders.filter((o) => o.st === "aguardando" && !o.expired);
  const prod = orders.filter((o) => o.st === "producao");
  const ent = orders.filter((o) => o.st === "entregue");
  const exp = orders.filter((o) => o.expired);

  const filters: [string, string, number][] = [
    ["todos", t("filterTodos"), orders.length],
    ["producao", t("filterProducao"), prod.length],
    ["entregue", t("filterEntregue"), ent.length],
    ["aguardando", t("filterAguardando"), agu.length],
    ...(exp.length
      ? [["expirado", t("filterExpirado"), exp.length] as [string, string, number]]
      : []),
  ];

  const groups: {
    key: string;
    title: string;
    color: string;
    dot: string | null;
    opacity: number;
    cards: Order[];
  }[] = [];
  const F = orderFilter;
  // Ordem: Em produção (o que a cozinha precisa fazer) → Entregues → Aguardando
  // pagamento → Expirados.
  if ((F === "todos" || F === "producao") && prod.length)
    groups.push({ key: "prod", title: t("groupProduction"), color: "rgba(20,24,33,.6)", dot: "#fbbf24", opacity: 1, cards: prod });
  if ((F === "todos" || F === "entregue") && ent.length)
    groups.push({ key: "ent", title: t("groupDelivered"), color: "rgba(20,24,33,.6)", dot: null, opacity: 0.7, cards: ent });
  if ((F === "todos" || F === "aguardando") && agu.length)
    groups.push({ key: "agu", title: t("groupAwaiting"), color: "#e11d48", dot: "#fb7185", opacity: 1, cards: agu });
  if ((F === "todos" || F === "expirado") && exp.length)
    groups.push({ key: "exp", title: t("groupExpired"), color: "rgba(20,24,33,.45)", dot: null, opacity: 0.6, cards: exp });

  return (
    <div>
      {/* Aviso: o dono ainda não preencheu o horário de funcionamento (importante
          pro filtro Hoje/Ontem, principalmente em bar que vira a noite). */}
      {!dayStartSet && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-3.5 py-2.5">
          <Icon name="schedule" size={18} className="flex-none text-[#b45309]" />
          <div className="min-w-0 flex-1">
            <p className="m-0 text-sm font-bold text-[#92400e]">
              {t("dayStartBannerTitle")}
            </p>
            <p className="m-0 text-xs leading-snug text-[#92400e]/80">
              {t("dayStartBannerText")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTab("perfil")}
            className="flex-none rounded-lg bg-[#b45309] px-3 py-1.5 text-xs font-bold text-white"
          >
            {t("dayStartBannerConfigure")}
          </button>
        </div>
      )}

      {/* Filtro de período — respeita o "início do dia" configurado. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(
          [
            ["hoje", "periodToday"],
            ["ontem", "periodYesterday"],
            ["d7", "period7d"],
          ] as const
        ).map(([k, key]) => (
          <button
            key={k}
            type="button"
            onClick={() => setOrdersPeriod({ kind: k })}
            className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium"
            style={pillStyle(ordersPeriod.kind === k)}
          >
            {t(key)}
          </button>
        ))}
        <div
          className="ml-1 flex items-center gap-1.5 rounded-full border-2 bg-white px-2.5 py-1"
          style={{
            borderColor: ordersPeriod.kind === "custom" ? "#141821" : "rgba(20,24,33,.12)",
          }}
        >
          <Icon name="calendar_month" size={15} className="text-ink/40" />
          <input
            type="date"
            value={cFrom}
            onChange={(e) => setCFrom(e.target.value)}
            aria-label={t("periodFrom")}
            className="w-[112px] bg-transparent text-xs font-medium text-ink/70 outline-none"
          />
          <span className="text-xs text-ink/40">{t("periodTo")}</span>
          <input
            type="date"
            value={cTo}
            onChange={(e) => setCTo(e.target.value)}
            aria-label={t("periodToDate")}
            className="w-[112px] bg-transparent text-xs font-medium text-ink/70 outline-none"
          />
          <button
            type="button"
            disabled={!cFrom || !cTo}
            onClick={() =>
              cFrom && cTo && setOrdersPeriod({ kind: "custom", from: cFrom, to: cTo })
            }
            className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-bold text-sand disabled:opacity-40"
          >
            {t("periodApply")}
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto">
        {filters.map(([id, label, n]) => (
          <button
            key={id}
            type="button"
            onClick={() => setOrderFilter(id)}
            className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium"
            style={pillStyle(F === id)}
          >
            {label} <span className="opacity-55">({n})</span>
          </button>
        ))}
      </div>

      {groups.map((g) => (
        <div key={g.key}>
          <h2
            className="m-0 mb-2 flex items-center gap-1.5 text-sm font-semibold"
            style={{ color: g.color }}
          >
            {g.dot && (
              <span
                className="h-2 w-2 animate-pulse-soft rounded-full"
                style={{ background: g.dot }}
              />
            )}
            {g.title} ({g.cards.length})
          </h2>
          <div
            className="mb-6 grid gap-3"
            style={{
              gridTemplateColumns: "repeat(auto-fill,minmax(330px,1fr))",
              opacity: g.opacity,
            }}
          >
            {g.cards.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </div>
        </div>
      ))}

      {orders.length === 0 && (
        <div className="mt-8 flex flex-col items-center px-6 py-14 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-ink bg-white shadow-hard">
            <Icon name="receipt_long" size={30} className="text-ink" />
          </div>
          <h2 className="m-0 font-display text-xl font-extrabold uppercase tracking-[-0.01em] text-ink">
            {t("emptyOrdersTitle")}
          </h2>
          <p className="m-0 mt-2 max-w-[380px] text-sm leading-relaxed text-ink/50">
            {t("emptyOrdersText")}
          </p>
          <button
            type="button"
            onClick={() => setTab("qrcodes")}
            className="mt-5 flex items-center gap-1.5 rounded-xl border-2 border-ink bg-sand px-4 py-2.5 text-sm font-bold text-ink shadow-hard"
          >
            <Icon name="qr_code_2" size={16} />
            {t("emptyOrdersCta")}
          </button>
        </div>
      )}

      {orders.length > 0 && groups.length === 0 && (
        <div className="py-12 text-center text-sm text-ink/40">
          {t("emptyStatus")}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order: o }: { order: Order }) {
  const { deliverOrder, printOrder, beach } = usePanel();
  const t = useTranslations("panel.pedidos");
  const ts = useTranslations("panel.status");
  const tp = useTranslations("panel.pay");
  const total = orderTotal(o);
  const inc = o.st === "aguardando" && !o.expired;
  const [badgeBg, badgeFg] = statusColors(o);
  const methodLabel = o.splits ? t("splitPayment") : tp(o.pay);

  return (
    <div
      className="rounded-2xl bg-white p-4"
      style={{
        border: "2px solid #141821",
        boxShadow: inc
          ? "4px 4px 0 0 #141821, 0 0 0 1px #fecdd3"
          : "4px 4px 0 0 #141821",
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-display font-bold">
          {t("order", { id: padId(o.id) })}{" "}
          <span className="ml-1 font-mono text-[11px] font-medium text-ink/40">
            {o.code}
          </span>
        </span>
        <span
          className="whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-medium"
          style={{ background: badgeBg, color: badgeFg }}
        >
          {o.expired ? ts("expirado") : ts(o.st)}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink/50">
        <span className="flex items-center gap-1 font-semibold text-ink/70">
          <Icon name="location_on" size={14} />
          {o.loc}
        </span>
        {beach && o.posto && (
          <span className="flex items-center gap-1 rounded-full bg-ocean-900/10 px-2 py-0.5 font-bold text-ocean-900">
            <Icon name="near_me" size={13} />
            {o.posto}
          </span>
        )}
        {o.cust && (
          <span className="flex items-center gap-1 font-semibold text-ocean-700">
            <Icon name="person" size={14} />
            {o.cust}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Icon name="schedule" size={14} />
          {fmtDateTime(o.ts)}
        </span>
      </div>

      <div className="mb-3 flex flex-col gap-1">
        {o.items.map((i, k) => (
          <div key={k} className="flex justify-between gap-2 text-sm">
            <span>
              {i[0]}× {i[1]}
            </span>
            <span className="text-ink/50">{money(i[0] * i[2])}</span>
          </div>
        ))}
      </div>

      {o.note && (
        <div className="mb-3 flex gap-1.5 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-2.5 py-2 text-xs text-[#92400e]">
          <Icon name="chat" size={15} className="mt-px flex-shrink-0" />
          <span>
            <b>{t("note")}</b> {o.note}
          </span>
        </div>
      )}

      {inc && o.splits && (
        <div className="mb-3 rounded-lg border border-[#fecdd3] bg-[#fff1f2] p-2.5">
          <div className="mb-1 flex justify-between text-xs font-medium text-[#be123c]">
            <span>
              {t("splitProgress", {
                paid: o.splits.paid,
                people: o.splits.people,
              })}
            </span>
            <span>
              {t("splitAmount", {
                paid: money(o.splits.paidAmt),
                total: money(total),
              })}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#ffe4e6]">
            <div
              className="h-full rounded-full bg-[#fb7185]"
              style={{ width: `${Math.round((o.splits.paidAmt / total) * 100)}%` }}
            />
          </div>
          <p className="m-0 mt-1.5 flex items-center gap-1 text-[11px] text-[#e11d48]">
            <Icon name="hourglass_top" size={12} />
            {t("splitWarning")}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-ink/10 pt-3">
        <div>
          {o.expired ? (
            <span className="flex items-center gap-1 text-xs font-medium text-ink/50">
              <Icon name="block" size={14} />
              {t("expiredNote")}
            </span>
          ) : (
            <>
              <span
                className="font-bold"
                style={{ color: inc ? "#e11d48" : "#141821" }}
              >
                {money(inc ? (o.splits ? o.splits.paidAmt : 0) : total)}
              </span>
              <span className="ml-2 text-xs text-ink/50">
                {inc
                  ? t("received", { method: methodLabel })
                  : t("via", { method: methodLabel })}
              </span>
              {o.card && (
                <div className="mt-1 flex items-center gap-1 text-xs text-ink/60">
                  <Icon name="credit_card" size={13} className="text-ink/40" />
                  {o.card}
                </div>
              )}
            </>
          )}
        </div>
        {!inc && !o.expired && (
          <div className="flex flex-shrink-0 gap-2">
            <button
              type="button"
              onClick={() => printOrder(o.id)}
              className="flex items-center gap-1 rounded-lg bg-dune-50 px-3 py-1.5 text-xs font-medium text-ink/70"
            >
              <Icon name="print" size={14} />
              {t("print")}
            </button>
            {o.st === "producao" && (
              <button
                type="button"
                onClick={() => deliverOrder(o.id)}
                className="flex items-center gap-1 rounded-lg bg-[#10b981] px-3 py-1.5 text-xs font-medium text-white"
              >
                <Icon name="check" size={14} />
                {t("deliver")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
