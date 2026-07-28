import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mercadoPagoProvider,
  getOAuthUrl,
  exchangeOAuthCode,
  signState,
  verifyState,
} from "@/lib/payments/mercadopago";
import type { Establishment } from "@prisma/client";

function seq(bodies: unknown[]) {
  const fn = vi.fn();
  bodies.forEach((b) =>
    fn.mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(b) }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

const est = { id: "est_1", mpAccessToken: "seller-token" } as unknown as Establishment;

beforeEach(() => {
  process.env.MP_BASE_URL = "https://api.mercadopago.com";
  process.env.MP_CLIENT_ID = "app-123";
  process.env.MP_CLIENT_SECRET = "secret-xyz";
  process.env.MP_REDIRECT_URI = "http://localhost:3000/api/payments/mercadopago/callback";
  process.env.AUTH_SECRET = "unit-secret";
  // Não vaza o token de produção do .env para os testes de conta-única.
  process.env.MP_ACCESS_TOKEN = "";
  vi.restoreAllMocks();
});

describe("mercadoPagoProvider.createPixCharge", () => {
  it("cria pagamento Pix com application_fee e devolve o QR", async () => {
    const fn = seq([
      {
        id: 987654,
        status: "pending",
        point_of_interaction: { transaction_data: { qr_code: "copiaecola", qr_code_base64: "iVBOR" } },
      },
    ]);
    const r = await mercadoPagoProvider.createPixCharge({
      est,
      reference: "PED-1",
      total: 100,
      platformFee: 8,
      description: "Pedido PED-1",
    });
    expect(r).toEqual({ chargeId: "987654", pixPayload: "copiaecola", pixQrImage: "iVBOR", status: "pending" });
    const body = JSON.parse(fn.mock.calls[0][1].body as string);
    expect(body.payment_method_id).toBe("pix");
    expect(body.transaction_amount).toBe(100);
    expect(body.application_fee).toBe(8);
    expect(body.external_reference).toBe("PED-1");
    expect(fn.mock.calls[0][1].headers.Authorization).toBe("Bearer seller-token");
  });
});

describe("mercadoPagoProvider.getChargeStatus", () => {
  it("mapeia approved → paid", async () => {
    seq([{ status: "approved" }]);
    expect(await mercadoPagoProvider.getChargeStatus(est, "987654")).toBe("paid");
  });
});

describe("modo conta-única (sem OAuth)", () => {
  it("usa MP_TEST_ACCESS_TOKEN e omite application_fee", async () => {
    process.env.MP_TEST_ACCESS_TOKEN = "TEST-TOKEN";
    const noOauth = { id: "x", mpAccessToken: null } as unknown as Establishment;
    const fn = seq([
      {
        id: 1,
        status: "pending",
        point_of_interaction: { transaction_data: { qr_code: "q", qr_code_base64: "b" } },
      },
    ]);
    await mercadoPagoProvider.createPixCharge({
      est: noOauth,
      reference: "R",
      total: 10,
      platformFee: 1,
      description: "d",
    });
    const body = JSON.parse(fn.mock.calls[0][1].body as string);
    expect(body.application_fee).toBeUndefined();
    expect(fn.mock.calls[0][1].headers.Authorization).toBe("Bearer TEST-TOKEN");
  });
});

describe("OAuth", () => {
  it("monta a URL de autorização", () => {
    const url = getOAuthUrl("est_1.abc");
    expect(url).toContain("https://auth.mercadopago.com.br/authorization?");
    expect(url).toContain("client_id=app-123");
    expect(url).toContain("state=est_1.abc");
    expect(url).toContain("redirect_uri=http");
  });
  it("troca o code por tokens", async () => {
    seq([{ user_id: 555, access_token: "AT", refresh_token: "RT", public_key: "PK" }]);
    const r = await exchangeOAuthCode("the-code");
    expect(r).toEqual({ userId: "555", accessToken: "AT", refreshToken: "RT", publicKey: "PK" });
  });
  it("assina e verifica o state (com destino de retorno)", () => {
    const s = signState("est_1", "painel");
    expect(verifyState(s)).toEqual({ estId: "est_1", dest: "painel" });
    expect(signState("est_1")).toContain("est_1~admin");
    expect(verifyState("est_1~admin.deadbeef")).toBeNull();
  });
});
