import { reconcileByChargeId } from "@/lib/db/payments";
import { chargeIdsOf } from "@/lib/payments/pagbank";

/** Webhook do PagBank: o corpo é o pedido inteiro (com `charges[]`). Não
 *  confiamos no status do corpo — re-consultamos cada cobrança (autoritativo),
 *  então um POST forjado não consegue "marcar pago". */
export async function POST(req: Request): Promise<Response> {
  try {
    const raw = await req.text();
    const order = (raw ? JSON.parse(raw) : {}) as {
      id?: string;
      reference_id?: string;
      charges?: { id?: string }[];
    };
    const charges = chargeIdsOf(order);
    console.log(
      "[pagbank/webhook]",
      JSON.stringify({ orderId: order.id, reference: order.reference_id, charges }),
    );
    for (const id of charges) {
      await reconcileByChargeId(id);
      console.log("[pagbank/webhook] reconciliado", id);
    }
  } catch {
    console.warn("[pagbank/webhook] corpo inválido");
    // ignora corpo inválido
  }
  return new Response("ok", { status: 200 });
}
