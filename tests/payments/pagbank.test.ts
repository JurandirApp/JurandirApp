import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  pagbankProvider,
  chargeIdsOf,
  exchangeConnectCode,
  getConnectUrl,
  signConnectState,
  verifyConnectState,
} from "@/lib/payments/pagbank";
import type { Establishment } from "@prisma/client";

function seq(bodies: (unknown | string)[]) {
  const fn = vi.fn();
  bodies.forEach((b) =>
    fn.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => (typeof b === "string" ? b : JSON.stringify(b)),
    }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

const est = { id: "est_1", pagbankAccountId: "ACCO_bar" } as unknown as Establishment;
const noAccount = { id: "est_2", pagbankAccountId: null } as unknown as Establishment;

beforeEach(() => {
  process.env.PAGBANK_BASE_URL = "https://sandbox.api.pagseguro.com";
  process.env.PAGBANK_TOKEN = "tok_test";
  process.env.PAGBANK_PLATFORM_ACCOUNT_ID = "ACCO_platform";
  process.env.APP_BASE_URL = "https://jurandir.app.br";
  vi.restoreAllMocks();
});

describe("pagbankProvider.createPixCharge", () => {
  it("cria pedido Pix com split em centavos (soma = total) e devolve copia-e-cola + QR", async () => {
    const fn = seq([
      {
        id: "ORDE_1",
        charges: [
          {
            id: "CHAR_1",
            status: "WAITING",
            qr_code: { text: "copiaecola" },
            links: [{ rel: "QRCODE.BASE64", href: "https://sandbox.api.pagseguro.com/qrcode/QRCO_1/base64" }],
          },
        ],
      },
      "iVBORw0KGgo=",
    ]);
    const r = await pagbankProvider.createPixCharge({
      est,
      reference: "PED-1",
      total: 100,
      platformFee: 8,
      customerName: "Maria Souza",
      customerDocument: "529.982.247-25",
      customerPhone: "47999990000",
      description: "Pedido PED-1",
    });
    expect(r).toEqual({ chargeId: "CHAR_1", pixPayload: "copiaecola", pixQrImage: "iVBORw0KGgo=", status: "pending" });

    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("https://sandbox.api.pagseguro.com/orders");
    expect(init.headers.Authorization).toBe("Bearer tok_test");
    const body = JSON.parse(init.body as string);
    expect(body.reference_id).toBe("PED-1");
    expect(body.customer).toMatchObject({
      name: "Maria Souza",
      tax_id: "52998224725",
      phones: [{ country: "55", area: "47", number: "999990000", type: "MOBILE" }],
    });
    expect(body.notification_urls).toEqual(["https://jurandir.app.br/api/webhooks/pagbank"]);
    const charge = body.charges[0];
    expect(charge.amount).toEqual({ value: 10000, currency: "BRL" });
    expect(charge.payment_method.type).toBe("PIX");
    expect(charge.splits.method).toBe("FIXED");
    const [bar, platform] = charge.splits.receivers;
    expect(bar).toMatchObject({ account: { id: "ACCO_bar" }, amount: { value: 9200 } });
    expect(platform).toMatchObject({ account: { id: "ACCO_platform" }, amount: { value: 800 } });
    expect(bar.amount.value + platform.amount.value).toBe(10000);
    // liable/chargeback só em cartão
    expect(bar.configurations).toBeUndefined();
  });

  it("sem conta PagBank do bar → sem split (cai na conta da plataforma)", async () => {
    const fn = seq([{ id: "ORDE_2", charges: [{ id: "CHAR_2", status: "WAITING", qr_code: { text: "x" } }] }]);
    await pagbankProvider.createPixCharge({
      est: noAccount,
      reference: "PED-2",
      total: 50,
      platformFee: 4,
      description: "Pedido PED-2",
    });
    const body = JSON.parse(fn.mock.calls[0][1].body as string);
    expect(body.charges[0].splits).toBeUndefined();
    // nome precisa ter sobrenome; CPF de teste quando o app não mandou
    expect(body.customer.name).toContain(" ");
    expect(body.customer.tax_id).toMatch(/^\d{11}$/);
  });
});

describe("pagbankProvider.createCardTokenPayment", () => {
  it("crédito com cartão criptografado; bar é o liable e arca com chargeback", async () => {
    const fn = seq([{ id: "ORDE_3", charges: [{ id: "CHAR_3", status: "PAID", payment_response: { message: "SUCESSO" } }] }]);
    const r = await pagbankProvider.createCardTokenPayment!({
      est,
      reference: "PED-3",
      total: 20,
      platformFee: 1.6,
      description: "Pedido PED-3",
      cardToken: "ENCRYPTED==",
      installments: 1,
      method: "credit",
      customerName: "Joao Silva",
      customerDocument: "52998224725",
    });
    expect(r).toEqual({ chargeId: "CHAR_3", status: "paid", statusDetail: "SUCESSO" });
    const pm = JSON.parse(fn.mock.calls[0][1].body as string).charges[0].payment_method;
    expect(pm).toMatchObject({
      type: "CREDIT_CARD",
      installments: 1,
      capture: true,
      card: { encrypted: "ENCRYPTED==", holder: { name: "Joao Silva", tax_id: "52998224725" } },
    });
    const [bar, platform] = JSON.parse(fn.mock.calls[0][1].body as string).charges[0].splits.receivers;
    expect(bar.configurations).toEqual({ liable: true, chargeback: { charge_transfer: { percentage: 100 } } });
    expect(platform.configurations.liable).toBe(false);
  });

  it("débito é recusado (PagBank exige 3DS)", async () => {
    seq([]);
    await expect(
      pagbankProvider.createCardTokenPayment!({
        est,
        reference: "PED-4",
        total: 20,
        platformFee: 1.6,
        description: "Pedido PED-4",
        cardToken: "ENC",
        installments: 1,
        method: "debit",
      }),
    ).rejects.toThrow(/3DS/);
  });
});

describe("pagbankProvider.createWalletPayment", () => {
  it("Apple Pay manda o paymentData (string) em wallet.key", async () => {
    const fn = seq([{ id: "ORDE_5", charges: [{ id: "CHAR_5", status: "PAID" }] }]);
    const paymentData = { version: "EC_v1", data: "abc", signature: "sig", header: { transactionId: "t" } };
    await pagbankProvider.createWalletPayment!({
      est,
      reference: "PED-5",
      total: 10,
      platformFee: 0.8,
      description: "Pedido PED-5",
      walletType: "apple_pay",
      token: JSON.stringify({ paymentData, transactionIdentifier: "x" }),
    });
    const card = JSON.parse(fn.mock.calls[0][1].body as string).charges[0].payment_method.card;
    expect(card.wallet.type).toBe("APPLE_PAY");
    expect(JSON.parse(card.wallet.key)).toEqual(paymentData);
  });

  it("Google Pay manda o token bruto", async () => {
    const fn = seq([{ id: "ORDE_6", charges: [{ id: "CHAR_6", status: "DECLINED" }] }]);
    const r = await pagbankProvider.createWalletPayment!({
      est,
      reference: "PED-6",
      total: 10,
      platformFee: 0.8,
      description: "Pedido PED-6",
      walletType: "google_pay",
      token: '{"signature":"s"}',
    });
    expect(r.status).toBe("failed");
    const card = JSON.parse(fn.mock.calls[0][1].body as string).charges[0].payment_method.card;
    expect(card.wallet).toEqual({ type: "GOOGLE_PAY", key: '{"signature":"s"}' });
  });
});

describe("pagbankProvider.getChargeStatus", () => {
  it("mapeia os status da cobrança", async () => {
    seq([{ id: "CHAR_7", status: "IN_ANALYSIS" }, { id: "CHAR_7", status: "PAID" }, { id: "CHAR_7", status: "CANCELED" }]);
    expect(await pagbankProvider.getChargeStatus(est, "CHAR_7")).toBe("pending");
    expect(await pagbankProvider.getChargeStatus(est, "CHAR_7")).toBe("paid");
    expect(await pagbankProvider.getChargeStatus(est, "CHAR_7")).toBe("failed");
  });
});

describe("Connect", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "segredo";
    process.env.PAGBANK_CLIENT_ID = "cid";
    process.env.PAGBANK_CLIENT_SECRET = "csecret";
    process.env.PAGBANK_REDIRECT_URI = "https://jurandir.app.br/api/payments/pagbank/callback";
  });

  it("state é alfanumérico, ida e volta, e recusa adulteração", () => {
    const s = signConnectState("clx9est123");
    expect(s).toMatch(/^[0-9a-f]+$/);
    expect(s.length).toBeLessThanOrEqual(128);
    expect(verifyConnectState(s)).toBe("clx9est123");
    const forged = signConnectState("outro").slice(0, -16) + s.slice(-16);
    expect(verifyConnectState(forged)).toBeNull();
    expect(verifyConnectState("zz")).toBeNull();
  });

  it("URL de autorização aponta pro Connect do sandbox com os parâmetros", () => {
    const u = new URL(getConnectUrl("abc123"));
    expect(u.origin + u.pathname).toBe("https://connect.sandbox.pagbank.com.br/oauth2/authorize");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("cid");
    expect(u.searchParams.get("redirect_uri")).toBe(process.env.PAGBANK_REDIRECT_URI);
    expect(u.searchParams.get("state")).toBe("abc123");
  });

  it("troca o code pelo account_id com os headers do client", async () => {
    const fn = seq([{ access_token: "at", account_id: "ACCO_bar" }]);
    expect(await exchangeConnectCode("code1")).toEqual({ accountId: "ACCO_bar" });
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("https://sandbox.api.pagseguro.com/oauth2/token");
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok_test", X_CLIENT_ID: "cid", X_CLIENT_SECRET: "csecret" });
    expect(JSON.parse(init.body)).toEqual({
      grant_type: "authorization_code",
      code: "code1",
      redirect_uri: process.env.PAGBANK_REDIRECT_URI,
    });
  });
});

describe("chargeIdsOf", () => {
  it("extrai só ids de cobrança do pedido do webhook", () => {
    expect(chargeIdsOf({ charges: [{ id: "CHAR_1" }, { id: "x" }, {}] })).toEqual(["CHAR_1"]);
    expect(chargeIdsOf({})).toEqual([]);
  });
});
