"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * Seletor de idioma (Português / English) pra telas de perfil/configuração.
 * Troca o locale do mesmo jeito do LanguageSwitcher (router do next-intl), mas
 * PRESERVA a query string (ex.: `?local=Mesa 2` do QR). A preferência fica no
 * cookie NEXT_LOCALE (persistente — ver `i18n/routing.ts`).
 */
export function LocalePicker({
  className,
  compact = false,
  onBeforeSwitch,
}: {
  className?: string;
  /** Versão curta (PT | EN) pra cabeçalhos. */
  compact?: boolean;
  /** Chamado logo antes de trocar (ex.: lembrar a tela atual). */
  onBeforeSwitch?: (target: string) => void;
}) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("switcher");
  const [pending, startTransition] = useTransition();

  const switchTo = (target: string) => {
    if (target === locale) return;
    onBeforeSwitch?.(target);
    const search = typeof window !== "undefined" ? window.location.search : "";
    startTransition(() => {
      router.replace(`${pathname}${search}`, { locale: target });
    });
  };

  return (
    <div
      role="group"
      aria-label={t("label")}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border-2 border-ink/15 bg-white p-0.5",
        className,
      )}
      style={{ opacity: pending ? 0.6 : 1 }}
    >
      {routing.locales.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          onClick={() => switchTo(l)}
          aria-pressed={locale === l}
          className={cn(
            "rounded-full font-bold",
            compact ? "px-2.5 py-1 text-[11px] uppercase" : "px-3.5 py-1.5 text-xs",
            locale === l ? "bg-ink text-sand" : "bg-transparent text-ink/55",
          )}
        >
          {compact ? t(l) : t(l === "pt" ? "ptName" : "enName")}
        </button>
      ))}
    </div>
  );
}
