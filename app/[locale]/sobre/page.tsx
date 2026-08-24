import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { LegalShell, LegalSection, LegalLead, CompanyCard } from "@/components/site/LegalShell";

export const metadata: Metadata = {
  title: "Sobre Nós",
  description: "Sobre o Jurandir — plataforma tecnológica operada pela LMD Transportes Ltda.",
};

export default async function SobrePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <LegalShell title="Sobre Nós">
      <LegalLead>
        <p>
          O <strong>Jurandir</strong> é uma plataforma tecnológica desenvolvida e operada pela{" "}
          <strong>LMD TRANSPORTES LTDA</strong>, criada para oferecer soluções digitais para restaurantes
          e estabelecimentos do setor de alimentação.
        </p>
        <p>
          Nossa plataforma foi desenvolvida para modernizar e simplificar o atendimento e a operação dos
          estabelecimentos, permitindo a utilização de recursos como cardápio digital, realização e
          gerenciamento de pedidos, organização do atendimento e outras funcionalidades tecnológicas.
        </p>
        <p>
          A <strong>LMD TRANSPORTES LTDA</strong> é a pessoa jurídica responsável pelo desenvolvimento,
          administração, operação e suporte da plataforma Jurandir. “Jurandir” é o nome comercial utilizado
          para identificação da plataforma e de seus serviços.
        </p>
      </LegalLead>

      <LegalSection title="Empresa responsável">
        <CompanyCard />
        <p>
          Para dúvidas, solicitações ou suporte relacionados à plataforma Jurandir, entre em contato
          conosco através dos canais acima.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
