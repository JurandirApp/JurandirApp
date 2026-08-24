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

        <div className="mt-14 border-t border-white/10 pt-8 text-left text-sm text-white/60">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-[400px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/jurandir-logo-horizontal.svg"
                alt="Jurandir"
                className="h-9 w-auto rounded-lg"
              />
              <p className="mt-3">
                Jurandir é uma plataforma tecnológica desenvolvida e operada pela LMD TRANSPORTES LTDA,
                responsável pelo desenvolvimento, administração, operação e suporte da plataforma.
              </p>
            </div>
            <div className="leading-relaxed">
              <p className="font-bold text-white">LMD TRANSPORTES LTDA</p>
              CNPJ: 63.503.188/0001-00
              <br />
              Inscrição Estadual: 91184840-69
              <br />
              Av. Bento Munhoz da Rocha Netto, 632 – 19º andar, Sala 1905
              <br />
              Bloco Torre Norte – Zona Industrial – Maringá/PR – CEP 87030-010
              <br />
              contato@jurandir.app.br · (43) 99617-6666
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 pt-6">
            <Link href="/sobre" className="font-semibold text-white hover:underline">
              Sobre Nós
            </Link>
            <span className="text-white/30">|</span>
            <Link href="/termos" className="font-semibold text-white hover:underline">
              Termos de Uso
            </Link>
            <span className="text-white/30">|</span>
            <Link href="/privacidade" className="font-semibold text-white hover:underline">
              Política de Privacidade
            </Link>
            <span className="text-white/30">|</span>
            <a href="mailto:contato@jurandir.app.br" className="font-semibold text-white hover:underline">
              Contato
            </a>
          </div>

          <p className="mt-5 text-white/50">
            © 2026 LMD TRANSPORTES LTDA. Todos os direitos reservados. · Jurandir é uma marca e plataforma
            operada pela LMD TRANSPORTES LTDA.
          </p>
        </div>
      </div>
    </footer>
  );
}
