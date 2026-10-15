import type { Establishment } from "@prisma/client";
import type {
  ChargeStatus,
  CheckoutPreference,
  CheckoutPreferenceInput,
  PaymentProvider,
  PixCharge,
} from "./types";

// InfinitePay (Checkout Integrado) — 6º gateway. Modelo decidido: InfiniteTag
// ÚNICA da plataforma, SEM split: todo o dinheiro cai na conta do Jurandir e o
// repasse ao bar é manual. Doc: https://www.infinitepay.io/checkout-documentacao
//
//  - Sem API key: o único identificador é o `handle` (InfiniteTag sem o "$"),
//    configurado em INFINITEPAY_HANDLE.
//  - Checkout HOSPEDADO: criamos um link e o cliente paga Pix ou crédito (até 12x)
//    na página da InfinitePay. Não existe QR Pix por API → Pix também vai por link.
//  - Preços em CENTAVOS. `order_nsu` = código do pedido (Order.code, único).
//  - ⚠️ Criar link NÃO exige autenticação e o webhook NÃO é assinado: qualquer um
//    pode criar um link com o nosso handle e o `order_nsu` de outro pedido, por
//    um valor menor. Por isso NUNCA confiamos no webhook: confirmamos no
//    `payment_check` E exigimos que o valor cubra o total do pedido.
//  - A doc não mostra o formato da resposta do POST /links nem a unidade dos
//    valores do payment_check → leitura defensiva + log `[infinitepay]` (o 1º
//    teste real, de valor baixo, confirma os formatos).

const apiBase = () =>
  (process.env.INFINITEPAY_BASE_URL ?? "https://api.checkout.infinitepay.io").replace(/\/$/, "");
const appBase = () => (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** InfiniteTag da plataforma, sem o "$". Vazio = gateway não configurado. */
export const infinitePayHandle = () => (process.env.INFINITEPAY_HANDLE ?? "").trim().replace(/^\$/, "");

export class InfinitePayError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`InfinitePay ${status}: ${body.slice(0, 300)}`);
    this.name = "InfinitePayError";
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new InfinitePayError(res.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}

const cents = (v: number) => Math.round(v * 100);

// ---- helpers PUROS (testados em tests/payments/infinitepay.test.ts) ----------

/** `gatewayChargeId` de uma cobrança InfinitePay: "ip|<order_nsu>|<slug>[|<transaction_nsu>]". */
export function buildChargeId(orderNsu: string, slug: string, transactionNsu?: string): string {
  return ["ip", orderNsu, slug, ...(transactionNsu ? [transactionNsu] : [])].join("|");
}

export function parseChargeId(
  id: string,
): { orderNsu: string; slug: string; transactionNsu?: string } | null {
  const [tag, orderNsu, slug, transactionNsu] = id.split("|");
  if (tag !== "ip" || !orderNsu || !slug) return null;
  return { orderNsu, slug, ...(transactionNsu ? { transactionNsu } : {}) };
}

/** URL (e slug, se vier explícito) da resposta do POST /links — formato não
 *  documentado, então aceita os nomes prováveis. O slug NÃO é deduzido da URL
 *  (um palpite errado travaria a confirmação de pagamentos legítimos). */
export function readLinkResponse(r: unknown): { url: string | null; slug: string | null } {
  const o = (r ?? {}) as Record<string, unknown>;
  const d = (o.data ?? {}) as Record<string, unknown>;
  const pick = (...vals: unknown[]) =>
    (vals.find((v) => typeof v === "string" && v.length > 0) as string | undefined) ?? null;
  return {
    url: pick(o.url, o.link, o.checkout_url, o.payment_url, d.url, d.link, d.checkout_url),
    slug: pick(o.slug, o.invoice_slug, d.slug, d.invoice_slug),
  };
}

/** O valor pago cobre o total do pedido? Valores da InfinitePay assumidos em
 *  CENTAVOS (como o `price` do link). Fail-safe: na dúvida, NÃO confirma — um
 *  pagamento legítimo travado aparece no log e é resolvido; um link barato
 *  forjado com o order_nsu de outro pedido jamais é aceito. */
export function amountCovers(total: number, amountCents: unknown): boolean {
  const a = Number(amountCents);
  if (!Number.isFinite(a) || a <= 0) return false;
  return a >= cents(total) - 1; // 1 centavo de tolerância de arredondamento
}

// ---- API ---------------------------------------------------------------------

export type InfinitePayCheck = {
  success?: boolean;
  paid?: boolean;
  amount?: number;
  paid_amount?: number;
  installments?: number;
  capture_method?: string;
};

/** Consulta autoritativa (`POST /payment_check`). */
export async function checkInfinitePayment(input: {
  orderNsu: string;
  slug: string;
  transactionNsu?: string;
}): Promise<InfinitePayCheck> {
  const r = await post<InfinitePayCheck>("/payment_check", {
    handle: infinitePayHandle(),
    order_nsu: input.orderNsu,
    slug: input.slug,
    ...(input.transactionNsu ? { transaction_nsu: input.transactionNsu } : {}),
  });
  console.log("[infinitepay] payment_check", JSON.stringify({ ...input, r }));
  return r;
}

export const infinitePayProvider: PaymentProvider = {
  name: "INFINITEPAY",

  /** Não há QR Pix por API — o Pix da InfinitePay é pela página hospedada
   *  (createCheckoutPreference). O createOrder já não chama isto pra InfinitePay;
   *  só o split (um Pix por pessoa) cairia aqui, e não é suportado. */
  async createPixCharge(): Promise<PixCharge> {
    throw new Error("infinitepay: Pix só pelo checkout hospedado (split não suportado)");
  },

  /** Polling/reconciliação: com o slug do NOSSO link (gravado na criação). Sem o
   *  transaction_nsu a consulta pode não confirmar — o webhook e o retorno da
   *  página (que trazem tudo) são os caminhos principais. Nunca lança. */
  async getChargeStatus(_est: Establishment, chargeId: string): Promise<ChargeStatus> {
    const c = parseChargeId(chargeId);
    if (!c) return "pending";
    try {
      const r = await checkInfinitePayment(c);
      return r.paid ? "paid" : "pending";
    } catch {
      return "pending";
    }
  },

  async createCheckoutPreference(input: CheckoutPreferenceInput): Promise<CheckoutPreference> {
    const handle = infinitePayHandle();
    if (!handle) throw new Error("infinitepay: INFINITEPAY_HANDLE não configurado");
    const body = {
      handle,
      order_nsu: input.reference,
      items: input.items.map((i) => ({
        quantity: i.quantity,
        price: cents(i.unitPrice),
        description: i.title,
      })),
      redirect_url: `${appBase()}/api/payments/infinitepay/return`,
      webhook_url: `${appBase()}/api/webhooks/infinitepay`,
    };
    const r = await post<unknown>("/links", body);
    console.log("[infinitepay] links", JSON.stringify({ order_nsu: input.reference, r }));
    const { url, slug } = readLinkResponse(r);
    if (!url) throw new Error(`infinitepay: resposta sem URL do link: ${JSON.stringify(r).slice(0, 300)}`);
    return {
      preferenceId: slug ?? input.reference,
      checkoutUrl: url,
      ...(slug ? { chargeId: buildChargeId(input.reference, slug) } : {}),
    };
  },
};
