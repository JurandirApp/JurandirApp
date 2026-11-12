import { describe, it, expect } from "vitest";
import {
  cardFormErrors,
  cvvOk,
  formatCardNumber,
  formatCpf,
  formatExpiry,
  isValidCpf,
  luhnOk,
  parseExpiry,
} from "@/lib/app/card-form";

const NOW = new Date("2026-11-12T12:00:00Z");

describe("card-form", () => {
  it("formatCardNumber: grupos de 4; Amex 4-6-5; só dígitos, até 19", () => {
    expect(formatCardNumber("4111111111111111")).toBe("4111 1111 1111 1111");
    expect(formatCardNumber("4111-1111 11")).toBe("4111 1111 11");
    expect(formatCardNumber("378282246310005")).toBe("3782 822463 10005");
    expect(formatCardNumber("1".repeat(25)).replace(/ /g, "")).toHaveLength(19);
  });

  it("luhnOk", () => {
    expect(luhnOk("4111 1111 1111 1111")).toBe(true);
    expect(luhnOk("5200000000002235")).toBe(true);
    expect(luhnOk("4111 1111 1111 1112")).toBe(false);
    expect(luhnOk("4111")).toBe(false);
  });

  it("validade MM/AA: máscara, mês válido, não vencida (vale até o fim do mês)", () => {
    expect(formatExpiry("1228")).toBe("12/28");
    expect(formatExpiry("1")).toBe("1");
    expect(parseExpiry("12/28", NOW)).toEqual({ month: "12", year: "2028" });
    expect(parseExpiry("11/26", NOW)).toEqual({ month: "11", year: "2026" });
    expect(parseExpiry("10/26", NOW)).toBeNull();
    expect(parseExpiry("13/28", NOW)).toBeNull();
    expect(parseExpiry("00/28", NOW)).toBeNull();
    expect(parseExpiry("1/28", NOW)).toBeNull();
  });

  it("CVV: 3 dígitos; Amex 4", () => {
    expect(cvvOk("123", "4111111111111111")).toBe(true);
    expect(cvvOk("1234", "4111111111111111")).toBe(false);
    expect(cvvOk("1234", "378282246310005")).toBe(true);
    expect(cvvOk("123", "378282246310005")).toBe(false);
  });

  it("CPF: máscara e dígitos verificadores", () => {
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
    expect(formatCpf("5299")).toBe("529.9");
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224724")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("1234")).toBe(false);
  });

  it("cardFormErrors: aponta cada campo inválido; tudo certo → vazio", () => {
    const ok = { number: "4111 1111 1111 1111", holder: "ANA SOUZA", expiry: "12/28", cvv: "123", cpf: "529.982.247-25" };
    expect(cardFormErrors(ok, NOW)).toEqual({});
    expect(cardFormErrors({ number: "4111", holder: "A1", expiry: "13/28", cvv: "1", cpf: "000" }, NOW)).toEqual({
      number: true,
      holder: true,
      expiry: true,
      cvv: true,
      cpf: true,
    });
  });
});
