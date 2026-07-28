"use client";

import { useLocale, useTranslations } from "next-intl";
import { logout } from "@/lib/auth/actions";
import { Icon } from "@/components/ui/Icon";
import { usePanel, TABS } from "./context";

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tab, setTab, orders, restName } = usePanel();
  const t = useTranslations("panel.sidebar");
  const locale = useLocale();
  const activeCount = orders.filter((o) => o.st !== "entregue" && !o.expired).length;

  return (
    <aside
      className={`fixed left-0 top-0 z-50 box-border flex h-screen w-[248px] flex-shrink-0 flex-col overflow-y-auto bg-ink px-[14px] py-5 transition-transform duration-200 lg:sticky lg:top-[84px] lg:z-auto lg:h-[calc(100vh-84px)] lg:translate-x-0 lg:self-start ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      {/* Fechar (só no mobile — no desktop a sidebar é fixa) */}
      <button
        type="button"
        onClick={onClose}
        aria-label={t("close")}
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg text-sand/70 lg:hidden"
      >
        <Icon name="close" size={22} />
      </button>

      <div className="mb-1.5 flex items-center gap-2.5 border-b border-sand/15 px-2 pb-[18px] pt-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://images.unsplash.com/photo-1559827260-dc66d52bef19?auto=format&fit=crop&w=160&q=70"
          alt=""
          className="h-10 w-10 flex-shrink-0 rounded-[10px] object-cover"
        />
        <div className="min-w-0">
          <h1 className="m-0 truncate font-display text-[15px] font-bold leading-tight text-white">
            {restName}
          </h1>
          <p className="mt-0.5 text-[11px] text-sand/55">{t("subtitle")}</p>
        </div>
      </div>

      <nav className="mt-2 flex flex-col gap-0.5">
        {TABS.map(([id, icon]) => {
          const active = tab === id;
          const showBadge = id === "pedidos" && activeCount > 0;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                onClose();
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3.5 py-[11px] text-left text-sm font-semibold transition-colors"
              style={{
                background: active ? "#EDD8A3" : "transparent",
                color: active ? "#141821" : "rgba(237,216,163,.7)",
              }}
            >
              <Icon name={icon} size={19} />
              <span className="flex-1">{t(`nav.${id}`)}</span>
              {showBadge && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-coral px-1.5 text-[11px] font-extrabold text-white">
                  {activeCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-0.5 border-t border-sand/15 pt-4">
        <a
          href="https://wa.me/5547999999999"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-[#6EE7B7]"
        >
          <Icon name="chat" size={18} />
          {t("support")}
        </a>
        <form action={logout.bind(null, locale)}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl bg-transparent px-3.5 py-2.5 text-left text-sm font-semibold text-sand/70"
          >
            <Icon name="logout" size={18} />
            {t("logout")}
          </button>
        </form>
      </div>
    </aside>
  );
}
