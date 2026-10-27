import { describe, it, expect } from "vitest";
import {
  tunaReadiness,
  parseTunaTestSlugs,
  decideTunaSession,
  type TunaEstFields,
  type TunaContext,
} from "@/lib/payments/tuna-readiness";

const est = (o: Partial<TunaEstFields> = {}): TunaEstFields => ({
  slug: "leo-teste",
  tunaMerchantEnv: "TEST",
  tunaPixStatus: "active",
  tunaCardStatus: "active",
  ...o,
});
const ctx = (o: Partial<TunaContext> = {}): TunaContext => ({
  mode: "TEST",
  cardsEnabled: false,
  testSlugs: ["leo-teste"],
  ...o,
});

describe("tunaReadiness", () => {
  it("TEST + slug fora da lista: invisivel, nada pronto", () => {
    const r = tunaReadiness(est({ slug: "outro" }), ctx({ cardsEnabled: true }));
    expect(r).toMatchObject({ visible: false, pixReady: false, cardReady: false });
  });
  it("TEST + slug na lista (env com maiusculas/espacos) + pix active", () => {
    const slugs = parseTunaTestSlugs(" Leo-Teste , ,bar2");
    const r = tunaReadiness(est(), ctx({ testSlugs: slugs }));
    expect(r).toMatchObject({ visible: true, registered: true, pixReady: true });
  });
  it("cadastro TEST com modo PRODUCTION: nao registrado", () => {
    const r = tunaReadiness(est(), ctx({ mode: "PRODUCTION", cardsEnabled: true }));
    expect(r).toMatchObject({ visible: true, registered: false, pixReady: false, cardReady: false });
  });
  it("cartao depende da chave cardsEnabled", () => {
    expect(tunaReadiness(est(), ctx({ cardsEnabled: false })).cardReady).toBe(false);
    expect(tunaReadiness(est(), ctx({ cardsEnabled: true })).cardReady).toBe(true);
  });
  it("pix em analysis nao esta pronto", () => {
    expect(tunaReadiness(est({ tunaPixStatus: "analysis" }), ctx()).pixReady).toBe(false);
  });
});

describe("decideTunaSession", () => {
  const order = (o: Partial<Parameters<typeof decideTunaSession>[0] & object> = {}) => ({
    status: "AWAITING_PAYMENT",
    method: "CREDIT",
    provider: "TUNA",
    hasGatewayCharge: false,
    ...o,
  });

  it("pedido inexistente → notfound (antes de tudo, mesmo com cartões desligados)", () => {
    expect(decideTunaSession(null, true)).toBe("notfound");
    expect(decideTunaSession(null, false)).toBe("notfound");
  });
  it("crédito Tuna aguardando, sem cobrança, cartões ligados → ok", () => {
    expect(decideTunaSession(order(), true)).toBe("ok");
  });
  it("débito Tuna → ok", () => {
    expect(decideTunaSession(order({ method: "DEBIT" }), true)).toBe("ok");
  });
  it("Pix → notChargeable", () => {
    expect(decideTunaSession(order({ method: "PIX" }), true)).toBe("notChargeable");
    expect(decideTunaSession(order({ method: null }), true)).toBe("notChargeable");
  });
  it("cobrança já iniciada → notChargeable", () => {
    expect(decideTunaSession(order({ hasGatewayCharge: true }), true)).toBe("notChargeable");
  });
  it("outro gateway ou sem provider → notChargeable", () => {
    expect(decideTunaSession(order({ provider: "PAGBANK" }), true)).toBe("notChargeable");
    expect(decideTunaSession(order({ provider: null }), true)).toBe("notChargeable");
  });
  it("pedido fora de AWAITING_PAYMENT → notChargeable", () => {
    expect(decideTunaSession(order({ status: "IN_PRODUCTION" }), true)).toBe("notChargeable");
  });
  it("cartões desligados → cardsDisabled", () => {
    expect(decideTunaSession(order(), false)).toBe("cardsDisabled");
    expect(decideTunaSession(order({ method: "DEBIT" }), false)).toBe("cardsDisabled");
  });
  it("notChargeable vem antes de cardsDisabled", () => {
    expect(decideTunaSession(order({ method: "PIX" }), false)).toBe("notChargeable");
  });
});

describe("parseTunaTestSlugs", () => {
  it("normaliza", () => {
    expect(parseTunaTestSlugs(" Leo-Teste , ,bar2")).toEqual(["leo-teste", "bar2"]);
    expect(parseTunaTestSlugs(undefined)).toEqual([]);
  });
});
