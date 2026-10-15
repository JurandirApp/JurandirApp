import { describe, expect, it } from "vitest";
import {
  amountCovers,
  buildChargeId,
  parseChargeId,
  readLinkResponse,
} from "@/lib/payments/infinitepay";

describe("InfinitePay chargeId", () => {
  it("monta e lê de volta (com e sem transaction_nsu)", () => {
    expect(parseChargeId(buildChargeId("PED-ABC", "slug1"))).toEqual({ orderNsu: "PED-ABC", slug: "slug1" });
    expect(parseChargeId(buildChargeId("PED-ABC", "slug1", "tx9"))).toEqual({
      orderNsu: "PED-ABC",
      slug: "slug1",
      transactionNsu: "tx9",
    });
  });
  it("rejeita ids de outros gateways", () => {
    expect(parseChargeId("123456")).toBeNull();
    expect(parseChargeId("ip|PED-ABC")).toBeNull();
  });
});

describe("readLinkResponse", () => {
  it("aceita os formatos prováveis da resposta", () => {
    expect(readLinkResponse({ url: "https://x/a", slug: "s" })).toEqual({ url: "https://x/a", slug: "s" });
    expect(readLinkResponse({ data: { link: "https://x/b", invoice_slug: "t" } })).toEqual({
      url: "https://x/b",
      slug: "t",
    });
  });
  it("não deduz o slug da URL", () => {
    expect(readLinkResponse({ checkout_url: "https://x/c/zzz" })).toEqual({ url: "https://x/c/zzz", slug: null });
    expect(readLinkResponse(null)).toEqual({ url: null, slug: null });
  });
});

describe("amountCovers (anti link forjado)", () => {
  it("aceita valor em centavos que cobre o total", () => {
    expect(amountCovers(25.5, 2550)).toBe(true);
    expect(amountCovers(25.5, 2600)).toBe(true); // juros do parcelamento
    expect(amountCovers(25.5, 2549)).toBe(true); // 1 centavo de arredondamento
  });
  it("recusa valor menor (link barato com o order_nsu de outro pedido)", () => {
    expect(amountCovers(25.5, 100)).toBe(false);
    expect(amountCovers(25, 25)).toBe(false); // 25 centavos != R$ 25
    expect(amountCovers(25.5, undefined)).toBe(false);
    expect(amountCovers(25.5, "abc")).toBe(false);
  });
});
