import { describe, it, expect } from "vitest";
import {
  QR_BATCH_MAX,
  parseLabelList,
  planBatch,
  rangeLabels,
  validateBatchLabels,
} from "@/lib/domain/qr-batch";

describe("rangeLabels", () => {
  it("prefixo + faixa", () => {
    expect(rangeLabels("Mesa", 1, 3)).toEqual(["Mesa 1", "Mesa 2", "Mesa 3"]);
  });
  it("zeros à esquerda: largura mínima 2, ou a do maior número", () => {
    expect(rangeLabels(" Mesa ", 1, 3, true)).toEqual(["Mesa 01", "Mesa 02", "Mesa 03"]);
    expect(rangeLabels("G", 99, 100, true)).toEqual(["G 099", "G 100"]);
  });
  it("prefixo vazio → só o número", () => {
    expect(rangeLabels("  ", 5, 6)).toEqual(["5", "6"]);
  });
  it("faixa inválida ou acima do limite → null", () => {
    expect(rangeLabels("Mesa", 3, 1)).toBeNull();
    expect(rangeLabels("Mesa", -1, 2)).toBeNull();
    expect(rangeLabels("Mesa", 1.5, 2)).toBeNull();
    expect(rangeLabels("Mesa", Number.NaN, 2)).toBeNull();
    expect(rangeLabels("Mesa", 1, QR_BATCH_MAX + 1)).toBeNull();
    expect(rangeLabels("Mesa", 1, QR_BATCH_MAX)).toHaveLength(QR_BATCH_MAX);
  });
});

describe("parseLabelList", () => {
  it("um por linha, com trim, sem linhas vazias (CRLF também)", () => {
    expect(parseLabelList(" Mesa 1 \r\n\r\nBalcão\n  \nDeck 3")).toEqual(["Mesa 1", "Balcão", "Deck 3"]);
  });
});

describe("validateBatchLabels", () => {
  it("normaliza e descarta vazios", () => {
    expect(validateBatchLabels([" Mesa 1", "", "  ", "Mesa 2 "])).toEqual(["Mesa 1", "Mesa 2"]);
  });
  it("inválido → null", () => {
    expect(validateBatchLabels("Mesa 1")).toBeNull();
    expect(validateBatchLabels(undefined)).toBeNull();
    expect(validateBatchLabels([])).toBeNull();
    expect(validateBatchLabels(["", " "])).toBeNull();
    expect(validateBatchLabels(["Mesa 1", 2])).toBeNull();
    expect(validateBatchLabels(["x".repeat(61)])).toBeNull();
    expect(validateBatchLabels(Array.from({ length: QR_BATCH_MAX + 1 }, (_, i) => `M${i}`))).toBeNull();
  });
  it("aceita exatamente o limite", () => {
    expect(validateBatchLabels(Array.from({ length: QR_BATCH_MAX }, (_, i) => `M${i}`))).toHaveLength(
      QR_BATCH_MAX,
    );
  });
});

describe("planBatch", () => {
  it("pula já cadastrados e repetidos do lote, sem diferenciar maiúsculas", () => {
    expect(planBatch(["Mesa 1", "mesa 2", "MESA 2", "Mesa 3"], ["mesa 1"])).toEqual({
      toCreate: ["mesa 2", "Mesa 3"],
      skipped: 2,
    });
  });
  it("nada novo", () => {
    expect(planBatch(["A"], ["a"])).toEqual({ toCreate: [], skipped: 1 });
  });
});
