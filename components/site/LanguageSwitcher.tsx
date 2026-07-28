"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/** Fixed top-right PT | EN toggle. Re-navigates to the same path in the chosen locale. */
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
    <div
      role="group"
      aria-label={t("label")}
      className="fixed right-4 top-4 z-50 flex items-center gap-0.5 rounded-full border-2 border-ink bg-white p-0.5 shadow-hard"
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
  );
}
