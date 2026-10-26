import { describe, it, expect } from "vitest";
import { isDefiniteGatewayFailure } from "@/lib/payments/gateway-errors";
import { PagbankError } from "@/lib/payments/pagbank";
import { PagarmeError } from "@/lib/payments/pagarme";
import { TunaError } from "@/lib/payments/tuna";

describe("isDefiniteGatewayFailure", () => {
  it("PagBank 4xx → recusa definitiva", () => {
    expect(isDefiniteGatewayFailure(new PagbankError(400, "bad"))).toBe(true);
    expect(isDefiniteGatewayFailure(new PagbankError(422, "3ds"))).toBe(true);
  });
  it("Pagar.me 4xx → recusa definitiva", () => {
    expect(isDefiniteGatewayFailure(new PagarmeError(422, "token inválido"))).toBe(true);
    expect(isDefiniteGatewayFailure(new PagarmeError(400, "sem recebedor"))).toBe(true);
  });
  it("5xx do gateway → incerto", () => {
    expect(isDefiniteGatewayFailure(new PagbankError(502, "pedido sem cobrança"))).toBe(false);
    expect(isDefiniteGatewayFailure(new PagbankError(500, "x"))).toBe(false);
    expect(isDefiniteGatewayFailure(new PagarmeError(503, "x"))).toBe(false);
  });
  it("rede / timeout / parse / desconhecido → incerto", () => {
    expect(isDefiniteGatewayFailure(new TypeError("fetch failed"))).toBe(false);
    expect(isDefiniteGatewayFailure(new SyntaxError("Unexpected token"))).toBe(false);
    expect(isDefiniteGatewayFailure(new Error("timeout"))).toBe(false);
    expect(isDefiniteGatewayFailure("erro")).toBe(false);
    expect(isDefiniteGatewayFailure(null)).toBe(false);
    expect(isDefiniteGatewayFailure(undefined)).toBe(false);
  });
  it("erro com status mas de outra classe → incerto", () => {
    expect(isDefiniteGatewayFailure(Object.assign(new Error("x"), { status: 400 }))).toBe(false);
  });
  it("status fora de 4xx (0/3xx) → incerto", () => {
    expect(isDefiniteGatewayFailure(new PagbankError(0, "x"))).toBe(false);
    expect(isDefiniteGatewayFailure(new PagarmeError(302, "x"))).toBe(false);
  });
  it("Tuna: 4xx (inclui 422 de code negativo) → definitiva; 5xx → incerto", () => {
    expect(isDefiniteGatewayFailure(new TunaError(422, -108, ""))).toBe(true);
    expect(isDefiniteGatewayFailure(new TunaError(503, null, ""))).toBe(false);
  });
});
