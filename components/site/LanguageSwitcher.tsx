"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

/** Barra fixa no topo-direito: botão "Acessar Painel" + toggle de idioma PT | EN. */
export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("switcher");
  const [pending, startTransition] = useTransition();

  const switchTo = (target: string) => {
    if (target === locale) return;
    startTransition(() => {
      router.replace(pathname, { locale: target });
    });
  };

  return (
    <div className="fixed right-4 top-4 z-50 flex items-center gap-2">
      {/* Acessar Painel — leva o dono do estabelecimento ao login do painel. */}
      <Link
        href="/login"
        className="flex items-center gap-1.5 rounded-full border-2 border-ink bg-ink px-3.5 py-1.5 text-xs font-bold text-sand shadow-hard"
      >
        <Icon name="storefront" size={14} className="text-sun" />
        <span className="hidden sm:inline">{t("accessPanel")}</span>
      </Link>

      {/* Toggle de idioma PT | EN. */}
      <div
        role="group"
        aria-label={t("label")}
        className="flex items-center gap-0.5 rounded-full border-2 border-ink bg-white p-0.5 shadow-hard"
        style={{ opacity: pending ? 0.6 : 1 }}
      >
        {routing.locales.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => switchTo(l)}
            aria-pressed={locale === l}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-bold uppercase",
              locale === l ? "bg-ink text-sand" : "bg-transparent text-ink/50",
            )}
          >
            {t(l)}
          </button>
        ))}
      </div>
    </div>
  );
}
