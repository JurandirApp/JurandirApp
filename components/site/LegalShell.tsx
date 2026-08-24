import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

const INK = "#141821";
const CORAL = "#FF6B4A";
const CANVAS = "#F8EFDA";
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Wrapper das páginas legais (Sobre/Termos/Privacidade): botão de voltar,
 *  eyebrow da marca, título e (opcional) data de atualização. */
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
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "36px 22px 80px",
        color: INK,
        fontFamily: FONT,
        lineHeight: 1.6,
      }}
    >
      <Link
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: 14,
          fontWeight: 700,
          color: INK,
          textDecoration: "none",
          padding: "9px 16px",
          borderRadius: 999,
          border: `2px solid ${INK}`,
          background: "#fff",
          marginBottom: 26,
        }}
      >
        ← Voltar ao início
      </Link>
      <p
        style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 1,
          color: CORAL,
          textTransform: "uppercase",
        }}
      >
        Jurandir
      </p>
      <h1 style={{ fontSize: 32, margin: "6px 0 4px", letterSpacing: -0.5 }}>{title}</h1>
      {updated && (
        <p style={{ color: "#6b6f76", fontSize: 14, marginTop: 0 }}>
          Última atualização: {updated}
        </p>
      )}
      {children}
    </main>
  );
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
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 19, margin: "0 0 6px" }}>
        {n && <span style={{ color: CORAL }}>{n}. </span>}
        {title}
      </h2>
      <div style={{ fontSize: 15.5 }}>{children}</div>
    </section>
  );
}

/** Bloco de identificação da empresa (LMD Transportes) reutilizado nas páginas. */
export function CompanyCard() {
  return (
    <address
      style={{
        fontStyle: "normal",
        marginTop: 14,
        padding: "14px 16px",
        background: CANVAS,
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
      E-mail: <strong>contato@jurandir.app.br</strong>
      <br />
      Telefone: (43) 99617-6666
    </address>
  );
}
