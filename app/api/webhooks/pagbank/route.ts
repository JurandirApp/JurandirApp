import { reconcileByChargeId } from "@/lib/db/payments";
import { chargeIdsOf } from "@/lib/payments/pagbank";

/** Webhook do PagBank: o corpo é o pedido inteiro (com `charges[]`). Não
 *  confiamos no status do corpo — re-consultamos cada cobrança (autoritativo),
 *  então um POST forjado não consegue "marcar pago". */
export async function POST(req: Request): Promise<Response> {
  try {
    const raw = await req.text();
    const order = (raw ? JSON.parse(raw) : {}) as { charges?: { id?: string }[] };
    for (const id of chargeIdsOf(order)) await reconcileByChargeId(id);
  } catch {
    // ignora corpo inválido
  }
  return new Response("ok", { status: 200 });
}
