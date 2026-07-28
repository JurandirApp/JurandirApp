"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { money } from "@/lib/panel/helpers";
import { cartTotal } from "@/lib/app/helpers";
import { useApp } from "./context";

export function CartDrawer() {
  const { menu, cart, addItem, decItem, closeCart, goCheckout } = useApp();
  const t = useTranslations("app");

  const lines = cart
    .map((c) => ({ c, m: menu.find((x) => x.id === c.id)! }))
    .filter((l) => l.m);
  const total = cartTotal(cart, menu);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="box-border max-h-[80vh] w-full max-w-[448px] overflow-y-auto rounded-t-[24px] bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="m-0 text-lg font-bold">{t("yourOrder")}</h2>
          <button
            type="button"
            onClick={closeCart}
            aria-label={t("close")}
            className="bg-transparent p-0 text-ink/40"
          >
            <Icon name="close" size={22} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {lines.map(({ c, m }) => (
            <div key={c.id} className="flex items-center gap-3">
              <div
                className="h-12 w-12 flex-shrink-0 rounded-xl bg-[#e2e8f0] bg-cover bg-center"
                style={{ backgroundImage: `url("${m.photo}")` }}
              />
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-sm font-medium">{m.name}</p>
                <p className="m-0 text-sm font-semibold text-coral-emph">
                  {money(m.price * c.qty)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => decItem(c.id)}
                  aria-label={t("decAria")}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f1f5f9]"
                >
                  <Icon name="remove" size={14} />
                </button>
                <span className="w-4 text-center text-sm font-semibold">{c.qty}</span>
                <button
                  type="button"
                  onClick={() => addItem(c.id)}
                  aria-label={t("incAria")}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-coral text-white"
                >
                  <Icon name="add" size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-[#f1f5f9] pt-4">
          <span className="text-[#64748b]">{t("total")}</span>
          <span className="text-xl font-bold">{money(total)}</span>
        </div>
        <button
          type="button"
          onClick={goCheckout}
          className="mt-4 w-full rounded-xl bg-coral py-3.5 text-[15px] font-semibold text-white"
        >
          {t("goToPayment")}
        </button>
      </div>
    </div>
  );
}
