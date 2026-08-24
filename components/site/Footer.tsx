"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Link } from "@/i18n/navigation";
import { useLeadModal } from "./lead-modal";

export function Footer() {
  const t = useTranslations("footer");
  const { openLead } = useLeadModal();

  return (
    <footer
      className="relative overflow-hidden border-t-4 border-coral text-white"
      style={{ background: "linear-gradient(180deg,#1C222E 0%,#141821 100%)" }}
    >
      <div className="relative mx-auto max-w-[896px] px-6 py-20 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[.1em] backdrop-blur-sm">
          <Icon name="storefront" size={14} className="text-sun" />
          {t("eyebrow")}
        </span>

        <h2 className="mx-auto mt-5 max-w-[672px] text-balance font-display text-6xl font-extrabold uppercase leading-[.92] tracking-[-0.02em]">
          {t("heading")}
        </h2>
        <p className="mx-auto mt-4 max-w-[576px] text-white/75">{t("subtitle")}</p>

        <Button
          variant="coral"
          onClick={openLead}
          className="mt-8 px-7 py-3.5 text-[15px]"
        >
          {t("cta")}
          <Icon name="arrow_forward" size={16} />
        </Button>

        <p className="mt-4 text-sm text-white/70">
          {t("alreadyPartner")}{" "}
          <Link
            href="/login"
            className="font-bold text-sun underline underline-offset-2"
          >
            {t("accessPanel")}
          </Link>
        </p>

        <div className="mt-14 flex flex-col items-center gap-3 border-t border-white/10 pt-6 text-sm text-white/60 sm:flex-row sm:justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/jurandir-logo-horizontal.svg"
            alt="Jurandir"
            className="h-9 w-auto rounded-lg"
          />
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <Link
              href="/privacidade"
              className="underline underline-offset-2 transition-colors hover:text-white"
            >
              Política de Privacidade
            </Link>
            <span>
              {t("tagline")} · {t("copyright")}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
