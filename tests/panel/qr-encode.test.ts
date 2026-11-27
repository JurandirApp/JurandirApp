import { describe, it, expect } from "vitest";
import { encodeQr, qrSvg } from "@/lib/qr/encode";

// Hashes (FNV-1a das linhas "0101…\n") conferidos contra a lib `qrcode` (npm) com
// os mesmos parâmetros (modo byte, nível M, máscara fixa) na hora de escrever o
// encoder — garantem que a matriz não muda por acidente.
function hash(text: string, mask: number): { size: number; h: number } {
  const { size, modules } = encodeQr(text, mask);
  let s = "";
  for (const row of modules) s += row.map((d) => (d ? "1" : "0")).join("") + "\n";
  let h = 2166136261;
  for (const c of s) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return { size, h };
}

describe("encodeQr (gerador local)", () => {
  it("URL de mesa (versão 4) bate com a referência", () => {
    expect(hash("https://jurandir.app.br/bar-do-ze?local=Mesa%2012", 2)).toEqual({ size: 33, h: 3084578152 });
  });
  it("200 bytes (versão 10, com version info e 5 blocos) bate com a referência", () => {
    expect(hash("z".repeat(200), 5)).toEqual({ size: 57, h: 4286186271 });
  });
  it("cresce a versão conforme o texto e recusa > versão 10", () => {
    expect(encodeQr("a").size).toBe(21);
    expect(encodeQr("x".repeat(30)).size).toBe(29);
    expect(() => encodeQr("x".repeat(300))).toThrow();
  });
  it("finder pattern no canto e SVG com zona de silêncio", () => {
    const { modules } = encodeQr("teste");
    expect(modules[0].slice(0, 7).every(Boolean)).toBe(true);
    expect(modules[1][1]).toBe(false);
    const svg = qrSvg("teste");
    expect(svg).toContain('viewBox="0 0 29 29"'); // 21 + 2×4
    expect(svg.startsWith("<svg")).toBe(true);
  });
});
