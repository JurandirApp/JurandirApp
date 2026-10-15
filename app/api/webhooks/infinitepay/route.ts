import { confirmInfinitePayment } from "@/lib/db/payments";

export const dynamic = "force-dynamic";

type InfinitePayWebhook = {
  invoice_slug?: string;
  slug?: string;
  transaction_nsu?: string;
  order_nsu?: string;
};

/** Webhook da InfinitePay (pagamento aprovado). NÃO é assinado — a segurança vem
 *  do `confirmInfinitePayment` (payment_check autoritativo + valor >= total +
 *  slug do nosso link). Doc: responder 200 rápido; 400 faz a InfinitePay
 *  re-tentar — então 400 só em erro transitório (rede/banco). */
export async function POST(req: Request): Promise<Response> {
  let ev: InfinitePayWebhook;
  try {
    const raw = await req.text();
    ev = (raw ? JSON.parse(raw) : {}) as InfinitePayWebhook;
  } catch {
    return new Response("ok", { status: 200 }); // corpo inválido: não re-tentar
  }
  console.log("[infinitepay] webhook", JSON.stringify(ev));
  const orderNsu = ev.order_nsu;
  const slug = ev.invoice_slug ?? ev.slug;
  if (!orderNsu || !slug) return new Response("ok", { status: 200 });
  try {
    const { result } = await confirmInfinitePayment({
      orderNsu,
      slug,
      transactionNsu: ev.transaction_nsu,
    });
    return new Response(result, { status: 200 });
  } catch (e) {
    console.error("[infinitepay] webhook erro", e);
    return new Response("retry", { status: 400 });
  }
}
