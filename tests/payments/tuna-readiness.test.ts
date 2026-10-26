import { describe, it, expect } from "vitest";
import { tunaReadiness, parseTunaTestSlugs, type TunaEstFields, type TunaContext } from "@/lib/payments/tuna-readiness";

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

describe("parseTunaTestSlugs", () => {
  it("normaliza", () => {
    expect(parseTunaTestSlugs(" Leo-Teste , ,bar2")).toEqual(["leo-teste", "bar2"]);
    expect(parseTunaTestSlugs(undefined)).toEqual([]);
  });
});
