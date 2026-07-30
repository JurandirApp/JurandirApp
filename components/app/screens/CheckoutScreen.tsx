"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { money } from "@/lib/panel/helpers";
import { PAY_IDS, PM, isComingSoon, type PayId } from "@/lib/data/app";
import { cartTotal, fees, shares as splitShares } from "@/lib/app/helpers";
import { useApp } from "../context";

export function CheckoutScreen() {
  const {
    est, loc, menu, cart, addItem, decItem, removeItem, goMenu,
    note, setNote, mode, setMode, selPay, pickPay,
    people, pplPlus, pplMinus, paid, setShare, undoShare, paying, finish, openCardPay,
  } = useApp();
  const t = useTranslations("app");
  const tPay = useTranslations("app.pay");
  const tShort = useTranslations("app.payShort");

  const total = cartTotal(cart, menu);
  const { grand } = fees(total, est.platformFeePct, est.serviceFeePct);
  const full = mode === "full";

  const lines = cart
    .map((c) => ({ c, m: menu.find((x) => x.id === c.id)! }))
    .filter((l) => l.m);
  const cartIds = cart.map((c) => c.id);
  const desserts = menu
    .filter((m) => m.cat === "Sobremesas" && !cartIds.includes(m.id))
    .slice(0, 4);

  const shareArr = splitShares(grand, people);
  const nPaid = paid.filter(Boolean).length;
  const allPaid = nPaid === people;
  const paidAmt = paid.reduce((s, m, i) => s + (m ? shareArr[i] : 0), 0);
  const missing = people - nPaid;

  // Pay button state
  let payLabel: string;
  let payBg: string;
  let onPay: (() => void) | null = null;
  if (full) {
    const can = Boolean(selPay) && !paying;
    payLabel = paying
      ? t("payProcessing")
      : t("payFull", { amount: money(grand) });
    payBg = can ? "#FF6B4A" : "#cbd5e1";
    // Cartão → Payment Brick (checkout transparente). Pix/USDC → fluxo direto.
    if (can)
      onPay = () =>
        selPay === "credito" || selPay === "debito" ? openCardPay() : finish(null);
  } else {
    const can = nPaid > 0 && !paying;
    payLabel = paying
      ? t("paySending")
      : nPaid === 0
        ? t("paySelectOne")
        : allPaid
          ? t("payFinishSplit", { amount: money(grand) })
          : t("paySendSplit", { paid: nPaid, people });
    payBg = !can ? "#cbd5e1" : allPaid ? "#FF6B4A" : "#f59e0b";
    if (can)
      onPay = () =>
        finish(paid.map((m, i) => ({ m, amount: shareArr[i] })));
  }

  return (
    <div className="animate-rise-in px-5 pb-28 pt-5">
      <button
        type="button"
        onClick={goMenu}
        className="mb-4 flex items-center gap-1 bg-transparent p-0 text-sm text-ink/60"
      >
        <Icon name="arrow_back" size={15} />
        {t("backToMenu")}
      </button>
      <h1 className="m-0 mb-4 font-display text-2xl font-extrabold uppercase tracking-[-0.02em]">
        {t("confirmOrder")}
      </h1>

      {/* Order summary */}
      <div
        className="mb-4 rounded-2xl bg-white p-4"
        style={{ boxShadow: "0 4px 12px -6px rgba(12,67,71,.15)" }}
      >
        <p className="m-0 mb-2 flex items-center gap-1 text-xs text-[#94a3b8]">
          <Icon name="location_on" size={12} />
          {loc}
        </p>
        {lines.map(({ c, m }) => (
          <div key={c.id} className="flex items-center gap-2 py-1.5 text-sm">
            <span className="min-w-0 flex-1 truncate text-ink/70">{m.name}</span>
            <div className="flex flex-shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => decItem(c.id)}
                aria-label={t("minusAria")}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f1f5f9] text-ink/70"
              >
                <Icon name="remove" size={13} />
              </button>
              <span className="w-5 text-center font-medium">{c.qty}</span>
              <button
                type="button"
                onClick={() => addItem(c.id)}
                aria-label={t("plusAria")}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-coral text-white"
              >
                <Icon name="add" size={13} />
              </button>
            </div>
            <span className="w-20 flex-shrink-0 text-right font-medium">
              {money(m.price * c.qty)}
            </span>
            <button
              type="button"
              onClick={() => removeItem(c.id)}
              aria-label={t("removeAria")}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-transparent text-[#94a3b8]"
            >
              <Icon name="delete" size={15} />
            </button>
          </div>
        ))}
        <div className="mt-3 flex justify-between border-t border-[#f1f5f9] pt-3 font-bold">
          <span>{t("totalToPay")}</span>
          <span className="text-coral-emph">{money(grand)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={goMenu}
        className="mb-4 box-border flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-coral bg-white py-3 font-semibold text-coral-emph"
      >
        <Icon name="add" size={17} />
        {t("keepAdding")}
      </button>

      {/* Dessert upsell */}
      {desserts.length > 0 && (
        <div
          className="mb-4 rounded-2xl border p-4"
          style={{
            background: "linear-gradient(135deg,#fdf2f8,#fff1f2)",
            borderColor: "#fce7f3",
          }}
        >
          <h3 className="m-0 text-sm font-bold text-[#831843]">{t("dessertTitle")}</h3>
          <p className="m-0 mb-3 mt-0.5 text-xs text-[#be185d]/70">{t("dessertSub")}</p>
          <div className="hscroll flex gap-3 overflow-x-auto pb-1">
            {desserts.map((m) => (
              <div
                key={m.id}
                className="w-32 flex-shrink-0 overflow-hidden rounded-2xl bg-white"
                style={{ boxShadow: "0 4px 12px -6px rgba(12,67,71,.15)" }}
              >
                <div
                  className="h-20 w-full bg-[#e2e8f0] bg-cover bg-center"
                  style={{ backgroundImage: `url("${m.photo}")` }}
                />
                <div className="p-2">
                  <p className="m-0 truncate text-xs font-semibold leading-[1.2]">{m.name}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-sm font-bold text-coral-emph">{money(m.price)}</span>
                    <button
                      type="button"
                      onClick={() => addItem(m.id)}
                      aria-label={t("addAria")}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-coral text-white"
                    >
                      <Icon name="add" size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Note */}
      <div
        className="mb-4 rounded-2xl bg-white p-4"
        style={{ boxShadow: "0 4px 12px -6px rgba(12,67,71,.15)" }}
      >
        <label className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink/70">
          <Icon name="chat" size={15} style={{ color: "#FF6B4A" }} />
          {t("noteLabel")}{" "}
          <span className="text-xs font-normal text-[#94a3b8]">{t("optional")}</span>
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 200))}
          rows={2}
          maxLength={200}
          placeholder={t("notePh")}
          className="w-full resize-none rounded-xl border border-[#e2e8f0] px-3 py-2.5 text-sm outline-none focus:border-ink"
        />
        <p className="m-0 mt-1 text-right text-[11px] text-[#94a3b8]">{note.length}/200</p>
      </div>

      {/* Mode toggle */}
      <div className="mb-3 flex gap-1 rounded-xl bg-[#e2e8f0] p-1">
        <ModeBtn active={full} onClick={() => setMode("full")}>
          {t("payAll")}
        </ModeBtn>
        <ModeBtn active={!full} onClick={() => setMode("split")}>
          <Icon name="group" size={15} />
          {t("splitBill")}
        </ModeBtn>
      </div>

      {full ? (
        <>
          <h2 className="m-0 mb-2 text-sm font-semibold text-ink/70">{t("paymentMethod")}</h2>
          <div className="grid grid-cols-2 gap-2">
            {PAY_IDS.map((id) => {
              const soon = isComingSoon(id);
              const sel = selPay === id;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={soon}
                  onClick={() => pickPay(id)}
                  className="relative flex flex-col items-center gap-2 rounded-2xl border-2 p-3 disabled:cursor-not-allowed disabled:opacity-55"
                  style={{
                    borderColor: sel ? "#FF6B4A" : "#e2e8f0",
                    background: sel ? "#fff5f2" : "#fff",
                  }}
                >
                  {soon && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-ink/75 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                      {t("comingSoon")}
                    </span>
                  )}
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full text-white"
                    style={{ background: PM[id].color }}
                  >
                    <Icon name={PM[id].icon} size={18} />
                  </span>
                  <span className="text-center text-sm font-medium leading-[1.2]">
                    {tPay(id)}
                  </span>
                </button>
              );
            })}
          </div>

        </>
      ) : (
        <div
          className="rounded-2xl bg-white p-4"
          style={{ boxShadow: "0 4px 12px -6px rgba(12,67,71,.15)" }}
        >
          <div className="mb-2 flex items-center justify-between">
            <h3 className="m-0 text-sm font-semibold text-ink/70">{t("howManyFriends")}</h3>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={pplMinus}
                aria-label={t("minusAria")}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f1f5f9]"
              >
                <Icon name="remove" size={14} />
              </button>
              <span className="w-4 text-center font-bold">{people}</span>
              <button
                type="button"
                onClick={pplPlus}
                aria-label={t("plusAria")}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-coral text-white"
              >
                <Icon name="add" size={14} />
              </button>
            </div>
          </div>
          <p className="m-0 mb-3 text-xs text-[#94a3b8]">
            {t.rich("splitEvenly", {
              share: money(shareArr[0]),
              b: (c) => <b className="text-coral-emph">{c}</b>,
            })}
          </p>

          <div className="flex flex-col gap-2">
            {paid.map((m, idx) => (
              <div key={idx} className="rounded-xl border border-[#e2e8f0] p-2.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f1f5f9] text-xs font-bold">
                      {idx + 1}
                    </span>
                    {t("friend", { n: idx + 1 })}
                  </span>
                  {m ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-[#059669]">
                      <Icon name="check" size={13} />
                      {t("paidWith", { method: tShort(m) })}
                    </span>
                  ) : (
                    <span className="text-xs text-[#94a3b8]">{money(shareArr[idx])}</span>
                  )}
                </div>
                {m ? (
                  <button
                    type="button"
                    onClick={() => undoShare(idx)}
                    className="bg-transparent p-0 text-[11px] text-[#94a3b8] underline"
                  >
                    {t("undo")}
                  </button>
                ) : (
                  <div className="grid grid-cols-4 gap-1.5">
                    {PAY_IDS.map((id) => (
                      <PayMini
                        key={id}
                        id={id}
                        label={isComingSoon(id) ? t("comingSoon") : tShort(id)}
                        soon={isComingSoon(id)}
                        onClick={() => setShare(idx, id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-ink/60">
              <span>{t("paidCountSplit", { paid: nPaid, people })}</span>
              <span>{t("paidAmtOf", { paid: money(paidAmt), total: money(grand) })}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#f1f5f9]">
              <div
                className="h-full rounded-full bg-[#10b981]"
                style={{ width: `${Math.round((nPaid / people) * 100)}%` }}
              />
            </div>
          </div>

          {nPaid > 0 && nPaid < people && (
            <div className="mt-3 flex gap-1.5 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-xs text-[#92400e]">
              <Icon name="schedule" size={14} className="mt-px flex-shrink-0" />
              <span>
                {t.rich("splitWarn", {
                  n: missing,
                  b: (c) => <b>{c}</b>,
                })}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Sticky pay button */}
      <div
        className="sticky bottom-0 -mx-5 mt-4 px-5 py-3"
        style={{ background: "linear-gradient(to top,#F8EFDA 55%,transparent)" }}
      >
        <button
          type="button"
          onClick={() => onPay?.()}
          disabled={!onPay}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-semibold text-white"
          style={{ background: payBg }}
        >
          {paying && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
          )}
          {payLabel}
        </button>
      </div>
    </div>
  );
}

function ModeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium"
      style={{
        background: active ? "#fff" : "transparent",
        color: active ? "#141821" : "rgba(20,24,33,.6)",
        boxShadow: active ? "0 1px 3px rgba(0,0,0,.1)" : "none",
      }}
    >
      {children}
    </button>
  );
}

function PayMini({
  id,
  label,
  onClick,
  soon,
}: {
  id: PayId;
  label: string;
  onClick: () => void;
  soon?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={soon}
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] py-1.5 disabled:opacity-50"
    >
      <Icon name={PM[id].icon} size={15} className="text-ink/70" />
      <span className="text-center text-[9px] leading-none text-ink/60">{label}</span>
    </button>
  );
}
