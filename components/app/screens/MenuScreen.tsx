"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import type { MenuItem } from "@/lib/data/panel";
import { money } from "@/lib/panel/helpers";
import { CATS, CAT_ICON } from "@/lib/data/app";
import { cartCount, cartTotal } from "@/lib/app/helpers";
import { useApp } from "../context";

export function MenuScreen() {
  const {
    est, loc, menu, popularNames, cart, cat, sub, query, setQuery,
    pickCat, pickSub, addItem, decItem, openCart, goMyOrders, myOrders, toastMsg,
  } = useApp();
  const t = useTranslations("app");
  // Platform taxonomy is translated via the shared panel maps (state still keys
  // off the canonical PT names); item names/descriptions stay PT (tenant data).
  const tCat = useTranslations("panel.cat");
  const tSub = useTranslations("panel.sub");

  const q = query.trim();
  const searching = q.length > 0;
  const list = searching
    ? menu.filter((m) => `${m.name} ${m.desc}`.toLowerCase().includes(q.toLowerCase()))
    : menu.filter((m) => m.cat === cat && m.sub === sub);

  // "Os mais pedidos" vem dos pedidos reais (popularNames, já ranqueado por
  // quantidade). Casa por nome e ignora itens que não existem mais no cardápio.
  const popular = popularNames.flatMap((n) => {
    const m = menu.find((x) => x.name === n);
    return m ? [m] : [];
  }).map((m, k) => ({ m, rank: k + 1 }));
  const promos = menu.filter((m) => m.old && m.old > m.price);

  // Só categorias/subcategorias que têm item cadastrado — nada de aba vazia.
  const availableCats = Object.keys(CATS).filter((c) =>
    menu.some((m) => m.cat === c),
  );
  const availableSubs = (CATS[cat] ?? []).filter((s) =>
    menu.some((m) => m.cat === cat && m.sub === s),
  );

  const total = cartTotal(cart, menu);
  const count = cartCount(cart);
  const qtyOf = (id: number) => cart.find((c) => c.id === id)?.qty ?? 0;

  // Só os canais de contato realmente preenchidos (nada de linkar pra "#").
  const contacts = [
    { key: "wa", href: est.whatsapp, icon: "chat", tint: "#ecfdf5", fg: "#059669", label: t("whatsapp"), external: true, show: Boolean(est.whatsapp) },
    { key: "ig", href: est.instagram.url, icon: "alternate_email", tint: "#fdf2f8", fg: "#db2777", label: est.instagram.handle, external: true, show: Boolean(est.instagram.handle) },
    { key: "tel", href: `tel:${est.phone.tel}`, icon: "call", tint: "#eef2f7", fg: "#475569", label: est.phone.display, external: false, show: Boolean(est.phone.display) },
    { key: "web", href: est.website.url, icon: "language", tint: "#faf3e2", fg: "#b45309", label: t("website"), external: true, show: est.website.url !== "#" },
  ].filter((c) => c.show);

  return (
    <div className="pb-[112px]">
      {/* Cover header */}
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={est.cover} alt="" className="block h-[208px] w-full object-cover" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top,rgba(0,0,0,.8),rgba(0,0,0,.25) 50%,transparent)",
          }}
        />
        {est.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={est.logo}
            alt=""
            className="absolute left-5 top-5 h-14 w-14 rounded-2xl border-2 border-white/85 object-cover shadow-lg"
          />
        )}
        <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
          <h1 className="m-0 font-display text-2xl font-extrabold leading-[1.2]">
            {est.name}
          </h1>
          <p className="m-0 mt-0.5 text-sm text-white/90">{est.tagline}</p>
          <p className="m-0 mt-2 flex items-center gap-1 text-xs text-white/80">
            <Icon name="location_on" size={12} />
            {est.address}
          </p>
          <p className="m-0 mt-0.5 flex items-center gap-1 text-xs text-white/80">
            <Icon name="schedule" size={12} />
            {est.hours}
          </p>
          <span
            className="mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ background: "rgba(255,255,255,.2)", backdropFilter: "blur(4px)" }}
          >
            <Icon name="location_on" size={11} />
            {loc}
          </span>
        </div>
      </div>

      {/* Tabs + finder */}
      <div className="px-4 pt-3">
        <div
          className="flex gap-1 rounded-xl bg-white p-1"
          style={{ boxShadow: "0 4px 12px -6px rgba(12,67,71,.15)" }}
        >
          <button
            type="button"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-coral py-2 text-sm font-medium text-white"
          >
            <Icon name="restaurant" size={15} />
            {t("tabMenu")}
          </button>
          <button
            type="button"
            onClick={goMyOrders}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-transparent py-2 text-sm font-semibold text-ink/50"
          >
            <Icon name="space_dashboard" size={15} />
            {myOrders.length > 0 ? t("tabOrdersCount", { n: myOrders.length }) : t("tabOrders")}
          </button>
        </div>
        <button
          type="button"
          onClick={() => toastMsg(t("finderToast"))}
          className="mt-2 box-border flex w-full items-center gap-2 rounded-xl border-2 border-ink/10 bg-white px-4 py-2.5 text-sm font-semibold text-ink"
        >
          <Icon name="search" size={16} style={{ color: "#FF6B4A" }} />
          {t("finder")}
          <span className="ml-auto text-ink/40">→</span>
        </button>
      </div>

      {/* Carousels (only when not searching, and only the ones with items) */}
      {!searching && (popular.length > 0 || promos.length > 0) && (
        <div className="pt-4">
          {popular.length > 0 && (
            <>
              <h2 className="m-0 mb-2 px-4 font-display text-lg font-extrabold">
                {t("mostOrdered")}
              </h2>
              <div className="hscroll flex gap-3 overflow-x-auto px-4 pb-2">
                {popular.map(({ m, rank }) => (
                  <MiniCard
                    key={m.id}
                    m={m}
                    badge={`${rank}º`}
                    badgeBg="#FFC24B"
                    badgeFg="#141821"
                    onAdd={() => addItem(m.id)}
                    addAria={t("addAria")}
                  />
                ))}
              </div>
            </>
          )}
          {promos.length > 0 && (
            <>
              <h2 className="m-0 mb-2 mt-3 px-4 font-display text-lg font-extrabold">
                {t("dailyOffers")}
              </h2>
              <div className="hscroll flex gap-3 overflow-x-auto px-4 pb-2">
                {promos.map((m) => (
                  <MiniCard
                    key={m.id}
                    m={m}
                    badge={`-${Math.round((1 - m.price / m.old!) * 100)}%`}
                    badgeBg="#ef4444"
                    badgeFg="#fff"
                    onAdd={() => addItem(m.id)}
                    addAria={t("addAria")}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Sticky search + pills */}
      <div className="sticky top-0 z-20 bg-page pb-1 pt-3">
        <div className="relative mb-2 px-4">
          <Icon
            name="search"
            size={16}
            className="absolute left-7 top-1/2 -translate-y-1/2 text-ink/40"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPh")}
            className="w-full rounded-full border border-ink/[0.12] bg-white px-9 py-2.5 text-sm outline-none focus:border-ink"
          />
          {searching && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("clear")}
              className="absolute right-7 top-1/2 -translate-y-1/2 bg-transparent p-0 text-ink/40"
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
        {!searching && (
          <>
            <div className="hscroll flex gap-2 overflow-x-auto px-4">
              {availableCats.map((c) => {
                const active = cat === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => pickCat(c)}
                    className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold"
                    style={{
                      background: active ? "#141821" : "#fff",
                      color: active ? "#EDD8A3" : "rgba(20,24,33,.7)",
                    }}
                  >
                    <Icon name={CAT_ICON[c]} size={15} />
                    {tCat(c)}
                  </button>
                );
              })}
            </div>
            <div className="hscroll flex gap-2 overflow-x-auto px-4 py-3">
              {availableSubs.map((s) => {
                const active = sub === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => pickSub(s)}
                    className="whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm"
                    style={{
                      background: active ? "#FF6B4A" : "#fff",
                      color: active ? "#fff" : "rgba(20,24,33,.6)",
                      fontWeight: active ? 500 : 400,
                      border: active ? "1px solid #FF6B4A" : "1px solid rgba(20,24,33,.1)",
                    }}
                  >
                    {tSub(s)}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {searching && (
        <p className="m-0 px-4 pt-2 text-sm text-[#64748b]">
          {t("resultLabel", { count: list.length, q })}
        </p>
      )}

      {/* Item list */}
      <div className="flex flex-col gap-4 px-4 pt-1">
        {list.map((m) => (
          <ItemCard
            key={m.id}
            m={m}
            qty={qtyOf(m.id)}
            onAdd={() => addItem(m.id)}
            onDec={() => decItem(m.id)}
            t={t}
          />
        ))}
        {searching && list.length === 0 && (
          <p className="m-0 py-10 text-center text-sm text-[#94a3b8]">{t("noResults")}</p>
        )}
      </div>

      {/* Contact card (only when not searching, and when there's info to show) */}
      {!searching && contacts.length > 0 && (
        <div className="px-4 pt-4">
          <div className="overflow-hidden rounded-2xl border border-ink/[0.08] bg-white shadow-[0_6px_20px_-12px_rgba(12,67,71,.25)]">
            <div className="flex items-center gap-2 px-4 py-3">
              <Icon name="storefront" size={16} className="text-coral-emph" />
              <h2 className="m-0 truncate text-sm font-bold text-ink">
                {t("contactTitle", { name: est.name })}
              </h2>
            </div>
            <div className="divide-y divide-ink/[0.06] border-t border-ink/[0.06]">
              {contacts.map((c) => (
                <ContactRow
                  key={c.key}
                  href={c.href}
                  icon={c.icon}
                  tint={c.tint}
                  fg={c.fg}
                  label={c.label}
                  external={c.external}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sticky cart bar */}
      {count > 0 && (
        <div
          className="sticky bottom-0 z-30 p-3"
          style={{ background: "linear-gradient(to top,#F8EFDA 55%,transparent)" }}
        >
          <button
            type="button"
            onClick={openCart}
            className="flex w-full items-center justify-between rounded-2xl bg-ink px-5 py-3.5 text-sand"
            style={{ boxShadow: "0 10px 30px -10px rgba(20,24,33,.5)" }}
          >
            <span className="flex items-center gap-2 font-semibold">
              <Icon name="shopping_cart" size={18} />
              {t("cartItems", { count })}
            </span>
            <span className="font-bold">{money(total)}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function MiniCard({
  m,
  badge,
  badgeBg,
  badgeFg,
  onAdd,
  addAria,
}: {
  m: MenuItem;
  badge: string;
  badgeBg: string;
  badgeFg: string;
  onAdd: () => void;
  addAria: string;
}) {
  return (
    <div
      className="w-40 flex-shrink-0 overflow-hidden rounded-2xl bg-white"
      style={{ boxShadow: "0 4px 12px -6px rgba(12,67,71,.15)" }}
    >
      <div className="relative">
        <div
          className="h-24 w-full bg-[#e2e8f0] bg-cover bg-center"
          style={{ backgroundImage: `url("${m.photo}")` }}
        />
        <span
          className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-extrabold"
          style={{ background: badgeBg, color: badgeFg, boxShadow: "0 2px 6px rgba(0,0,0,.2)" }}
        >
          {badge}
        </span>
      </div>
      <div className="p-2.5">
        <h3 className="m-0 truncate text-sm font-semibold leading-[1.2]">{m.name}</h3>
        <div className="mt-1 flex items-center justify-between">
          <div className="leading-none">
            {m.old && (
              <span className="text-[11px] text-[#cbd5e1] line-through">{money(m.old)}</span>
            )}
            <p className="m-0 font-extrabold text-coral-emph">{money(m.price)}</p>
          </div>
          <button
            type="button"
            onClick={onAdd}
            aria-label={addAria}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-coral text-white"
          >
            <Icon name="add" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ItemCard({
  m,
  qty,
  onAdd,
  onDec,
  t,
}: {
  m: MenuItem;
  qty: number;
  onAdd: () => void;
  onDec: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const promo = m.old && m.old > m.price;
  return (
    <div
      className="overflow-hidden rounded-24 bg-white"
      style={{ boxShadow: "0 4px 12px -6px rgba(12,67,71,.15)" }}
    >
      <div className="relative">
        <div
          className="h-44 w-full bg-[#e2e8f0] bg-cover bg-center"
          style={{ backgroundImage: `url("${m.photo}")` }}
        />
        {promo && (
          <span
            className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-[#ef4444] px-2.5 py-1 text-xs font-extrabold text-white"
            style={{ boxShadow: "0 2px 6px rgba(0,0,0,.2)" }}
          >
            <Icon name="percent" size={12} />
            {Math.round((1 - m.price / m.old!) * 100)}% {t("off")}
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="m-0 text-base font-bold leading-[1.2]">{m.name}</h3>
        {m.measure && (
          <span className="mt-1 inline-block rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[11px] font-semibold text-[#64748b]">
            {m.measure} {m.unit}
          </span>
        )}
        <p className="m-0 mt-1 text-xs leading-[1.4] text-[#94a3b8]">{m.desc}</p>
        <div className="mt-3 flex items-center justify-between">
          <div className="leading-none">
            {promo && (
              <span className="mr-1.5 text-xs text-[#cbd5e1] line-through">{money(m.old!)}</span>
            )}
            <span className="text-xl font-extrabold text-coral-emph">{money(m.price)}</span>
          </div>
          {qty > 0 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onDec}
                aria-label={t("decAria")}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f1f5f9]"
              >
                <Icon name="remove" size={15} />
              </button>
              <span className="w-4 text-center text-sm font-bold">{qty}</span>
              <button
                type="button"
                onClick={onAdd}
                aria-label={t("incAria")}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-coral text-white"
              >
                <Icon name="add" size={15} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onAdd}
              className="flex items-center gap-1 rounded-xl bg-coral px-4 py-2 text-sm font-semibold text-white"
            >
              <Icon name="add" size={15} />
              {t("add")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ContactRow({
  href,
  icon,
  tint,
  fg,
  label,
  external = true,
}: {
  href: string;
  icon: string;
  tint: string;
  fg: string;
  label: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="flex items-center gap-3 px-4 py-3 transition-colors active:bg-ink/[0.02]"
    >
      <span
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
        style={{ background: tint }}
      >
        <Icon name={icon} size={17} style={{ color: fg }} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink/85">
        {label}
      </span>
      <Icon
        name={external ? "north_east" : "chevron_right"}
        size={16}
        className="flex-shrink-0 text-ink/25"
      />
    </a>
  );
}
