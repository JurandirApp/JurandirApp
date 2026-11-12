import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const settings = vi.hoisted(() => ({ getMode: vi.fn(), getCards: vi.fn() }));
// O provider lê a chave dos cartões (e, fora do modo de teste, o modo) do banco.
vi.mock("@/lib/db/settings", () => ({ getTunaMode: settings.getMode, getTunaCardsEnabled: settings.getCards }));

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
  tunaSafeMessage,
  tunaTokenUrl,
  ensureTunaMode,
  bustTunaModeCache,
  tunaChargeFailed,
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
  "TUNA_ENGINE_URL", "TUNA_TOKEN_URL", "TUNA_ENGINE_URL_TEST", "TUNA_TOKEN_URL_TEST", "TUNA_TEST_SLUGS",
];
beforeEach(() => {
  ENV.forEach((k) => delete process.env[k]);
  settings.getMode.mockReset();
  settings.getCards.mockReset().mockResolvedValue(true);
  process.env.TUNA_TEST_SLUGS = "bar-teste";
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
  it("TEST só com as credenciais de produção → 401 definitivo, sem chamar a Tuna", async () => {
    delete process.env.TUNA_ACCOUNT_TEST;
    delete process.env.TUNA_APPTOKEN_TEST;
    const fn = respond({});
    const e = (await tunaPost<object>("engine", "/api/Payment/Init", {}).catch((x: unknown) => x)) as TunaError;
    expect(e).toBeInstanceOf(TunaError);
    expect(e.status).toBe(401);
    expect(tunaSafeMessage(e)).toBe("credenciais da Tuna ausentes (TEST)");
    expect(isDefiniteGatewayFailure(e)).toBe(true);
    expect(fn).not.toHaveBeenCalled();
  });
  it("TEST com só uma das credenciais _TEST → 401, sem chamar a Tuna", async () => {
    delete process.env.TUNA_APPTOKEN_TEST;
    const fn = respond({});
    const e = (await tunaPost<object>("token", "/api/Token/NewSession", {}).catch((x: unknown) => x)) as TunaError;
    expect(e.status).toBe(401);
    expect(fn).not.toHaveBeenCalled();
  });
  it("PRODUCTION sem envs → 401 definitivo, sem chamar a Tuna (nunca manda header vazio)", async () => {
    __setTunaModeForTests("PRODUCTION");
    delete process.env.TUNA_ACCOUNT;
    delete process.env.TUNA_APPTOKEN;
    const fn = respond({});
    const e = (await tunaPost<object>("engine", "/x", {}).catch((x: unknown) => x)) as TunaError;
    expect(e).toBeInstanceOf(TunaError);
    expect(e.status).toBe(401);
    expect(tunaSafeMessage(e)).toBe("credenciais da Tuna ausentes (PRODUCTION)");
    expect(isDefiniteGatewayFailure(e)).toBe(true);
    expect(fn).not.toHaveBeenCalled();
  });
  it("PRODUCTION não usa as credenciais _TEST", async () => {
    __setTunaModeForTests("PRODUCTION");
    delete process.env.TUNA_ACCOUNT;
    const fn = respond({});
    const e = (await tunaPost<object>("engine", "/x", {}).catch((x: unknown) => x)) as TunaError;
    expect(e.status).toBe(401);
    expect(fn).not.toHaveBeenCalled();
  });
  it("TEST: host cai no sem sufixo (só as credenciais não têm fallback)", async () => {
    process.env.TUNA_ENGINE_URL = "https://engine.exemplo.test/";
    process.env.TUNA_TOKEN_URL = "https://token.exemplo.test";
    const fn = respond({});
    await tunaPost("engine", "/api/Payment/Status", {});
    await tunaPost("token", "/api/Token/NewSession", {});
    expect(fn.mock.calls[0][0]).toBe("https://engine.exemplo.test/api/Payment/Status");
    expect(fn.mock.calls[1][0]).toBe("https://token.exemplo.test/api/Token/NewSession");
    expect(fn.mock.calls[0][1].headers["x-tuna-account"]).toBe("acc_t");
    expect(tunaTokenUrl()).toBe("https://token.exemplo.test");
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
  it("2xx ilegível (não-JSON) → TunaError 502 incerto, sem trecho do corpo", async () => {
    respond("<html>12345678909 sess_X</html>", 200);
    const e = (await tunaPost<object>("engine", "/x", {}).catch((x: unknown) => x)) as TunaError;
    expect(e).toBeInstanceOf(TunaError);
    expect(e.status).toBe(502);
    expect(e.code).toBeNull();
    expect(isDefiniteGatewayFailure(e)).toBe(false);
    expect(e.message).toBe("Tuna 502");
    expect(e.body).toBe("");
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

const asResponse = (b: unknown) =>
  b instanceof Response ? b : new Response(typeof b === "string" ? b : JSON.stringify(b), { status: 200 });

/** Respostas em sequência (Response real: text/arrayBuffer/headers). */
function seqRaw(bodies: unknown[]) {
  const fn = vi.fn();
  bodies.forEach((b) => fn.mockResolvedValueOnce(asResponse(b)));
  vi.stubGlobal("fetch", fn);
  return fn;
}

const isLookup = (init?: RequestInit) =>
  typeof init?.body === "string" && init.body.includes('"PartnerUniqueID"');

/** Como `seqRaw`, mas a consulta do pedido antes do Init (Status por
 *  PartnerUniqueID) é respondida à parte — por padrão "não existe" (-102) — e
 *  fica FORA do mock devolvido (índices/contagens só das outras chamadas). A
 *  consulta fica em `fn.lookup`. `existing`: resposta da consulta (todas as datas). */
function seq(bodies: unknown[], existing: unknown = { code: -102, message: "Check the payment identifier." }) {
  const fn = vi.fn();
  bodies.forEach((b) => fn.mockResolvedValueOnce(asResponse(b)));
  const lookup = vi.fn(async (_url: string, _init?: RequestInit) => (existing instanceof Error ? Promise.reject(existing) : asResponse(existing)));
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => (isLookup(init) ? lookup(url, init) : fn(url, init))),
  );
  return Object.assign(fn, { lookup });
}
const bodyOf = (fn: ReturnType<typeof vi.fn>, i = 0) => JSON.parse(fn.mock.calls[i][1].body as string);
const headersOf = (fn: ReturnType<typeof vi.fn>, i = 0) => fn.mock.calls[i][1].headers as Record<string, string>;

/** Bar PRONTO na Tuna no modo TEST (cadastrado em TEST, Pix e cartão ativos,
 *  slug na allowlist de teste). */
const readyEst = (over: Record<string, unknown> = {}) =>
  ({
    id: "est1",
    slug: "bar-teste",
    tunaMerchantExternalId: "jur_est1",
    tunaMerchantEnv: "TEST",
    tunaPixStatus: "active",
    tunaCardStatus: "active",
    ...over,
  }) as unknown as Establishment;
const est = readyEst();
const noMerchant = readyEst({ id: "est2", tunaMerchantExternalId: null });

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
    expect(tunaSafeMessage(e as TunaError)).toBe("bar sem cadastro na Tuna");
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
    await tunaProvider.createPixCharge(
      pix({ est: readyEst({ tunaMerchantEnv: "PRODUCTION" }), customerDocument: undefined }),
    );
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
    expect(tunaSafeMessage(e)).toBe("Init sem paymentKey");
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

  it("débito sem 3DS → tipo 2 (débito simples), 1 parcela, sem authenticationInformation", async () => {
    const fn = seq([initOk()]);
    const r = await tunaProvider.createCardTokenPayment!(
      card({ method: "debit", installments: 3, tuna: { sessionId: "sess_1" } }),
    );
    expect(r).toMatchObject({ chargeId: "PK1", status: "paid" });
    const m = bodyOf(fn).paymentData.paymentMethods[0];
    expect(m.paymentMethodType).toBe("2");
    expect(m.installments).toBe(1);
    expect(m).not.toHaveProperty("authenticationInformation");
    expect(m.cardInfo).toMatchObject({ token: "ct_abc", tokenProvider: "Tuna", tokenSingleUse: 1 });
  });

  it("débito com 3DS incompleto (sem transactionId) → tipo 2, sem authenticationInformation", async () => {
    const fn = seq([initOk()]);
    await tunaProvider.createCardTokenPayment!(
      card({ method: "debit", tuna: { sessionId: "sess_1", threeDs: { referenceId: "ref_1", transactionId: "" } } }),
    );
    const m = bodyOf(fn).paymentData.paymentMethods[0];
    expect(m.paymentMethodType).toBe("2");
    expect(m).not.toHaveProperty("authenticationInformation");
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

// Homologação 2026-10-29: Init repetido no mesmo pedido cobrou de novo (Pix
// pendente) ou deu -120 (cartão capturado) — a idempotência da Tuna não segura.
describe("consulta o pedido antes do Init (não cobra duas vezes)", () => {
  const pixIn: PixChargeInput = {
    est, reference: "PED-1", total: 20, platformFee: 1.6, customerDocument: "52998224725", description: "Pedido PED-1",
  };

  it("pedido sem pagamento (-102 em todas as datas) → envia o Init, consultando pelo código do pedido", async () => {
    const fn = seq([initOk()]);
    await expect(tunaProvider.createCardTokenPayment!(card())).resolves.toMatchObject({ status: "paid" });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.lookup.mock.calls.length).toBe(tunaStatusDates().length);
    const dates = fn.lookup.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string));
    expect(dates).toEqual(tunaStatusDates().map((paymentDate) => ({ PartnerUniqueID: "PED-2", paymentDate })));
  });

  it("cartão: pedido já PAGO → não envia Init e devolve pago com o paymentKey existente", async () => {
    const fn = seq([], { code: 1, status: "2", paymentKey: "PK_OLD" });
    await expect(tunaProvider.createCardTokenPayment!(card())).resolves.toEqual({ chargeId: "PK_OLD", status: "paid" });
    expect(fn).toHaveBeenCalledTimes(0);
  });

  it("cartão: pedido PENDENTE → não envia Init, devolve pending (reconcilia pelo paymentKey)", async () => {
    const fn = seq([], { code: 1, status: "P", paymentKey: "PK_OLD" });
    await expect(tunaProvider.createCardTokenPayment!(card())).resolves.toEqual({ chargeId: "PK_OLD", status: "pending" });
    expect(fn).toHaveBeenCalledTimes(0);
  });

  it("cartão: tentativa anterior RECUSADA → envia o Init (nova tentativa no mesmo pedido)", async () => {
    const fn = seq([initOk({ paymentKey: "PK_OLD" })], { code: 1, status: "4", paymentKey: "PK_OLD" });
    await expect(tunaProvider.createCardTokenPayment!(card())).resolves.toMatchObject({ status: "paid" });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toBe("https://engine.tunagateway.com/api/Payment/Init");
  });

  it("carteira: pedido já PAGO → não envia Init", async () => {
    const fn = seq([{ sessionId: "sess_w", code: 1 }], { code: 1, status: "8", paymentKey: "PK_OLD" });
    await expect(
      tunaProvider.createWalletPayment!({
        est, reference: "PED-3", total: 20, platformFee: 1.6, description: "x", walletType: "google_pay", token: "{}",
      }),
    ).resolves.toEqual({ chargeId: "PK_OLD", status: "paid" });
    expect(fn.mock.calls.map((c) => c[0])).not.toContain("https://engine.tunagateway.com/api/Payment/Init");
  });

  it("Pix: pedido já tem Pix pendente → não envia Init (2º QR cobraria de novo); erro INCERTO", async () => {
    const fn = seq([], { code: 1, status: "P", paymentKey: "PK_OLD" });
    const e = (await tunaProvider.createPixCharge(pixIn).catch((x: unknown) => x)) as TunaError;
    expect(e).toBeInstanceOf(TunaError);
    expect(isDefiniteGatewayFailure(e)).toBe(false);
    expect(fn).toHaveBeenCalledTimes(0);
  });

  it("consulta falha por rede → 424 definitivo, sem Init (nada cobrado)", async () => {
    const fn = seq([initOk()], new TypeError("fetch failed"));
    const e = (await tunaProvider.createCardTokenPayment!(card()).catch((x: unknown) => x)) as TunaError;
    expect(e).toBeInstanceOf(TunaError);
    expect(e.status).toBe(424);
    expect(isDefiniteGatewayFailure(e)).toBe(true);
    expect(fn).toHaveBeenCalledTimes(0);
  });

  it("consulta com code negativo que não é -102 → recusa definitiva, sem Init", async () => {
    const fn = seq([initOk()], { code: -113, message: "SRVPartnerAutErr" });
    const e = (await tunaProvider.createCardTokenPayment!(card()).catch((x: unknown) => x)) as TunaError;
    expect(e.status).toBe(422);
    expect(fn).toHaveBeenCalledTimes(0);
  });

  it("consulta acha o pedido sem paymentKey → 424, sem Init", async () => {
    const fn = seq([initOk()], { code: 1, status: "2" });
    const e = (await tunaProvider.createCardTokenPayment!(card()).catch((x: unknown) => x)) as TunaError;
    expect(e.status).toBe(424);
    expect(fn).toHaveBeenCalledTimes(0);
  });

  it("Init com -120 (replay de pagamento capturado) → INCERTO (503), não recusa", async () => {
    seq([{ code: -120, message: { code: "SRVInvalidAmount", message: "The payment method amount must be greater than zero." } }]);
    const e = (await tunaProvider.createCardTokenPayment!(card()).catch((x: unknown) => x)) as TunaError;
    expect(e.status).toBe(503);
    expect(e.code).toBe(-120);
    expect(isDefiniteGatewayFailure(e)).toBe(false);
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

describe("tunaChargeFailed", () => {
  it("só status recusado libera a retentativa; pago/pendente não", async () => {
    const fn = seq([{ code: 1, status: "4" }, { code: 1, status: "8" }, { code: 1, status: "P" }]);
    expect(await tunaChargeFailed("PK1")).toBe(true);
    expect(await tunaChargeFailed("PK1")).toBe(false);
    expect(await tunaChargeFailed("PK1")).toBe(false);
    expect(bodyOf(fn)).toEqual({ paymentKey: "PK1" });
  });
  it("erro na consulta (code negativo / rede) → false (falha fechado)", async () => {
    seq([{ code: -102, message: "x" }]);
    expect(await tunaChargeFailed("PK1")).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await tunaChargeFailed("PK1")).toBe(false);
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
    const fn = seqRaw([{ code: 1, status: "P" }, { code: 1, status: "2", paymentKey: "PK9" }]);
    expect(await tunaProvider.findApprovedPayment!(est, "PED-9")).toEqual({ paymentId: "PK9", status: "paid" });
    expect(bodyOf(fn, 0)).toEqual({ PartnerUniqueID: "PED-9", paymentDate: "2026-10-25" });
    expect(bodyOf(fn, 1)).toEqual({ PartnerUniqueID: "PED-9", paymentDate: "2026-10-24" });
  });

  it("não encontrado hoje (-102) → ainda consulta ontem", async () => {
    seqRaw([{ code: -102 }, { code: 1, status: "8", paymentKey: "PK7" }]);
    expect(await tunaProvider.findApprovedPayment!(est, "PED-9")).toEqual({ paymentId: "PK7", status: "paid" });
  });

  it("pago hoje → não consulta ontem", async () => {
    const fn = seqRaw([{ code: 1, status: "8", paymentKey: "PK8" }]);
    expect(await tunaProvider.findApprovedPayment!(est, "PED-9")).toEqual({ paymentId: "PK8", status: "paid" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("pago só na data UTC de hoje → acha na 3ª consulta", async () => {
    const fn = seqRaw([{ code: -102 }, { code: -102 }, { code: 1, status: "2", paymentKey: "PKU" }]);
    expect(await tunaProvider.findApprovedPayment!(est, "PED-9")).toEqual({ paymentId: "PKU", status: "paid" });
    expect(fn).toHaveBeenCalledTimes(3);
    expect(bodyOf(fn, 2)).toEqual({ PartnerUniqueID: "PED-9", paymentDate: "2026-10-26" });
  });

  it("nada pago → null; erro → null", async () => {
    seqRaw([{ code: 1, status: "P" }, { code: -102 }, { code: 1, status: "P" }]);
    expect(await tunaProvider.findApprovedPayment!(est, "PED-9")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await tunaProvider.findApprovedPayment!(est, "PED-9")).toBeNull();
  });

  it("pago mas sem paymentKey na resposta → null (não grava id vazio)", async () => {
    seqRaw([{ code: 1, status: "2" }, { code: 1, status: "P" }]);
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

describe("TunaError.message", () => {
  it("nunca leva o corpo cru: só status, code e a mensagem curta da Tuna", () => {
    const body = '{"customer":{"document":"12345678909"},"message":{"message":"Recusado"}}';
    const e = new TunaError(422, -1, body);
    expect(e.message).toBe("Tuna 422 (code -1): Recusado");
    expect(e.message).not.toContain("12345678909");
    expect(e.body).toBe(body); // corpo cru continua acessível no código
  });
  it("corpo sem mensagem (ou não-JSON) → só status/code", () => {
    expect(new TunaError(500, null, "<html>12345678909</html>").message).toBe("Tuna 500");
    expect(new TunaError(422, -113, '{"code":-113,"document":"12345678909"}').message).toBe("Tuna 422 (code -113)");
  });
  it("-108 no Init vira 503 mantendo a mensagem curta, sem o corpo", async () => {
    const body = { code: -108, customer: { document: "12345678909" }, message: { message: "Partner Unique ID already used" } };
    seq([body]);
    const e = (await tunaProvider
      .createCardTokenPayment!({
        est,
        reference: "PED-1",
        total: 20,
        platformFee: 1.6,
        description: "x",
        cardToken: "ct_1",
        installments: 1,
        method: "credit",
        tuna: { sessionId: "sess_1" },
      } as CardTokenPaymentInput)
      .catch((x: unknown) => x)) as TunaError;
    expect(e.status).toBe(503);
    expect(e.message).toBe("Tuna 503 (code -108): Partner Unique ID already used");
    expect(e.message).not.toContain("12345678909");
    expect(isDefiniteGatewayFailure(e)).toBe(false);
  });
});

describe("tunaSafeMessage", () => {
  it("usa message.message da Tuna (objeto)", () => {
    const e = new TunaError(
      422,
      -111,
      '{"code":-111,"message":{"source":1,"code":"SRVNoPartnerToken","message":"Inform the partner token in the request."}}',
    );
    expect(tunaSafeMessage(e)).toBe("Inform the partner token in the request.");
  });
  it("usa message quando a Tuna manda string", () => {
    expect(tunaSafeMessage(new TunaError(422, -1, '{"code":-1,"message":"Session object is invalid"}'))).toBe(
      "Session object is invalid",
    );
  });
  it("corpo não-JSON (HTML de 502, texto local) → tuna:<status>", () => {
    expect(tunaSafeMessage(new TunaError(502, null, "<html>Bad gateway 12345678909</html>"))).toBe("tuna:502");
    expect(tunaSafeMessage(new TunaError(422, null, "bar sem cadastro na Tuna"))).toBe("tuna:422");
  });
  it("JSON sem mensagem nunca ecoa o corpo (ex.: CPF)", () => {
    const e = new TunaError(422, -113, '{"code":-113,"customer":{"document":"12345678909"},"message":{"code":"X"}}');
    expect(tunaSafeMessage(e)).toBe("tuna:422");
  });
  it("limita a 160 caracteres", () => {
    const long = "x".repeat(400);
    const out = tunaSafeMessage(new TunaError(422, -1, JSON.stringify({ code: -1, message: { message: long } })));
    expect(out.length).toBeLessThanOrEqual(160);
  });
});

describe("tunaTokenUrl", () => {
  it("TEST: host do token padrão; override _TEST sem barra final", () => {
    expect(tunaTokenUrl()).toBe("https://token.tunagateway.com");
    process.env.TUNA_TOKEN_URL_TEST = "https://token.sandbox.example/";
    expect(tunaTokenUrl()).toBe("https://token.sandbox.example");
  });
  it("PRODUCTION: lê TUNA_TOKEN_URL (ignora _TEST)", () => {
    __setTunaModeForTests("PRODUCTION");
    process.env.TUNA_TOKEN_URL_TEST = "https://token.sandbox.example";
    expect(tunaTokenUrl()).toBe("https://token.tunagateway.com");
    process.env.TUNA_TOKEN_URL = "https://token.prod.example";
    expect(tunaTokenUrl()).toBe("https://token.prod.example");
  });
});

// ---- Rodada final: prontidão checada na cobrança + modo fail closed ----------

describe("guarda de prontidão na cobrança (mesma regra do painel)", () => {
  const pixIn = (e: Establishment): PixChargeInput => ({
    est: e, reference: "PED-G", total: 20, platformFee: 1.6, description: "Pedido PED-G",
  });
  const methods = {
    pix: (e: Establishment) => tunaProvider.createPixCharge(pixIn(e)),
    credit: (e: Establishment) => tunaProvider.createCardTokenPayment!(card({ est: e })),
    debit: (e: Establishment) =>
      tunaProvider.createCardTokenPayment!(card({ est: e, method: "debit", tuna: { sessionId: "sess_1", threeDs } })),
    wallet: (e: Establishment) =>
      tunaProvider.createWalletPayment!({
        est: e, reference: "PED-G", total: 20, platformFee: 1.6, description: "x",
        walletType: "google_pay", token: "{}",
      }),
  } as const;
  type M = keyof typeof methods;
  const group = (m: M) => (m === "pix" ? "Pix" : "cartão");

  /** Recusa DEFINITIVA local (422), sem nenhuma chamada à Tuna (nem NewSession). */
  async function expectRefused(m: M, e: Establishment, mode: "TEST" | "PRODUCTION") {
    const fn = seq([]);
    const err = (await methods[m](e).catch((x: unknown) => x)) as TunaError;
    expect(err).toBeInstanceOf(TunaError);
    expect(err.status).toBe(422);
    expect(tunaSafeMessage(err)).toBe(`bar não está pronto na Tuna (${group(m)}, ${mode})`);
    expect(isDefiniteGatewayFailure(err)).toBe(true);
    expect(fn).not.toHaveBeenCalled();
  }

  const all: M[] = ["pix", "credit", "debit", "wallet"];

  it.each(all)("%s: cadastro de TEST com o modo em PRODUCTION → recusa sem fetch", async (m) => {
    __setTunaModeForTests("PRODUCTION");
    await expectRefused(m, readyEst({ tunaMerchantEnv: "TEST" }), "PRODUCTION");
  });

  it.each(all)("%s: cadastro de PRODUCTION com o modo em TEST → recusa sem fetch", async (m) => {
    await expectRefused(m, readyEst({ tunaMerchantEnv: "PRODUCTION" }), "TEST");
  });

  it.each(all)("%s: sem cadastro (env null) → recusa sem fetch", async (m) => {
    await expectRefused(m, readyEst({ tunaMerchantEnv: null }), "TEST");
  });

  it.each(all)("%s: status do grupo não ativo → recusa sem fetch", async (m) => {
    const off = m === "pix" ? { tunaPixStatus: "analysis" } : { tunaCardStatus: "blocked" };
    await expectRefused(m, readyEst(off), "TEST");
  });

  it.each(["credit", "debit", "wallet"] as M[])("%s: cartões da Tuna desligados → recusa sem fetch", async (m) => {
    settings.getCards.mockResolvedValue(false);
    await expectRefused(m, est, "TEST");
  });

  it.each(all)("%s: em TEST com o bar fora de TUNA_TEST_SLUGS → recusa sem fetch", async (m) => {
    process.env.TUNA_TEST_SLUGS = "outro-bar";
    await expectRefused(m, est, "TEST");
  });

  it("Pix não depende da chave dos cartões (nem lê): cartões desligados e Pix pronto → cobra", async () => {
    settings.getCards.mockResolvedValue(false);
    const fn = seq([initOk({ status: "P" })]);
    await expect(methods.pix(est)).resolves.toMatchObject({ chargeId: "PK1" });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(settings.getCards).not.toHaveBeenCalled();
  });

  it("cartão com o Pix não pronto continua cobrando (grupos independentes)", async () => {
    const fn = seq([initOk()]);
    await expect(methods.credit(readyEst({ tunaPixStatus: "rejected" }))).resolves.toMatchObject({ status: "paid" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("PRODUCTION: bar cadastrado em PRODUCTION cobra mesmo fora de TUNA_TEST_SLUGS", async () => {
    __setTunaModeForTests("PRODUCTION");
    process.env.TUNA_TEST_SLUGS = "";
    const fn = seq([{ sessionId: "sess_w", code: 1 }, initOk()]);
    await expect(methods.wallet(readyEst({ tunaMerchantEnv: "PRODUCTION" }))).resolves.toMatchObject({
      status: "paid",
    });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(headersOf(fn, 1)["x-tuna-account"]).toBe("acc_p");
  });

  it("falha ao ler a chave dos cartões → recusa definitiva (424) sem fetch", async () => {
    settings.getCards.mockRejectedValue(new Error("db down"));
    const fn = seq([]);
    const err = (await methods.credit(est).catch((x: unknown) => x)) as TunaError;
    expect(err).toBeInstanceOf(TunaError);
    expect(err.status).toBe(424);
    expect(isDefiniteGatewayFailure(err)).toBe(true);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("ensureTunaMode fora do modo de teste (lê o banco)", () => {
  beforeEach(() => {
    // Desliga o atalho de teste (VITEST/NODE_ENV) pra exercitar a leitura real.
    vi.stubEnv("VITEST", "");
    vi.stubEnv("NODE_ENV", "production");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("leitura falha e nenhum modo em cache → TunaError 424 definitivo (nunca chuta TEST)", async () => {
    __setTunaModeForTests(null);
    settings.getMode.mockRejectedValue(new Error("db down"));
    const e = (await ensureTunaMode().catch((x: unknown) => x)) as TunaError;
    expect(e).toBeInstanceOf(TunaError);
    expect(e.status).toBe(424);
    expect(tunaSafeMessage(e)).toBe("modo da Tuna indisponível");
    expect(isDefiniteGatewayFailure(e)).toBe(true);
  });

  it("leitura falha com modo em cache vencido → segue com o cache", async () => {
    __setTunaModeForTests("PRODUCTION");
    bustTunaModeCache(); // vence o cache, mas guarda o último modo
    settings.getMode.mockRejectedValue(new Error("db down"));
    await expect(ensureTunaMode()).resolves.toBe("PRODUCTION");
  });

  it("bustTunaModeCache mantém o último modo (quem está no meio não vira TEST) e força reler o banco", async () => {
    process.env.TUNA_TOKEN_URL_TEST = "https://token.homolog.example";
    __setTunaModeForTests("PRODUCTION");
    settings.getMode.mockResolvedValue("TEST");
    await expect(ensureTunaMode()).resolves.toBe("PRODUCTION"); // cache válido: não lê
    expect(settings.getMode).not.toHaveBeenCalled();
    bustTunaModeCache();
    // Em memória continua PRODUCTION até a próxima leitura (antes virava TEST).
    expect(tunaTokenUrl()).toBe("https://token.tunagateway.com");
    await expect(ensureTunaMode()).resolves.toBe("TEST");
    expect(settings.getMode).toHaveBeenCalledTimes(1);
    expect(tunaTokenUrl()).toBe("https://token.homolog.example");
  });

  it("cobrança com o modo indisponível → recusa definitiva sem chamar a Tuna", async () => {
    __setTunaModeForTests(null);
    settings.getMode.mockRejectedValue(new Error("db down"));
    const fn = seq([]);
    const e = (await tunaProvider.createPixCharge({
      est, reference: "PED-M", total: 20, platformFee: 1.6, description: "x",
    }).catch((x: unknown) => x)) as TunaError;
    expect(e.status).toBe(424);
    expect(isDefiniteGatewayFailure(e)).toBe(true);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("cobrança usa o modo da checagem de prontidão (não relê no meio)", () => {
  it("cartão: modo do cache muda durante a leitura da chave dos cartões → Init com as credenciais do modo checado", async () => {
    // Guarda lê TEST; enquanto lê a chave dos cartões, outra requisição relê o modo (PRODUCTION).
    settings.getCards.mockImplementation(async () => {
      __setTunaModeForTests("PRODUCTION");
      return true;
    });
    process.env.TUNA_ENGINE_URL_TEST = "https://engine.homolog.example";
    const fn = seq([initOk()]);
    await expect(tunaProvider.createCardTokenPayment!(card())).resolves.toMatchObject({ status: "paid" });
    expect(fn.mock.calls[0][0]).toBe("https://engine.homolog.example/api/Payment/Init");
    expect(headersOf(fn)["x-tuna-account"]).toBe("acc_t");
    expect(headersOf(fn)["x-tuna-apptoken"]).toBe("tok_t");
  });

  it("carteira: modo muda durante o NewSession → NewSession e Init com o modo checado (TEST, Is3dsTest)", async () => {
    const fn = vi.fn();
    fn.mockImplementationOnce(async () => {
      __setTunaModeForTests("PRODUCTION"); // troca no meio da ida e volta do NewSession
      return new Response(JSON.stringify({ sessionId: "sess_w", code: 1 }), { status: 200 });
    });
    fn.mockResolvedValueOnce(new Response(JSON.stringify(initOk()), { status: 200 }));
    const lookup = vi.fn(async (_u: string, _i?: RequestInit) => new Response(JSON.stringify({ code: -102 }), { status: 200 }));
    vi.stubGlobal("fetch", vi.fn((u: string, i?: RequestInit) => (isLookup(i) ? lookup(u, i) : fn(u, i))));
    await expect(
      tunaProvider.createWalletPayment!({
        est, reference: "PED-R", total: 20, platformFee: 1.6, description: "x", walletType: "google_pay", token: "{}",
      }),
    ).resolves.toMatchObject({ status: "paid" });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(headersOf(fn, 0)["x-tuna-account"]).toBe("acc_t");
    expect(bodyOf(fn, 0).Is3dsTest).toBe(true);
    expect(headersOf(fn, 1)["x-tuna-account"]).toBe("acc_t");
    expect(headersOf(fn, 1)["x-tuna-apptoken"]).toBe("tok_t");
    // A consulta do pedido antes do Init também usa a conta do modo checado.
    expect(lookup).toHaveBeenCalled();
    for (const c of lookup.mock.calls as unknown as [string, { headers: Record<string, string> }][]) {
      expect(c[1].headers["x-tuna-account"]).toBe("acc_t");
    }
  });

  it("Pix: Init com as credenciais do modo checado", async () => {
    __setTunaModeForTests("PRODUCTION");
    const fn = seq([initOk({ status: "P" })]);
    await tunaProvider.createPixCharge({
      est: readyEst({ tunaMerchantEnv: "PRODUCTION" }), reference: "PED-P", total: 20, platformFee: 1.6, description: "x",
    });
    expect(headersOf(fn)["x-tuna-account"]).toBe("acc_p");
  });

  it("tunaPost com `mode` explícito ignora o modo do cache (credenciais, host)", async () => {
    __setTunaModeForTests("PRODUCTION");
    process.env.TUNA_TOKEN_URL_TEST = "https://token.homolog.example";
    const fn = respond({});
    await tunaPost("token", "/api/Token/NewSession", {}, { mode: "TEST" });
    expect(fn.mock.calls[0][0]).toBe("https://token.homolog.example/api/Token/NewSession");
    expect(fn.mock.calls[0][1].headers["x-tuna-account"]).toBe("acc_t");
  });

  it("createTunaSession com `mode` explícito usa esse modo (Is3dsTest e credenciais)", async () => {
    const fn = seq([{ sessionId: "sess_x", code: 1 }]);
    await createTunaSession({ id: "a", email: "b" }, "PRODUCTION");
    expect(bodyOf(fn)).not.toHaveProperty("Is3dsTest");
    expect(headersOf(fn)["x-tuna-account"]).toBe("acc_p");
  });
});
