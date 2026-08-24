import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { LegalShell, LegalSection, CompanyCard } from "@/components/site/LegalShell";

export const metadata: Metadata = {
  title: "Termos de Uso",
  description: "Termos de Uso da plataforma Jurandir (LMD Transportes Ltda).",
};

export default async function TermosPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <LegalShell title="Termos de Uso" updated="agosto de 2026">
      <p style={{ fontSize: 15.5, marginTop: 20 }}>
        Estes Termos de Uso regulam o acesso e a utilização da plataforma <strong>Jurandir</strong>,
        desenvolvida e operada pela <strong>LMD TRANSPORTES LTDA</strong>, inscrita no CNPJ nº
        63.503.188/0001-00, com sede na Av. Bento Munhoz da Rocha Netto, 632, 19º andar, Sala 1905, Bloco
        Torre Norte, Zona Industrial, Maringá/PR, CEP 87030-010.
      </p>

      <LegalSection n="1" title="Sobre a plataforma Jurandir">
        O Jurandir é uma plataforma tecnológica destinada a restaurantes e estabelecimentos do setor de
        alimentação, oferecendo soluções digitais para auxiliar no atendimento e na operação dos
        estabelecimentos.
        <p style={{ marginTop: 10 }}>
          Entre suas funcionalidades poderão estar disponíveis cardápios digitais, realização e
          gerenciamento de pedidos, organização do atendimento e outros recursos tecnológicos relacionados
          à operação dos estabelecimentos.
        </p>
      </LegalSection>

      <LegalSection n="2" title="Empresa responsável">
        A <strong>LMD TRANSPORTES LTDA</strong> é a pessoa jurídica responsável pelo desenvolvimento,
        administração, operação e suporte da plataforma Jurandir. “Jurandir” é o nome comercial utilizado
        para identificação da plataforma e de seus serviços.
      </LegalSection>

      <LegalSection n="3" title="Aceitação dos Termos">
        Ao acessar ou utilizar a plataforma Jurandir, o usuário declara que leu, compreendeu e concorda com
        estes Termos de Uso. O usuário compromete-se a utilizar a plataforma de maneira lícita, adequada e
        de acordo com a legislação aplicável.
      </LegalSection>

      <LegalSection n="4" title="Estabelecimentos cadastrados">
        Os restaurantes e demais estabelecimentos cadastrados na plataforma são responsáveis pelas
        informações relacionadas aos seus produtos e serviços, incluindo preços, disponibilidade,
        preparação dos pedidos e demais condições comerciais apresentadas aos seus clientes.
        <p style={{ marginTop: 10 }}>
          A plataforma Jurandir fornece a infraestrutura tecnológica necessária para facilitar a interação
          entre os estabelecimentos e seus clientes.
        </p>
      </LegalSection>

      <LegalSection n="5" title="Disponibilidade da plataforma">
        A LMD TRANSPORTES LTDA buscará manter a plataforma disponível e funcionando adequadamente, podendo
        ocorrer interrupções temporárias relacionadas a manutenção, atualizações, questões técnicas ou
        situações fora de seu controle.
      </LegalSection>

      <LegalSection n="6" title="Propriedade intelectual">
        A plataforma Jurandir, incluindo seu software, sistemas, identidade visual, funcionalidades,
        conteúdos próprios e demais elementos protegidos por propriedade intelectual, pertence à{" "}
        <strong>LMD TRANSPORTES LTDA</strong> ou é utilizada mediante autorização dos respectivos
        titulares. É proibida a reprodução, modificação ou utilização não autorizada desses elementos.
      </LegalSection>

      <LegalSection n="7" title="Privacidade e proteção de dados">
        O tratamento de dados pessoais realizado através da plataforma observará a legislação brasileira
        aplicável, especialmente a <strong>Lei nº 13.709/2018 – Lei Geral de Proteção de Dados Pessoais
        (LGPD)</strong>. Informações adicionais estão disponíveis na Política de Privacidade do Jurandir.
      </LegalSection>

      <LegalSection n="8" title="Alterações dos Termos">
        Estes Termos de Uso poderão ser atualizados sempre que necessário para refletir alterações na
        plataforma, nos serviços oferecidos ou na legislação aplicável.
      </LegalSection>

      <LegalSection n="9" title="Contato">
        Para dúvidas, solicitações ou suporte:
        <CompanyCard />
      </LegalSection>
    </LegalShell>
  );
}
