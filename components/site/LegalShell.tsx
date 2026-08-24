import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

/** Wrapper das páginas legais (Sobre/Termos/Privacidade), no design da marca:
 *  hero escuro com título em Bricolage + cartão branco neo-brutalista. */
export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <>
      <header className="border-b-4 border-coral bg-ink text-white">
        <div className="mx-auto max-w-[820px] px-6 pb-12 pt-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border-2 border-white/25 bg-white/10 px-4 py-2 text-sm font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
          >
            <span aria-hidden>←</span> Voltar ao início
          </Link>
          <p className="mt-10 text-xs font-bold uppercase tracking-[.18em] text-sun">Jurandir</p>
          <h1 className="mt-2 font-display text-[2.6rem] font-extrabold uppercase leading-[.95] tracking-[-0.02em] sm:text-5xl">
            {title}
          </h1>
          {updated && <p className="mt-3 text-sm text-white/55">Última atualização: {updated}</p>}
        </div>
      </header>

      <div className="mx-auto max-w-[820px] px-6 py-10 sm:py-12">
        <article className="rounded-[26px] border-2 border-ink bg-white p-6 shadow-[6px_6px_0_#141821] sm:p-10">
          {children}
        </article>
        <p className="mt-6 text-center text-sm text-ink/45">
          © 2026 LMD TRANSPORTES LTDA. Todos os direitos reservados.
        </p>
      </div>
    </>
  );
}

export function LegalLead({ children }: { children: ReactNode }) {
  return <div className="space-y-3 text-[15.5px] leading-relaxed text-ink/80">{children}</div>;
}

export function LegalSection({
  n,
  title,
  children,
}: {
  n?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-8 border-t border-ink/[0.08] pt-8">
      <h2 className="flex items-center gap-3 font-display text-lg font-extrabold leading-tight text-ink">
        {n && (
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-coral text-[13px] font-bold text-white">
            {n}
          </span>
        )}
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink/80">{children}</div>
    </section>
  );
}

/** Bloco de identificação da empresa (LMD Transportes) reutilizado nas páginas. */
export function CompanyCard() {
  return (
    <address className="mt-4 rounded-2xl border border-ink/10 bg-[#F8EFDA] p-5 text-[14.5px] not-italic leading-relaxed text-ink/80">
      <span className="font-display text-base font-extrabold text-ink">LMD TRANSPORTES LTDA</span>
      <br />
      CNPJ: 63.503.188/0001-00
      <br />
      Inscrição Estadual: 91184840-69
      <br />
      <br />
      Av. Bento Munhoz da Rocha Netto, 632
      <br />
      19º andar, Sala 1905, Bloco Torre Norte
      <br />
      Zona Industrial – Maringá/PR — CEP 87030-010
      <br />
      <br />
      E-mail:{" "}
      <a href="mailto:contato@jurandir.app.br" className="font-semibold text-coral hover:underline">
        contato@jurandir.app.br
      </a>
      <br />
      Telefone: (43) 99617-6666
    </address>
  );
}
