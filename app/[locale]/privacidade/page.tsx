import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { LegalShell, LegalSection, CompanyCard } from "@/components/site/LegalShell";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Política de Privacidade da plataforma Jurandir (LMD Transportes Ltda) — LGPD.",
};

export default async function PrivacidadePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <LegalShell title="Política de Privacidade" updated="agosto de 2026">
      <p style={{ fontSize: 15.5, marginTop: 20 }}>
        A <strong>LMD TRANSPORTES LTDA</strong>, inscrita no CNPJ nº 63.503.188/0001-00, responsável pela
        plataforma Jurandir, respeita a privacidade de seus usuários e clientes e está comprometida com a
        proteção dos dados pessoais tratados através de seus serviços.
      </p>

      <LegalSection n="1" title="Responsável pela plataforma">
        A plataforma Jurandir é desenvolvida e operada pela LMD TRANSPORTES LTDA, pessoa jurídica
        responsável por sua administração, operação e suporte.
        <CompanyCard />
      </LegalSection>

      <LegalSection n="2" title="Dados tratados">
        Dependendo da forma de utilização da plataforma, poderão ser tratados dados como nome, telefone,
        e-mail, informações relacionadas a pedidos, informações dos estabelecimentos cadastrados,
        informações técnicas de acesso e outros dados necessários ao funcionamento e à segurança dos
        serviços.
      </LegalSection>

      <LegalSection n="3" title="Finalidades">
        Os dados poderão ser utilizados para permitir o funcionamento da plataforma; identificar usuários
        e estabelecimentos; processar e gerenciar solicitações e pedidos; fornecer suporte; melhorar os
        serviços; prevenir fraudes e incidentes de segurança; cumprir obrigações legais e regulatórias; e
        realizar comunicações relacionadas à utilização da plataforma.
      </LegalSection>

      <LegalSection n="4" title="Compartilhamento de dados">
        Os dados poderão ser compartilhados quando necessário para a prestação dos serviços, funcionamento
        técnico da plataforma, processamento de pagamentos, atendimento de solicitações, cumprimento de
        obrigações legais ou determinações de autoridades competentes.
      </LegalSection>

      <LegalSection n="5" title="Segurança">
        A LMD TRANSPORTES LTDA adota medidas técnicas e administrativas destinadas a proteger os dados
        pessoais contra acessos não autorizados e situações acidentais ou ilícitas de perda, alteração,
        destruição ou divulgação.
      </LegalSection>

      <LegalSection n="6" title="Direitos dos titulares">
        Os titulares dos dados pessoais poderão exercer os direitos previstos na Lei nº 13.709/2018 – Lei
        Geral de Proteção de Dados Pessoais (LGPD), observadas as condições previstas na legislação.
      </LegalSection>

      <LegalSection n="7" title="Alterações desta Política">
        Esta Política de Privacidade poderá ser atualizada para refletir mudanças na plataforma, nos
        serviços oferecidos ou na legislação aplicável.
      </LegalSection>

      <LegalSection n="8" title="Contato">
        Para dúvidas ou solicitações relacionadas à privacidade e proteção de dados:
        <div style={{ marginTop: 10, fontSize: 14.5 }}>
          <strong>LMD TRANSPORTES LTDA</strong>
          <br />
          CNPJ: 63.503.188/0001-00
          <br />
          E-mail: <strong>contato@jurandir.app.br</strong>
          <br />
          Telefone: (43) 99617-6666
        </div>
      </LegalSection>
    </LegalShell>
  );
}
