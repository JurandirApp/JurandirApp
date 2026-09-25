import { describe, it, expect } from "vitest";
import { renderDanfe, type DanfeData } from "@/lib/print/escpos";

const base: DanfeData = {
  establishment: "Bar do Ze",
  cnpj: "12.345.678/0001-99",
  address: "Rua A, 100, Centro, Londrina, PR",
  code: "PED-1",
  timeLabel: "20:15",
  items: [
    { name: "Chopp", qty: 2, unit: "UN", unitPrice: 10, total: 20 },
    { name: "Porcao", qty: 1, unit: "UN", unitPrice: 30, total: 30 },
  ],
  total: 50,
  numero: 42,
  serie: 1,
  chave: "35260912345678000199650010000000421000000426",
  protocolo: "135260000123456",
  qrData: "https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode?p=chave|2|1|...",
  homologacao: true,
};

describe("renderDanfe", () => {
  it("inclui cabeçalho, chave em grupos de 4 e aviso de homologação", () => {
    const s = Buffer.from(renderDanfe(base)).toString("latin1");
    expect(s).toContain("Bar do Ze");
    expect(s).toContain("DANFE NFC-e");
    expect(s).toContain("Chave de acesso");
    // chave quebrada em grupos de 4
    expect(s).toContain("3526 0912 3456 7800");
    expect(s).toContain("SEM VALOR FISCAL");
    expect(s).toContain("Protocolo: 135260000123456");
  });

  it("emite o comando de QR Code nativo (GS ( k)", () => {
    const bytes = renderDanfe(base);
    // GS ( k = 0x1d 0x28 0x6b — procura a assinatura na sequência de bytes.
    let found = false;
    for (let i = 0; i < bytes.length - 2; i++) {
      if (bytes[i] === 0x1d && bytes[i + 1] === 0x28 && bytes[i + 2] === 0x6b) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("omite o aviso de homologação em produção", () => {
    const s = Buffer.from(renderDanfe({ ...base, homologacao: false })).toString("latin1");
    expect(s).not.toContain("SEM VALOR FISCAL");
  });
});
