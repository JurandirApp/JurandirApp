import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  tunaPost,
  TunaError,
  mapTunaStatus,
  pickCi,
  __setTunaModeForTests,
  buildTunaCustomer,
  tunaSplitItem,
  createTunaSession,
  tunaProvider,
  refundTunaPayment,
  tunaStatusDates,
  registerTunaMerchant,
} from "@/lib/payments/tuna";
import { isDefiniteGatewayFailure } from "@/lib/payments/gateway-errors";
import type { Establishment } from "@prisma/client";
import type { CardTokenPaymentInput, PixChargeInput, WalletPaymentInput } from "@/lib/payments/types";

function respond(body: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const ENV = [
  "TUNA_ACCOUNT", "TUNA_APPTOKEN", "TUNA_ACCOUNT_TEST", "TUNA_APPTOKEN_TEST",
  "TUNA_ENGINE_URL", "TUNA_TOKEN_URL", "TUNA_ENGINE_URL_TEST", "TUNA_TOKEN_URL_TEST",
];
beforeEach(() => {
  ENV.forEach((k) => delete process.env[k]);
  process.env.TUNA_ACCOUNT_TEST = "acc_t";
  process.env.TUNA_APPTOKEN_TEST = "tok_t";
  process.env.TUNA_ACCOUNT = "acc_p";
  process.env.TUNA_APPTOKEN = "tok_p";
  __setTunaModeForTests("TEST");
});
afterEach(() => {
  __setTunaModeForTests(null);
  vi.unstubAllGlobals();
});

describe("tunaPost", () => {
  it("TEST: engine host, headers de auth e idempotência", async () => {
    const fn = respond({ ok: 1 });
    const out = await tunaPost("engine", "/api/Payment/Status", { a: 1 }, { idempotencyKey: "k1" });
    expect(out).toEqual({ ok: 1 });
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("https://engine.tunagateway.com/api/Payment/Status");
    expect(init.method).toBe("POST");
    expect(init.headers["x-tuna-account"]).toBe("acc_t");
    expect(init.headers["x-tuna-apptoken"]).toBe("tok_t");
    expect(init.headers["Idempotency-Key"]).toBe("k1");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ a: 1 });
  });
  it("PRODUCTION usa envs sem sufixo", async () => {
    __setTunaModeForTests("PRODUCTION");
    const fn = respond({});
    await tunaPost("engine", "/x", {});
    const init = fn.mock.calls[0][1];
    expect(init.headers["x-tuna-account"]).toBe("acc_p");
    expect(init.headers["x-tuna-apptoken"]).toBe("tok_p");
    expect(init.headers["Idempotency-Key"]).toBeUndefined();
  });
  it("api token → host do token; auth none → sem headers de auth", async () => {
    const fn = respond({});
    await tunaPost("token", "/api/Token/NewSession", {}, { auth: "none" });
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("https://token.tunagateway.com/api/Token/NewSession");
    expect(init.headers["x-tuna-account"]).toBeUndefined();
    expect(init.headers["x-tuna-apptoken"]).toBeUndefined();
  });
  it("code negativo em HTTP 200 → TunaError 422", async () => {
    respond({ code: -108, message: { a: 1 } });
    const e = (await tunaPost<object>("engine", "/x", {}).catch((x: unknown) => x)) as TunaError;
    expect(e).toBeInstanceOf(TunaError);
    expect(e.status).toBe(422);
    expect(e.code).toBe(-108);
  });
  it("HTTP 500 → TunaError status 500", async () => {
    respond("boom", 500);
    const e = (await tunaPost<object>("engine", "/x", {}).catch((x: unknown) => x)) as TunaError;
    expect(e).toBeInstanceOf(TunaError);
    expect(e.status).toBe(500);
    expect(e.code).toBeNull();
  });
  it("erro de rede/timeout propaga sem virar TunaError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const e = (await tunaPost<object>("engine", "/x", {}).catch((x: unknown) => x)) as TunaError;
    expect(e).not.toBeInstanceOf(TunaError);
  });
});

describe("mapTunaStatus", () => {
  it("mapeia", () => {
    expect(mapTunaStatus("2")).toBe("paid");
    expect(mapTunaStatus("8")).toBe("paid");
    for (const s of ["4", "5", "6", "3", "9", "7"]) expect(mapTunaStatus(s)).toBe("failed");
    for (const s of ["P", "0", undefined, null]) expect(mapTunaStatus(s)).toBe("pending");
  });
});

describe("pickCi", () => {
  it("ignora maiúsculas", () => {
    expect(pickCi({ QrCopyPaste: "x" }, "qrCopyPaste")).toBe("x");
    expect(pickCi({ a: 1 }, "b", "A")).toBe(1);
    expect(pickCi(null, "a")).toBeUndefined();
  });
});

// ---- Cobranças (Task 3) ------------------------------------------------------

/** Respostas em sequência (Response real: text/arrayBuffer/headers). */
function seq(bodies: unknown[]) {
  const fn = vi.fn();
  bodies.forEach((b) =>
    fn.mockResolvedValueOnce(
      b instanceof Response ? b : new Response(typeof b === "string" ? b : JSON.stringify(b), { status: 200 }),
    ),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}
const bodyOf = (fn: ReturnType<typeof vi.fn>, i = 0) => JSON.parse(fn.mock.calls[i][1].body as string);
const headersOf = (fn: ReturnType<typeof vi.fn>, i = 0) => fn.mock.calls[i][1].headers as Record<string, string>;

const est = { id: "est1", tunaMerchantExternalId: "jur_est1" } as unknown as Establishment;
const noMerchant = { id: "est2", tunaMerchantExternalId: null } as unknown as Establishment;

const card = (over: Partial<CardTokenPaymentInput> = {}): CardTokenPaymentInput => ({
  est,
  reference: "PED-2",
  total: 20,
  platformFee: 1.6,
  description: "Pedido PED-2",
  cardToken: "ct_abc",
  installments: 1,
  method: "credit",
  customerName: "Joao Silva",
  customerDocument: "529.982.247-25",
  tuna: { sessionId: "sess_1", brand: "Visa" },
  ...over,
});
const threeDs = { referenceId: "ref_1", transactionId: "tx_1" };
const initOk = (over: Record<string, unknown> = {}) => ({
  code: 1,
  status: "2",
  paymentKey: "PK1",
  methods: [{ methodId: 0, methodType: "1", status: "2" }],
  ...over,
});

let savedBase: string | undefined;
beforeEach(() => {
  savedBase = process.env.APP_BASE_URL;
  process.env.APP_BASE_URL = "https://jurandir.app.br";
  delete process.env.TUNA_TEST_CPF;
});
afterEach(() => {
  if (savedBase === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = savedBase;
  vi.useRealTimers();
});

describe("buildTunaCustomer", () => {
  it("nome com sobrenome, e-mail do pedido, CPF do pagador em dígitos", () => {
    expect(buildTunaCustomer("PED-1", { name: "Maria Souza", document: "529.982.247-25" }, "PRODUCTION")).toEqual({
      id: "PED-1",
      name: "Maria Souza",
      email: "pedido-ped-1@jurandir.app.br",
      document: "52998224725",
      documentType: "CPF",
    });
    expect(buildTunaCustomer("PED-1", { name: "Maria" }, "PRODUCTION").name).toBe("Maria Jurandir");
    expect(buildTunaCustomer("PED-1", {}, "PRODUCTION").name).toBe("Cliente Jurandir");
  });
  it("PRODUCTION sem CPF → sem document/documentType (nunca inventa)", () => {
    process.env.TUNA_TEST_CPF = "111.444.777-35";
    const c = buildTunaCustomer("PED-1", { document: "123" }, "PRODUCTION");
    expect(c).not.toHaveProperty("document");
    expect(c).not.toHaveProperty("documentType");
  });
  it("TEST sem CPF → TUNA_TEST_CPF em dígitos; sem a env → omitido", () => {
    expect(buildTunaCustomer("PED-1", {}, "TEST")).not.toHaveProperty("document");
    process.env.TUNA_TEST_CPF = "111.444.777-35";
    expect(buildTunaCustomer("PED-1", {}, "TEST")).toMatchObject({ document: "11144477735", documentType: "CPF" });
  });
  it("documentType pelo tamanho: 14 dígitos → CNPJ; tamanho inválido → omitido", () => {
    expect(buildTunaCustomer("PED-1", { document: "11.222.333/0001-81" }, "PRODUCTION")).toMatchObject({
      document: "11222333000181",
      documentType: "CNPJ",
    });
    expect(buildTunaCustomer("PED-1", { document: "123456789012" }, "PRODUCTION")).not.toHaveProperty("document");
  });
});

describe("tunaSplitItem", () => {
  it("um item com o total e o split do bar (total − comissão)", () => {
    expect(tunaSplitItem(est, 20, 1.6, "Pedido PED-1")).toEqual({
      detailUniqueId: "1",
      productDescription: "Pedido PED-1",
      itemQuantity: 1,
      amount: 20,
      split: { merchantId: "jur_est1", amount: 18.4 },
    });
  });
  it("bar sem cadastro na Tuna → TunaError 422", () => {
    let e: unknown;
    try {
      tunaSplitItem(noMerchant, 20, 1.6, "x");
    } catch (x) {
      e = x;
    }
    expect(e).toBeInstanceOf(TunaError);
    expect((e as TunaError).status).toBe(422);
  });
});

describe("createTunaSession", () => {
  it("TEST: NewSession no host do token com Is3dsTest", async () => {
    const fn = seq([{ sessionId: "sess_9", code: 1 }]);
    expect(await createTunaSession({ id: "PED-1", email: "pedido-ped-1@jurandir.app.br" })).toBe("sess_9");
    expect(fn.mock.calls[0][0]).toBe("https://token.tunagateway.com/api/Token/NewSession");
    expect(headersOf(fn)["x-tuna-apptoken"]).toBe("tok_t");
    expect(bodyOf(fn)).toEqual({
      customer: { id: "PED-1", email: "pedido-ped-1@jurandir.app.br" },
      Is3dsTest: true,
    });
  });
  it("PRODUCTION: sem Is3dsTest", async () => {
    __setTunaModeForTests("PRODUCTION");
    const fn = seq([{ sessionId: "sess_p", code: 1 }]);
    await createTunaSession({ id: "PED-1", email: "e@x" });
    expect(bodyOf(fn)).not.toHaveProperty("Is3dsTest");
  });
  it("sessionId vazio → TunaError 422 (definitivo: sessão não cobra nada)", async () => {
    seq([{ sessionId: null, code: 1 }]);
    const e = (await createTunaSession({ id: "a", email: "b" }).catch((x: unknown) => x)) as TunaError;
    expect(e).toBeInstanceOf(TunaError);
    expect(e.status).toBe(422);
    expect(isDefiniteGatewayFailure(e)).toBe(true);
  });
  it("code negativo no NewSession → TunaError 422 com o code", async () => {
    seq([{ sessionId: null, code: -1, message: "Session has expired" }]);
    const e = (await createTunaSession({ id: "a", email: "b" }).catch((x: unknown) => x)) as TunaError;
    expect(e.status).toBe(422);
    expect(e.code).toBe(-1);
    expect(isDefiniteGatewayFailure(e)).toBe(true);
  });
});

describe("tunaProvider.createPixCharge", () => {
  const pix = (over: Partial<PixChargeInput> = {}): PixChargeInput => ({
    est,
    reference: "PED-1",
    total: 20,
    platformFee: 1.6,
    customerName: "Maria Souza",
    customerDocument: "52998224725",
    description: "Pedido PED-1",
    ...over,
  });

  it("Init Pix com split, expiração e idempotência; devolve copia-e-cola", async () => {
    const fn = seq([
      initOk({
        status: "P",
        paymentKey: "13489AA00000BCA",
        methods: [{ methodId: 0, methodType: "D", status: "C", pixInfo: { QrCopyPaste: "000201..." } }],
      }),
    ]);
    const r = await tunaProvider.createPixCharge(pix());
    expect(r).toEqual({ chargeId: "13489AA00000BCA", pixPayload: "000201...", pixQrImage: "", status: "pending" });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toBe("https://engine.tunagateway.com/api/Payment/Init");
    expect(headersOf(fn)["Idempotency-Key"]).toBe("init:PED-1");
    const b = bodyOf(fn);
    expect(b.partnerUniqueID).toBe("PED-1");
    expect(b.tokenSession).toBeUndefined();
    expect(b.customer).toEqual({
      id: "PED-1",
      name: "Maria Souza",
      email: "pedido-ped-1@jurandir.app.br",
      document: "52998224725",
      documentType: "CPF",
    });
    expect(b.paymentItems.items).toEqual([
      {
        detailUniqueId: "1",
        productDescription: "Pedido PED-1",
        itemQuantity: 1,
        amount: 20,
        split: { merchantId: "jur_est1", amount: 18.4 },
      },
    ]);
    expect(b.paymentData).toMatchObject({
      amount: 20,
      countryCode: "BR",
      callbackUrl: "https://jurandir.app.br/api/webhooks/tuna",
    });
    expect(b.paymentData.paymentMethods).toEqual([
      {
        paymentMethodType: "D",
        amount: 20,
        pix: { name: "Maria Souza", document: "52998224725", documentType: "CPF", expirationSeconds: 900 },
      },
    ]);
  });

  it("qrContent quando não há qrCopyPaste; QR em data URI vira base64 puro", async () => {
    seq([initOk({ status: "P", methods: [{ pixInfo: { qRContent: "0002XYZ", qrImage: "data:image/png;base64,iVBORw0KGgo=" } }] })]);
    const r = await tunaProvider.createPixCharge(pix());
    expect(r.pixPayload).toBe("0002XYZ");
    expect(r.pixQrImage).toBe("iVBORw0KGgo=");
  });

  it("QR como URL https → baixa e converte em base64 (sem headers de auth)", async () => {
    const fn = seq([
      initOk({ status: "P", methods: [{ pixInfo: { qrCopyPaste: "0002", qrImage: "https://cdn.tuna/qr.png" } }] }),
      new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/png" } }),
    ]);
    const r = await tunaProvider.createPixCharge(pix());
    expect(r.pixQrImage).toBe(Buffer.from([1, 2, 3]).toString("base64"));
    expect(fn.mock.calls[1][0]).toBe("https://cdn.tuna/qr.png");
    expect(fn.mock.calls[1][1]?.headers?.["x-tuna-apptoken"]).toBeUndefined();
  });

  it("falha ao baixar o QR → pixQrImage vazio (não derruba a cobrança)", async () => {
    seq([
      initOk({ status: "P", methods: [{ pixInfo: { qrCopyPaste: "0002", qrImage: "https://cdn.tuna/qr.png" } }] }),
      new Response("nope", { status: 404 }),
    ]);
    const r = await tunaProvider.createPixCharge(pix());
    expect(r).toMatchObject({ pixPayload: "0002", pixQrImage: "" });
  });

  it("APP_BASE_URL http → sem callbackUrl", async () => {
    process.env.APP_BASE_URL = "http://localhost:3000";
    const fn = seq([initOk({ status: "P" })]);
    await tunaProvider.createPixCharge(pix());
    expect(bodyOf(fn).paymentData).not.toHaveProperty("callbackUrl");
  });

  it("PRODUCTION sem CPF → customer e pix sem document/documentType", async () => {
    __setTunaModeForTests("PRODUCTION");
    process.env.TUNA_TEST_CPF = "111.444.777-35";
    const fn = seq([initOk({ status: "P" })]);
    await tunaProvider.createPixCharge(pix({ customerDocument: undefined }));
    const b = bodyOf(fn);
    expect(b.customer).not.toHaveProperty("document");
    expect(b.customer).not.toHaveProperty("documentType");
    expect(b.paymentData.paymentMethods[0].pix).not.toHaveProperty("document");
    expect(b.paymentData.paymentMethods[0].pix).not.toHaveProperty("documentType");
  });

  it("TEST sem CPF do pagador → TUNA_TEST_CPF", async () => {
    process.env.TUNA_TEST_CPF = "111.444.777-35";
    const fn = seq([initOk({ status: "P" })]);
    await tunaProvider.createPixCharge(pix({ customerDocument: undefined }));
    expect(bodyOf(fn).customer).toMatchObject({ document: "11144477735", documentType: "CPF" });
  });

  it("bar sem tunaMerchantExternalId → rejeita sem fetch", async () => {
    const fn = seq([]);
    await expect(tunaProvider.createPixCharge(pix({ est: noMerchant }))).rejects.toBeInstanceOf(TunaError);
    expect(fn).toHaveBeenCalledTimes(0);
  });

  it("Init com -108 (partnerUniqueID já usado) → INCERTO (503, mantém o code)", async () => {
    seq([{ code: -108, message: { source: 1, code: "SRVPartnerUniqueIDUsed" } }]);
    const e = (await tunaProvider.createPixCharge(pix()).catch((x: unknown) => x)) as TunaError;
    expect(e).toBeInstanceOf(TunaError);
    expect(e.status).toBe(503);
    expect(e.code).toBe(-108);
    expect(isDefiniteGatewayFailure(e)).toBe(false);
  });

  it("outro code negativo no Init continua recusa definitiva (422)", async () => {
    seq([{ code: -122, message: { source: 1, code: "SRVMerchantErr" } }]);
    const e = (await tunaProvider.createPixCharge(pix()).catch((x: unknown) => x)) as TunaError;
    expect(e.status).toBe(422);
    expect(e.code).toBe(-122);
    expect(isDefiniteGatewayFailure(e)).toBe(true);
  });

  it("Init sem paymentKey → TunaError 502 (incerto)", async () => {
    seq([{ code: 1, status: "P" }]);
    const e = (await tunaProvider.createPixCharge(pix()).catch((x: unknown) => x)) as TunaError;
    expect(e).toBeInstanceOf(TunaError);
    expect(e.status).toBe(502);
  });
});

describe("tunaProvider.createCardTokenPayment", () => {
  it("crédito sem 3DS → tipo 1 com token Tuna de uso único e sessão", async () => {
    const fn = seq([initOk()]);
    const r = await tunaProvider.createCardTokenPayment!(card({ installments: 3 }));
    expect(r).toMatchObject({ chargeId: "PK1", status: "paid" });
    expect(r.challenge).toBeUndefined();
    expect(headersOf(fn)["Idempotency-Key"]).toBe("init:PED-2");
    const b = bodyOf(fn);
    expect(b.tokenSession).toBe("sess_1");
    expect(b.paymentItems.items[0].split).toEqual({ merchantId: "jur_est1", amount: 18.4 });
    expect(b.paymentData.paymentMethods[0]).toEqual({
      paymentMethodType: "1",
      amount: 20,
      installments: 3,
      cardInfo: {
        token: "ct_abc",
        tokenProvider: "Tuna",
        brandName: "Visa",
        tokenSingleUse: 1,
        saveCard: false,
        billingInfo: { document: "52998224725", documentType: "CPF" },
      },
    });
  });

  it("crédito com 3DS → tipo 7 + authenticationInformation", async () => {
    const fn = seq([initOk()]);
    await tunaProvider.createCardTokenPayment!(card({ tuna: { sessionId: "sess_1", threeDs } }));
    const m = bodyOf(fn).paymentData.paymentMethods[0];
    expect(m.paymentMethodType).toBe("7");
    expect(m.authenticationInformation).toEqual({ code: "sess_1", referenceId: "ref_1", transactionId: "tx_1" });
    expect(m.cardInfo).not.toHaveProperty("brandName");
  });

  it("débito com 3DS → tipo 8, sempre 1 parcela", async () => {
    const fn = seq([initOk()]);
    await tunaProvider.createCardTokenPayment!(
      card({ method: "debit", installments: 4, tuna: { sessionId: "sess_1", threeDs } }),
    );
    const m = bodyOf(fn).paymentData.paymentMethods[0];
    expect(m.paymentMethodType).toBe("8");
    expect(m.installments).toBe(1);
    expect(m.authenticationInformation).toEqual({ code: "sess_1", referenceId: "ref_1", transactionId: "tx_1" });
  });

  it("débito sem 3DS → rejeita e fetch chamado 0 vezes", async () => {
    const fn = seq([]);
    const e = (await tunaProvider
      .createCardTokenPayment!(card({ method: "debit", tuna: { sessionId: "sess_1" } }))
      .catch((x: unknown) => x)) as TunaError;
    expect(e).toBeInstanceOf(TunaError);
    expect(e.status).toBe(422);
    expect(fn).toHaveBeenCalledTimes(0);
  });

  it("sem sessão Tuna → rejeita sem fetch", async () => {
    const fn = seq([]);
    await expect(tunaProvider.createCardTokenPayment!(card({ tuna: undefined }))).rejects.toBeInstanceOf(TunaError);
    expect(fn).toHaveBeenCalledTimes(0);
  });

  it("bar sem tunaMerchantExternalId → rejeita sem fetch", async () => {
    const fn = seq([]);
    await expect(tunaProvider.createCardTokenPayment!(card({ est: noMerchant }))).rejects.toBeInstanceOf(TunaError);
    expect(fn).toHaveBeenCalledTimes(0);
  });

  it("retentativa com -108 no Init de cartão → incerto (não vira recusa)", async () => {
    seq([{ code: -108 }]);
    const e = (await tunaProvider.createCardTokenPayment!(card()).catch((x: unknown) => x)) as TunaError;
    expect(e.status).toBe(503);
    expect(isDefiniteGatewayFailure(e)).toBe(false);
  });

  it("documento com 14 dígitos → billingInfo CNPJ", async () => {
    const fn = seq([initOk()]);
    await tunaProvider.createCardTokenPayment!(card({ customerDocument: "11222333000181" }));
    expect(bodyOf(fn).paymentData.paymentMethods[0].cardInfo.billingInfo).toEqual({
      document: "11222333000181",
      documentType: "CNPJ",
    });
    expect(bodyOf(fn).customer.documentType).toBe("CNPJ");
  });

  it("threeDSInfo na resposta → pending + challenge", async () => {
    seq([
      initOk({
        status: "P",
        methods: [
          { methodId: 0, status: "P", threeDSInfo: { url: "https://acs/x", token: "jwt1", paRequest: "eyJ9", provider: "cb" } },
        ],
      }),
    ]);
    const r = await tunaProvider.createCardTokenPayment!(card({ tuna: { sessionId: "sess_1", threeDs } }));
    expect(r).toEqual({
      chargeId: "PK1",
      status: "pending",
      challenge: { url: "https://acs/x", token: "jwt1", paRequest: "eyJ9" },
    });
  });

  it("recusa (status 4) → failed com detalhe da Tuna", async () => {
    seq([
      initOk({
        status: "4",
        methods: [{ status: "4", message: { source: 3, code: "GwNotAuthorized", message: "Not authorized" } }],
      }),
    ]);
    const r = await tunaProvider.createCardTokenPayment!(card());
    expect(r.status).toBe("failed");
    expect(r.statusDetail).toContain("GwNotAuthorized");
  });
});

describe("tunaProvider.createWalletPayment", () => {
  const wallet = (over: Partial<WalletPaymentInput> = {}): WalletPaymentInput => ({
    est,
    reference: "PED-3",
    total: 20,
    platformFee: 1.6,
    description: "Pedido PED-3",
    walletType: "google_pay",
    token: '{"signature":"s","protocolVersion":"ECv2"}',
    ...over,
  });

  it("Google Pay: NewSession e depois Init tipo 1 com o token cru", async () => {
    const fn = seq([{ sessionId: "sess_w", code: 1 }, initOk({ paymentKey: "PKW" })]);
    const r = await tunaProvider.createWalletPayment!(wallet());
    expect(r).toMatchObject({ chargeId: "PKW", status: "paid" });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn.mock.calls[0][0]).toBe("https://token.tunagateway.com/api/Token/NewSession");
    expect(bodyOf(fn, 0).customer).toEqual({ id: "PED-3", email: "pedido-ped-3@jurandir.app.br" });
    expect(fn.mock.calls[1][0]).toBe("https://engine.tunagateway.com/api/Payment/Init");
    expect(headersOf(fn, 1)["Idempotency-Key"]).toBe("init:PED-3");
    const b = bodyOf(fn, 1);
    expect(b.tokenSession).toBe("sess_w");
    expect(b.paymentItems.items[0].split).toEqual({ merchantId: "jur_est1", amount: 18.4 });
    const m = b.paymentData.paymentMethods[0];
    expect(m.paymentMethodType).toBe("1");
    expect(m.installments).toBe(1);
    expect(m.cardInfo).toMatchObject({ tokenProvider: "GooglePay", token: '{"signature":"s","protocolVersion":"ECv2"}' });
  });

  it("Apple Pay: extrai o paymentData do token embrulhado", async () => {
    const paymentData = { version: "EC_v1", data: "abc", signature: "sig", header: { transactionId: "t" } };
    const fn = seq([{ sessionId: "sess_w", code: 1 }, initOk()]);
    await tunaProvider.createWalletPayment!(
      wallet({ walletType: "apple_pay", token: JSON.stringify({ paymentData, transactionIdentifier: "x" }) }),
    );
    const ci = bodyOf(fn, 1).paymentData.paymentMethods[0].cardInfo;
    expect(ci.tokenProvider).toBe("ApplePay");
    expect(JSON.parse(ci.token)).toEqual(paymentData);
  });

  it("NewSession falha (code -1) → recusa definitiva 422, sem Init", async () => {
    const fn = seq([{ sessionId: null, code: -1, message: "AppToken is required" }]);
    const e = (await tunaProvider.createWalletPayment!(wallet()).catch((x: unknown) => x)) as TunaError;
    expect(e.status).toBe(422);
    expect(isDefiniteGatewayFailure(e)).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("NewSession sem sessionId → recusa definitiva 422, sem Init", async () => {
    const fn = seq([{ code: 1 }]);
    const e = (await tunaProvider.createWalletPayment!(wallet()).catch((x: unknown) => x)) as TunaError;
    expect(e.status).toBe(422);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("bar sem tunaMerchantExternalId → rejeita sem fetch (nem sessão)", async () => {
    const fn = seq([]);
    await expect(tunaProvider.createWalletPayment!(wallet({ est: noMerchant }))).rejects.toBeInstanceOf(TunaError);
    expect(fn).toHaveBeenCalledTimes(0);
  });
});

describe("tunaProvider.getChargeStatus", () => {
  it("Payment/Status por paymentKey → status interno", async () => {
    const fn = seq([{ code: 1, status: "8" }, { code: 1, status: "P" }, { code: 1, status: "4" }]);
    expect(await tunaProvider.getChargeStatus(est, "PK1")).toBe("paid");
    expect(await tunaProvider.getChargeStatus(est, "PK1")).toBe("pending");
    expect(await tunaProvider.getChargeStatus(est, "PK1")).toBe("failed");
    expect(fn.mock.calls[0][0]).toBe("https://engine.tunagateway.com/api/Payment/Status");
    expect(bodyOf(fn)).toEqual({ paymentKey: "PK1" });
  });
});

describe("tunaStatusDates", () => {
  it("hoje e ontem em São Paulo + hoje em UTC, sem repetir (YYYY-MM-DD)", () => {
    // 02:00 UTC = 23:00 do dia anterior em São Paulo → o dia UTC é outro.
    expect(tunaStatusDates(new Date("2026-10-26T02:00:00Z"))).toEqual(["2026-10-25", "2026-10-24", "2026-10-26"]);
    // Meio-dia: o dia UTC = dia de SP → deduplica.
    expect(tunaStatusDates(new Date("2026-03-01T12:00:00Z"))).toEqual(["2026-03-01", "2026-02-28"]);
  });
});

describe("tunaProvider.findApprovedPayment", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-26T02:00:00Z"));
  });

  it("procura hoje e ontem (SP) pelo código do pedido; primeiro pago vence", async () => {
    const fn = seq([{ code: 1, status: "P" }, { code: 1, status: "2", paymentKey: "PK9" }]);
    expect(await tunaProvider.findApprovedPayment!(est, "PED-9")).toEqual({ paymentId: "PK9", status: "paid" });
    expect(bodyOf(fn, 0)).toEqual({ PartnerUniqueID: "PED-9", paymentDate: "2026-10-25" });
    expect(bodyOf(fn, 1)).toEqual({ PartnerUniqueID: "PED-9", paymentDate: "2026-10-24" });
  });

  it("não encontrado hoje (-102) → ainda consulta ontem", async () => {
    seq([{ code: -102 }, { code: 1, status: "8", paymentKey: "PK7" }]);
    expect(await tunaProvider.findApprovedPayment!(est, "PED-9")).toEqual({ paymentId: "PK7", status: "paid" });
  });

  it("pago hoje → não consulta ontem", async () => {
    const fn = seq([{ code: 1, status: "8", paymentKey: "PK8" }]);
    expect(await tunaProvider.findApprovedPayment!(est, "PED-9")).toEqual({ paymentId: "PK8", status: "paid" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("pago só na data UTC de hoje → acha na 3ª consulta", async () => {
    const fn = seq([{ code: -102 }, { code: -102 }, { code: 1, status: "2", paymentKey: "PKU" }]);
    expect(await tunaProvider.findApprovedPayment!(est, "PED-9")).toEqual({ paymentId: "PKU", status: "paid" });
    expect(fn).toHaveBeenCalledTimes(3);
    expect(bodyOf(fn, 2)).toEqual({ PartnerUniqueID: "PED-9", paymentDate: "2026-10-26" });
  });

  it("nada pago → null; erro → null", async () => {
    seq([{ code: 1, status: "P" }, { code: -102 }, { code: 1, status: "P" }]);
    expect(await tunaProvider.findApprovedPayment!(est, "PED-9")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await tunaProvider.findApprovedPayment!(est, "PED-9")).toBeNull();
  });

  it("pago mas sem paymentKey na resposta → null (não grava id vazio)", async () => {
    seq([{ code: 1, status: "2" }, { code: 1, status: "P" }]);
    expect(await tunaProvider.findApprovedPayment!(est, "PED-9")).toBeNull();
  });
});

describe("refundTunaPayment", () => {
  it("total: só o paymentKey, idempotência cancel:<key>:total", async () => {
    const fn = seq([{ code: 1, status: "3" }]);
    expect(await refundTunaPayment("PK1")).toEqual({ status: "3" });
    expect(fn.mock.calls[0][0]).toBe("https://engine.tunagateway.com/api/Payment/Cancel");
    expect(headersOf(fn)["Idempotency-Key"]).toBe("cancel:PK1:total");
    expect(bodyOf(fn)).toEqual({ paymentKey: "PK1" });
  });

  it("parcial com split: cardsDetail + Splits do bar", async () => {
    const fn = seq([{ code: 1, status: "9" }]);
    expect(await refundTunaPayment("PK1", { amount: 5, barMerchantId: "jur_est1", barAmount: 4.6 })).toEqual({
      status: "9",
    });
    expect(headersOf(fn)["Idempotency-Key"]).toBe("cancel:PK1:5");
    expect(bodyOf(fn)).toEqual({
      paymentKey: "PK1",
      cardsDetail: [{ amount: 5, methodId: 0, Splits: [{ MerchantID: "jur_est1", Amount: 4.6 }] }],
    });
  });

  it("parcial sem bar: cardsDetail sem Splits", async () => {
    const fn = seq([{ code: 1, status: "D" }]);
    await refundTunaPayment("PK1", { amount: 2.5 });
    expect(bodyOf(fn)).toEqual({ paymentKey: "PK1", cardsDetail: [{ amount: 2.5, methodId: 0 }] });
  });

  it("bar no split sem barAmount → rejeita sem fetch", async () => {
    const fn = seq([]);
    await expect(refundTunaPayment("PK1", { amount: 5, barMerchantId: "jur_est1" })).rejects.toBeInstanceOf(TunaError);
    expect(fn).toHaveBeenCalledTimes(0);
  });

  it("code negativo (ex.: -137) → TunaError", async () => {
    seq([{ code: -137 }]);
    await expect(refundTunaPayment("PK1")).rejects.toBeInstanceOf(TunaError);
  });
});

describe("registerTunaMerchant", () => {
  const form = {
    documentType: "CNPJ" as const, document: "12345678000190", name: "Bar do Ze LTDA", fantasyName: "Bar do Ze",
    pixKeyType: "2" as const, pixKey: "12345678000190",
    contact: { name: "Ze", email: "ze@bar.com", phone: "11999990000" },
    legalRepresentative: { name: "Ze", document: "12345678909", birthday: "1980-01-02" },
    bank: { bankCode: "341", agency: "1234", account: "0733-7", accountType: "C" as const },
    address: { street: "Rua A", number: "10", neighborhood: "Centro", city: "SP", state: "SP", postalCode: "01000000" },
    stateFiscalDocument: "ISENTO", acceptedContract: true as const,
  };
  it("mapeia o corpo e devolve merchantId como string", async () => {
    const fn = respond({ merchantId: 86, code: 1 });
    const r = await registerTunaMerchant(form, { externalId: "jur_est1", condition: "cond1", mcc: "5812" });
    expect(r).toEqual({ merchantId: "86" });
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("https://engine.tunagateway.com/api/Merchant/Register");
    const b = JSON.parse(init.body);
    expect(b).toMatchObject({
      externalId: "jur_est1", countryId: 1, mccCode: "5812", condition: "cond1", acceptedContract: true,
      documentType: "CNPJ", pixKeyType: "2",
    });
    expect(b.bankAccounts[0]).toMatchObject({ externalId: "jur_est1_b1", number: "0733-7", bankCode: "341", accountType: "C" });
    expect(b.contact.cellPhone).toBe("11999990000");
    expect(b.address.phone).toBe("11999990000");
    expect(b.birthday).toBeUndefined();
  });
  it("PF inclui birthday/motherName/occupation", async () => {
    const fn = respond({ merchantId: 1, code: 1 });
    await registerTunaMerchant(
      { ...form, documentType: "CPF", birthday: "1990-01-01", motherName: "Maria", occupation: "Comerciante" },
      { externalId: "e", condition: "c", mcc: "5812" },
    );
    const b = JSON.parse(fn.mock.calls[0][1].body);
    expect(b).toMatchObject({ birthday: "1990-01-01", motherName: "Maria", occupation: "Comerciante" });
  });
  it("code -124 → TunaError", async () => {
    respond({ code: -124, message: { message: "invalid" } });
    await expect(
      registerTunaMerchant(form, { externalId: "e", condition: "c", mcc: "5812" }),
    ).rejects.toBeInstanceOf(TunaError);
  });
});
