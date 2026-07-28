"use client";

import { useLocale, useTranslations } from "next-intl";
import { logout } from "@/lib/auth/actions";
import { Icon } from "@/components/ui/Icon";
import { Link } from "@/i18n/navigation";
import { useAdmin, ADMIN_TABS } from "./context";

export function AdminSidebar() {
  const { tab, setTab, scopedScaled } = useAdmin();
  const t = useTranslations("admin");
  const locale = useLocale();
  const ativos = scopedScaled.filter((e) => e.status === "ativo").length;

  return (
    <aside className="sticky top-[84px] box-border flex h-[calc(100vh-84px)] w-[248px] flex-shrink-0 flex-col self-start overflow-y-auto bg-ink px-[14px] py-5">
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-sand/[0.12] px-2.5 pb-3 pt-0.5">
        <span className="text-[11px] font-bold uppercase tracking-[.12em] text-sand/50">
          {t("sidebarTitle")}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#6EE7B7]">
          <span className="h-[7px] w-[7px] rounded-full bg-[#10b981]" />
          {t("activeChip", { count: ativos })}
        </span>
      </div>

      <nav className="flex flex-col gap-0.5">
        {ADMIN_TABS.map(([id, , icon]) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className="flex w-full items-center gap-3 rounded-xl px-3.5 py-[11px] text-left text-sm font-semibold transition-colors"
              style={{
                background: active ? "#EDD8A3" : "transparent",
                color: active ? "#141821" : "rgba(237,216,163,.7)",
              }}
            >
              <Icon name={icon} size={19} />
              {t(`nav.${id}`)}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-0.5 border-t border-sand/15 pt-4">
        <Link
          href="/painel"
          className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-sand/70"
        >
          <Icon name="storefront" size={18} />
          {t("estPanel")}
        </Link>
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
