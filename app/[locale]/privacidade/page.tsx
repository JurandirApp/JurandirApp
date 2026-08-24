import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Política de Privacidade da plataforma Jurandir (LMD Transportes Ltda) — LGPD.",
};

const UPDATED = "agosto de 2026";
const CONTACT = "contato@jurandir.app.br";
const PHONE = "(43) 99617-6666";

export default async function PrivacidadePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "48px 22px 80px",
        color: "#141821",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        lineHeight: 1.6,
      }}
    >
      <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, color: "#FF6B4A", textTransform: "uppercase" }}>
        Jurandir
      </p>
      <h1 style={{ fontSize: 32, margin: "6px 0 4px", letterSpacing: -0.5 }}>Política de Privacidade</h1>
      <p style={{ color: "#6b6f76", fontSize: 14, marginTop: 0 }}>Última atualização: {UPDATED}</p>

      <p style={{ fontSize: 15.5, marginTop: 20 }}>
        A <strong>LMD TRANSPORTES LTDA</strong>, inscrita no CNPJ nº 63.503.188/0001-00, responsável pela
        plataforma Jurandir, respeita a privacidade de seus usuários e clientes e está comprometida com a
        proteção dos dados pessoais tratados através de seus serviços.
      </p>

      <Section n="1" title="Responsável pela plataforma">
        A plataforma Jurandir é desenvolvida e operada pela LMD TRANSPORTES LTDA, pessoa jurídica
        responsável por sua administração, operação e suporte.
        <address
          style={{
            fontStyle: "normal",
            marginTop: 14,
            padding: "14px 16px",
            background: "#F8EFDA",
            borderRadius: 12,
            border: "1px solid #e4e0d5",
            fontSize: 14.5,
          }}
        >
          <strong>LMD TRANSPORTES LTDA</strong>
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
          Zona Industrial – Maringá/PR
          <br />
          CEP 87030-010
          <br />
          <br />
          E-mail: <strong>{CONTACT}</strong>
          <br />
          Telefone: {PHONE}
        </address>
      </Section>

      <Section n="2" title="Dados tratados">
        Dependendo da forma de utilização da plataforma, poderão ser tratados dados como nome, telefone,
        e-mail, informações relacionadas a pedidos, informações dos estabelecimentos cadastrados,
        informações técnicas de acesso e outros dados necessários ao funcionamento e à segurança dos
        serviços.
      </Section>

      <Section n="3" title="Finalidades">
        Os dados poderão ser utilizados para permitir o funcionamento da plataforma; identificar usuários
        e estabelecimentos; processar e gerenciar solicitações e pedidos; fornecer suporte; melhorar os
        serviços; prevenir fraudes e incidentes de segurança; cumprir obrigações legais e regulatórias; e
        realizar comunicações relacionadas à utilização da plataforma.
      </Section>

      <Section n="4" title="Compartilhamento de dados">
        Os dados poderão ser compartilhados quando necessário para a prestação dos serviços, funcionamento
        técnico da plataforma, processamento de pagamentos, atendimento de solicitações, cumprimento de
        obrigações legais ou determinações de autoridades competentes.
      </Section>

      <Section n="5" title="Segurança">
        A LMD TRANSPORTES LTDA adota medidas técnicas e administrativas destinadas a proteger os dados
        pessoais contra acessos não autorizados e situações acidentais ou ilícitas de perda, alteração,
        destruição ou divulgação.
      </Section>

      <Section n="6" title="Direitos dos titulares">
        Os titulares dos dados pessoais poderão exercer os direitos previstos na Lei nº 13.709/2018 – Lei
        Geral de Proteção de Dados Pessoais (LGPD), observadas as condições previstas na legislação.
      </Section>

      <Section n="7" title="Alterações desta Política">
        Esta Política de Privacidade poderá ser atualizada para refletir mudanças na plataforma, nos
        serviços oferecidos ou na legislação aplicável.
      </Section>

      <Section n="8" title="Contato">
        Para dúvidas ou solicitações relacionadas à privacidade e proteção de dados:
        <div style={{ marginTop: 10, fontSize: 14.5 }}>
          <strong>LMD TRANSPORTES LTDA</strong>
          <br />
          CNPJ: 63.503.188/0001-00
          <br />
          E-mail: <strong>{CONTACT}</strong>
          <br />
          Telefone: {PHONE}
        </div>
      </Section>
    </main>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 19, margin: "0 0 6px" }}>
        <span style={{ color: "#FF6B4A" }}>{n}.</span> {title}
      </h2>
      <div style={{ fontSize: 15.5 }}>{children}</div>
    </section>
  );
}
