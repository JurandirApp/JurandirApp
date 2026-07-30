import { createHmac } from "crypto";
import type { Establishment } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { PIX_EXPIRES_MIN } from "@/lib/domain/pricing";
import type {
  PaymentProvider,
  PixCharge,
  PixChargeInput,
  ChargeStatus,
  CheckoutPreferenceInput,
  CheckoutPreference,
  CardPaymentInput,
  CardPaymentResult,
  FoundPayment,
} from "./types";

const baseUrl = () => process.env.MP_BASE_URL ?? "https://api.mercadopago.com";
/** Token da conta que recebe, no modo conta-única (sem OAuth). Se
 *  MP_ACCESS_TOKEN (produção, APP_USR-…) estiver setado, usa ele → dinheiro real.
 *  Senão, cai no MP_TEST_ACCESS_TOKEN (sandbox). O prefixo TEST- do token é o que
 *  roteia entre checkout de sandbox e de produção (ver createCheckoutPreference). */
const testToken = () =>
  process.env.MP_ACCESS_TOKEN || process.env.MP_TEST_ACCESS_TOKEN || "";
/** Base pública do app — usada nas back_urls e notification_url do Checkout Pro. */
const appBase = () =>
  (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export class MpError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`MP ${status}: ${body}`);
    this.name = "MpError";
  }
}

async function call<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new MpError(res.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}

function mapStatus(s: string): ChargeStatus {
  if (s === "approved" || s === "authorized") return "paid";
  if (s === "pending" || s === "in_process" || s === "in_mediation") return "pending";
  return "failed";
}

type MpToken = { user_id: number; access_token: string; refresh_token: string; public_key: string };

async function refresh(est: Establishment): Promise<string> {
  const t = await call<MpToken>("/oauth/token", "", {
    method: "POST",
    body: JSON.stringify({
      client_id: process.env.MP_CLIENT_ID,
      client_secret: process.env.MP_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: est.mpRefreshToken,
    }),
  });
  await prisma.establishment.update({
    where: { id: est.id },
    data: { mpAccessToken: t.access_token, mpRefreshToken: t.refresh_token },
  });
  return t.access_token;
}

async function withToken<T>(est: Establishment, fn: (token: string) => Promise<T>): Promise<T> {
  try {
    return await fn(est.mpAccessToken ?? "");
  } catch (e) {
    if (e instanceof MpError && e.status === 401 && est.mpRefreshToken) {
      return await fn(await refresh(est));
    }
    throw e;
  }
}

type MpPayment = {
  id: number;
  status: string;
  point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
};

export const mercadoPagoProvider: PaymentProvider = {
  name: "MERCADO_PAGO",
  async createPixCharge(input: PixChargeInput): Promise<PixCharge> {
    const { est, reference, total, platformFee, customerName, description } = input;
    // Marketplace: cobra na conta do vendedor (OAuth) com application_fee (split).
    // Sem token de vendedor: modo conta-única de teste (MP_TEST_ACCESS_TOKEN), sem split.
    const marketplace = Boolean(est.mpAccessToken);
    const body = {
      transaction_amount: total,
      description,
      payment_method_id: "pix",
      external_reference: reference,
      // Expira em PIX_EXPIRES_MIN → o QR morre no MP e o pedido sai das listas.
      // MP exige offset numérico explícito (rejeita o "Z" do toISOString).
      date_of_expiration: new Date(Date.now() + PIX_EXPIRES_MIN * 60_000)
        .toISOString()
        .replace("Z", "+00:00"),
      ...(marketplace ? { application_fee: platformFee } : {}),
      payer: { email: "comprador@jurandir.app.br", first_name: customerName || "Cliente" },
    };
    const doCall = (token: string) =>
      call<MpPayment>("/v1/payments", token, {
        method: "POST",
        headers: { "X-Idempotency-Key": reference },
        body: JSON.stringify(body),
      });
    const r = marketplace ? await withToken(est, doCall) : await doCall(testToken());
    const tx = r.point_of_interaction?.transaction_data;
    return {
      chargeId: String(r.id),
      pixPayload: tx?.qr_code ?? "",
      pixQrImage: tx?.qr_code_base64 ?? "",
      status: mapStatus(r.status),
    };
  },
  async getChargeStatus(est: Establishment, chargeId: string): Promise<ChargeStatus> {
    const doCall = (token: string) => call<MpPayment>(`/v1/payments/${chargeId}`, token);
    const r = est.mpAccessToken ? await withToken(est, doCall) : await doCall(testToken());
    return mapStatus(r.status);
  },
  async createCheckoutPreference(input: CheckoutPreferenceInput): Promise<CheckoutPreference> {
    const { est, reference, platformFee, items, method } = input;
    // Marketplace: preferência na conta do vendedor (OAuth) com marketplace_fee (split).
    // Sem token de vendedor: conta-única de teste (MP_TEST_ACCESS_TOKEN), sem split.
    const marketplace = Boolean(est.mpAccessToken);
    const back = `${appBase()}/pt/${est.slug}?paid=1`;
    // MP só aceita auto_return com back_url HTTPS — em localhost (dev) fica sem
    // (o cliente volta pelo botão do MP; o polling reconcilia de qualquer forma).
    const httpsBase = appBase().startsWith("https://");
    // Restringe o tipo de cartão conforme a escolha do app (nunca boleto). Débito
    // → exclui crédito; crédito → exclui débito + trava em 1x (à vista).
    const excluded: { id: string }[] = [{ id: "ticket" }];
    if (method === "DEBIT") excluded.push({ id: "credit_card" });
    if (method === "CREDIT") excluded.push({ id: "debit_card" });
    const body = {
      items: items.map((i) => ({
        title: i.title,
        quantity: i.quantity,
        unit_price: i.unitPrice,
        currency_id: "BRL",
      })),
      external_reference: reference,
      back_urls: { success: back, failure: back, pending: back },
      ...(httpsBase ? { auto_return: "approved" } : {}),
      notification_url: `${appBase()}/api/webhooks/mercadopago`,
      payment_methods: {
        excluded_payment_types: excluded,
        ...(method === "CREDIT" ? { installments: 1, default_installments: 1 } : {}),
      },
      ...(marketplace ? { marketplace_fee: platformFee } : {}),
    };
    const doCall = (token: string) =>
      call<{ id: string; init_point: string; sandbox_init_point: string }>(
        "/checkout/preferences",
        token,
        { method: "POST", body: JSON.stringify(body) },
      );
    const usedToken = marketplace ? est.mpAccessToken! : testToken();
    const r = marketplace ? await withToken(est, doCall) : await doCall(testToken());
    // Token de teste (TEST-…) usa a URL de sandbox; produção usa init_point.
    const isTest = usedToken.startsWith("TEST-");
    return {
      preferenceId: r.id,
      checkoutUrl: isTest ? r.sandbox_init_point : r.init_point,
    };
  },
  async createCardPayment(input: CardPaymentInput): Promise<CardPaymentResult> {
    const { est, reference, total, platformFee, description, brick } = input;
    // Marketplace: cobra na conta do vendedor (OAuth) com application_fee (split).
    const marketplace = Boolean(est.mpAccessToken);
    const body = {
      transaction_amount: total,
      description,
      external_reference: reference,
      installments: brick.installments ?? 1,
      payment_method_id: brick.payment_method_id,
      ...(brick.token ? { token: brick.token } : {}),
      ...(brick.issuer_id ? { issuer_id: brick.issuer_id } : {}),
      ...(marketplace ? { application_fee: platformFee } : {}),
      payer: {
        email: brick.payer?.email || "comprador@jurandir.app.br",
        ...(brick.payer?.identification ? { identification: brick.payer.identification } : {}),
      },
    };
    const doCall = (token: string) =>
      call<{ id: number; status: string; status_detail?: string }>("/v1/payments", token, {
        method: "POST",
        // Obrigatório pelo MP; cada tentativa é um pedido novo (reference único).
        headers: { "X-Idempotency-Key": reference },
        body: JSON.stringify(body),
      });
    const r = marketplace ? await withToken(est, doCall) : await doCall(testToken());
    return { chargeId: String(r.id), status: mapStatus(r.status), statusDetail: r.status_detail };
  },
  async findApprovedPayment(est: Establishment, reference: string): Promise<FoundPayment | null> {
    const doCall = (token: string) =>
      call<{ results: MpPayment[] }>(
        `/v1/payments/search?external_reference=${encodeURIComponent(reference)}&sort=date_created&criteria=desc`,
        token,
      );
    const r = est.mpAccessToken ? await withToken(est, doCall) : await doCall(testToken());
    const paid = (r.results ?? []).find((p) => mapStatus(p.status) === "paid");
    return paid ? { paymentId: String(paid.id), status: "paid" } : null;
  },
};

/** Verifica se a conta MP conectada consegue gerar QR Pix (tem chave Pix). Faz
 *  uma cobrança mínima que expira em 5 min: se der o erro "sem chave" (código
 *  13253 / "without key enabled for QR"), a conta não está pronta pro Pix. Só
 *  cria a cobrança-teste quando a conta ESTÁ ok (senão o MP recusa antes de criar). */
export async function probePixReady(est: Establishment): Promise<{
  ready: boolean;
  reason: "not-connected" | "ok" | "no-key" | "error";
}> {
  if (!est.mpAccessToken) return { ready: true, reason: "not-connected" };
  const ref = "PIXCHECK-" + est.id.slice(0, 10) + "-" + Date.now();
  const body = {
    transaction_amount: 1,
    description: "Verificacao Pix (Jurandir)",
    payment_method_id: "pix",
    external_reference: ref,
    date_of_expiration: new Date(Date.now() + 5 * 60_000)
      .toISOString()
      .replace("Z", "+00:00"),
    payer: { email: "verificacao@jurandir.app.br", first_name: "Jurandir" },
  };
  try {
    await withToken(est, (token) =>
      call<MpPayment>("/v1/payments", token, {
        method: "POST",
        headers: { "X-Idempotency-Key": ref },
        body: JSON.stringify(body),
      }),
    );
    return { ready: true, reason: "ok" };
  } catch (e) {
    if (
      e instanceof MpError &&
      (e.body.includes("13253") || /without key enabled for QR/i.test(e.body))
    ) {
      return { ready: false, reason: "no-key" };
    }
    return { ready: false, reason: "error" };
  }
}

export function getOAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.MP_CLIENT_ID ?? "",
    response_type: "code",
    platform_id: "mp",
    redirect_uri: process.env.MP_REDIRECT_URI ?? "",
    state,
  });
  return `https://auth.mercadopago.com.br/authorization?${p.toString()}`;
}

export async function exchangeOAuthCode(code: string): Promise<{
  userId: string;
  accessToken: string;
  refreshToken: string;
  publicKey: string;
}> {
  const t = await call<MpToken>("/oauth/token", "", {
    method: "POST",
    body: JSON.stringify({
      client_id: process.env.MP_CLIENT_ID,
      client_secret: process.env.MP_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.MP_REDIRECT_URI,
    }),
  });
  return {
    userId: String(t.user_id),
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    publicKey: t.public_key,
  };
}

export type OAuthDest = "admin" | "painel";

/** Assina o estId + destino de retorno no `state` do OAuth (anti-tampering). */
export function signState(estId: string, dest: OAuthDest = "admin"): string {
  const payload = `${estId}~${dest}`;
  const sig = createHmac("sha256", process.env.AUTH_SECRET ?? "").update(payload).digest("hex").slice(0, 16);
  return `${payload}.${sig}`;
}

export function verifyState(
  state: string,
): { estId: string; dest: OAuthDest } | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", process.env.AUTH_SECRET ?? "").update(payload).digest("hex").slice(0, 16);
  if (sig !== expected) return null;
  const [estId, dest] = payload.split("~");
  if (!estId) return null;
  return { estId, dest: dest === "painel" ? "painel" : "admin" };
}
