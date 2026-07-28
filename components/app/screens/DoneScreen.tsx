"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { money } from "@/lib/panel/helpers";
import { paidAmount, type ClientOrder } from "@/lib/app/helpers";
import { useApp } from "../context";

export function DoneScreen() {
  const { lastOrder, loc, goMyOrders, goMenu } = useApp();
  const t = useTranslations("app");
  const tPay = useTranslations("app.pay");
  const L = lastOrder!;

  // Pix cheio que passou dos 15 min: QR morto no MP → estado "expirado".
  const expired = Boolean(L.expired);
  const inc = L.status === "aguardando" && !expired;
  // Conta dividida (splits) vs pagamento cheio (Pix aguardando): a cópia muda —
  // "parcial / assim que todos pagarem" só faz sentido pra conta dividida.
  const isSplit = Boolean(L.splits);
  // Modelo comissão: o cliente paga subtotal + taxa de serviço (a comissão da
  // plataforma NÃO entra no valor pago — sai do que vai pro bar).
  const grand = L.total + L.est;
  const lPaid = L.splits ? paidAmount(L.splits) : 0;

  const title = expired
    ? t("doneTitleExpired")
    : !inc
      ? L.name
        ? t("doneTitleNamed", { name: L.name })
        : t("doneTitle")
      : isSplit
        ? t("doneTitlePartial")
        : t("doneTitleAwaiting");
  const sub = expired
    ? t("doneSubExpired")
    : !inc
      ? t("doneSub")
      : isSplit
        ? t("doneSubPartial")
        : t("doneSubAwaiting");
  const time = new Date(L.ts).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="px-6 py-12 text-center">
      <div
        className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full text-white"
        style={{
          background: expired ? "#ef4444" : inc ? "#f59e0b" : "#10b981",
          boxShadow: "0 10px 30px -10px rgba(0,0,0,.3)",
        }}
      >
        <Icon name={expired ? "block" : inc ? "schedule" : "check"} size={44} />
      </div>
      <h1 className="m-0 font-display text-[28px] font-extrabold uppercase tracking-[-0.02em]">
        {title}
      </h1>
      <p className="m-0 mt-1 text-ink/60">{sub}</p>

      <div
        className="mt-6 rounded-2xl bg-white p-5 text-left"
        style={{ boxShadow: "0 4px 12px -6px rgba(12,67,71,.15)" }}
      >
        <div className="mb-3 flex items-center justify-between rounded-xl bg-[#f8fafc] px-3 py-2">
          <span className="text-xs text-[#94a3b8]">{t("orderCode")}</span>
          <span className="font-mono text-sm font-bold tracking-[.05em] text-[#334155]">
            {L.code}
          </span>
        </div>
        <div className="mb-3 flex flex-wrap justify-between gap-1 text-sm text-[#94a3b8]">
          <span className="flex items-center gap-1">
            <Icon name="location_on" size={13} />
            {loc}
          </span>
          {L.name && (
            <span className="flex items-center gap-1">
              <Icon name="person" size={13} />
              {L.name}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Icon name="schedule" size={13} />
            {time}
          </span>
        </div>

        {L.items.map((i, k) => (
          <div key={k} className="flex justify-between py-1 text-sm">
            <span>
              {i.qty}× {i.name}
            </span>
            <span className="font-medium">{money(i.price * i.qty)}</span>
          </div>
        ))}

        {L.note && (
          <div className="mt-2 flex gap-1.5 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-2.5 py-1.5 text-xs text-[#92400e]">
            <Icon name="chat" size={13} className="mt-px" />
            <span>{L.note}</span>
          </div>
        )}

        {L.est > 0 && (
          <div className="mt-3 flex flex-col gap-1 border-t border-[#f1f5f9] pt-3 text-sm text-[#64748b]">
            <div className="flex justify-between">
              <span>{t("subtotal")}</span>
              <span>{money(L.total)}</span>
            </div>
            <div className="flex justify-between">
              <span>{t("doneFeeEst", { pct: L.total ? Math.round((L.est / L.total) * 100) : 0 })}</span>
              <span>{money(L.est)}</span>
            </div>
          </div>
        )}
        <div className="mt-3 flex justify-between border-t border-[#f1f5f9] pt-3 font-bold">
          <span>
            {expired
              ? t("toPay")
              : !inc
                ? t("paidVia", { label: payLabelOf(L, t, tPay) })
                : isSplit
                  ? t("paidSoFar")
                  : t("toPay")}
          </span>
          <span style={{ color: expired ? "#94a3b8" : inc ? "#d97706" : "#059669" }}>
            {inc && isSplit ? money(lPaid) : money(grand)}
          </span>
        </div>
      </div>

      {inc && L.pixPayload && (
        <div
          className="mt-5 rounded-2xl bg-white p-5 text-center"
          style={{ boxShadow: "0 4px 12px -6px rgba(12,67,71,.15)" }}
        >
          <p className="m-0 font-display text-[15px] font-bold uppercase tracking-[-0.01em]">
            {t("pixTitle")}
          </p>
          {L.pixQrImage && (
            // QR é um data-URI base64; next/image não otimiza data-URI.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`data:image/png;base64,${L.pixQrImage}`}
              alt="QR Pix"
              className="mx-auto mt-3 h-48 w-48 rounded-lg"
            />
          )}
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(L.pixPayload!)}
            className="mt-3 w-full rounded-xl bg-ink py-3 text-[14px] font-bold text-sand"
          >
            {t("pixCopy")}
          </button>
          <p className="m-0 mt-3 text-[13px] text-[#d97706]">{t("pixWaiting")}</p>
        </div>
      )}

      <button
        type="button"
        onClick={goMyOrders}
        className="mt-5 w-full rounded-xl bg-coral py-3.5 text-[15px] font-bold text-white"
      >
        {inc && isSplit ? t("doneBtnComplete") : t("doneBtnOrders")}
      </button>
      <button
        type="button"
        onClick={goMenu}
        className="mt-3 w-full rounded-xl bg-ink py-3.5 text-[15px] font-bold text-sand"
      >
        {t("doneBtnAnother")}
      </button>
    </div>
  );
}

/** Human payment label for the "Paid via …" line (full paid orders only). */
function payLabelOf(
  o: ClientOrder,
  t: ReturnType<typeof useTranslations>,
  tPay: ReturnType<typeof useTranslations>,
): string {
  if (o.splits) return t("splitFull", { people: o.splits.length });
  const { id, parc } = o.pay!;
  if (id === "credito" && parc > 1) {
    const grand = o.total + o.est;
    return t("payViaCredit", { parc, per: money(grand / parc) });
  }
  return tPay(id);
}
