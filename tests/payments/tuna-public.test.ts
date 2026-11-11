import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const settings = vi.hoisted(() => ({ getTunaCardsEnabled: vi.fn() }));
vi.mock("@/lib/db/settings", () => settings);
const modeFn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/payments/tuna", async (orig) => ({
  ...(await orig<typeof import("@/lib/payments/tuna")>()),
  ensureTunaMode: modeFn,
}));

import { tunaPublicReadiness, tunaPublicFlags, routesToTuna, type TunaPublicEst } from "@/lib/payments/tuna-public";
import { toAppPayments } from "@/lib/app/adapters";

const est = (o: Partial<TunaPublicEst> = {}): TunaPublicEst => ({
  slug: "leo-teste",
  tunaMerchantEnv: "TEST",
  tunaPixStatus: "active",
  tunaCardStatus: "active",
  gatewayPix: "TUNA",
  gatewayCredit: "TUNA",
  gatewayDebit: "TUNA",
  gatewayApplePay: "TUNA",
  gatewayGooglePay: "TUNA",
  ...o,
});
const mpOnly = (o: Partial<TunaPublicEst> = {}) =>
  est({
    gatewayPix: "MERCADO_PAGO",
    gatewayCredit: "MERCADO_PAGO",
    gatewayDebit: "MERCADO_PAGO",
    gatewayApplePay: "PAGARME",
    gatewayGooglePay: "PAGARME",
    ...o,
  });

beforeEach(() => {
  vi.stubEnv("TUNA_TEST_SLUGS", "leo-teste");
  modeFn.mockReset().mockResolvedValue("TEST");
  settings.getTunaCardsEnabled.mockReset().mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());

describe("routesToTuna", () => {
  it("qualquer método na Tuna conta; nenhum → false", () => {
    expect(routesToTuna(mpOnly())).toBe(false);
    expect(routesToTuna(mpOnly({ gatewayGooglePay: "TUNA" }))).toBe(true);
    expect(routesToTuna(mpOnly({ gatewayDebit: "TUNA" }))).toBe(true);
  });
});

describe("tunaPublicReadiness", () => {
  it("TEST + slug na allowlist + cartões ligados → Pix e cartão prontos", async () => {
    const of = await tunaPublicReadiness([est()]);
    expect(of(est())).toEqual({ pixReady: true, cardReady: true });
  });

  it("TEST + slug FORA da allowlist → nada pronto", async () => {
    const e = est({ slug: "outro-bar" });
    const of = await tunaPublicReadiness([e]);
    expect(of(e)).toEqual({ pixReady: false, cardReady: false });
  });

  it("chave dos cartões desligada → só Pix", async () => {
    settings.getTunaCardsEnabled.mockResolvedValue(false);
    const of = await tunaPublicReadiness([est()]);
    expect(of(est())).toEqual({ pixReady: true, cardReady: false });
  });

  it("modo ilegível → falha fechado (tudo falso)", async () => {
    modeFn.mockRejectedValue(new Error("db down"));
    const of = await tunaPublicReadiness([est()]);
    expect(of(est())).toEqual({ pixReady: false, cardReady: false });
  });

  it("chave dos cartões ilegível → falha fechado (tudo falso, inclusive Pix)", async () => {
    settings.getTunaCardsEnabled.mockRejectedValue(new Error("db down"));
    const of = await tunaPublicReadiness([est()]);
    expect(of(est())).toEqual({ pixReady: false, cardReady: false });
  });

  it("lê modo e chave UMA vez pra vários bares", async () => {
    const ests = [est(), est({ slug: "b2" }), mpOnly({ slug: "b3" })];
    const of = await tunaPublicReadiness(ests);
    ests.forEach(of);
    expect(modeFn).toHaveBeenCalledTimes(1);
    expect(settings.getTunaCardsEnabled).toHaveBeenCalledTimes(1);
  });

  it("nenhum bar na Tuna → não lê nada", async () => {
    const of = await tunaPublicReadiness([mpOnly()]);
    expect(of(mpOnly())).toEqual({ pixReady: false, cardReady: false });
    expect(modeFn).not.toHaveBeenCalled();
    expect(settings.getTunaCardsEnabled).not.toHaveBeenCalled();
  });

  it("PRODUCTION com cadastro TEST → nada pronto", async () => {
    modeFn.mockResolvedValue("PRODUCTION");
    const of = await tunaPublicReadiness([est()]);
    expect(of(est())).toEqual({ pixReady: false, cardReady: false });
  });
});

describe("tunaPublicFlags", () => {
  it("sem contexto → tudo falso", () => {
    expect(tunaPublicFlags(est(), null)).toEqual({ pixReady: false, cardReady: false });
  });
});

describe("toAppPayments com a prontidão da Tuna", () => {
  const db = (tuna?: { pixReady: boolean; cardReady: boolean }) => ({
    ...est(),
    pagarmeRecipientId: null,
    asaasWalletId: null,
    appmaxRecipientHash: null,
    ...(tuna ? { tuna } : {}),
  });

  it("bar Tuna com cartão pronto → Google Pay e Apple Pay ativos", () => {
    const p = toAppPayments(db({ pixReady: true, cardReady: true }));
    expect(p).toMatchObject({ googlePay: true, applePay: true, walletPay: true });
    expect(p.gateways).toMatchObject({ credit: "TUNA", debit: "TUNA", googlePay: "TUNA" });
  });

  it("sem `tuna` (antes do fix) ou cartão não pronto → sem carteira", () => {
    expect(toAppPayments(db())).toMatchObject({ googlePay: false, applePay: false });
    expect(toAppPayments(db({ pixReady: true, cardReady: false }))).toMatchObject({
      googlePay: false,
      applePay: false,
      walletPay: false,
    });
  });
});
