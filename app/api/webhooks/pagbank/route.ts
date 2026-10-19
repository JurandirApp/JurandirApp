import { reconcileByChargeId } from "@/lib/db/payments";
import { chargeIdsOf } from "@/lib/payments/pagbank";

/** Webhook do PagBank: o corpo é o pedido inteiro (com `charges[]`). Não
 *  confiamos no status do corpo — re-consultamos cada cobrança (autoritativo),
 *  então um POST forjado não consegue "marcar pago". */
export async function POST(req: Request): Promise<Response> {
  let order: { id?: string; reference_id?: string; charges?: { id?: string }[] };
  let charges: string[];
  try {
    const raw = await req.text();
    order = (raw ? JSON.parse(raw) : {}) as typeof order;
    charges = chargeIdsOf(order);
  } catch {
    // corpo inválido: ignora e responde 200
    console.warn("[pagbank/webhook] corpo inválido");
    return new Response("ok", { status: 200 });
  }
  console.log(
    "[pagbank/webhook]",
    JSON.stringify({ orderId: order.id, reference: order.reference_id, charges }),
  );
  for (const id of charges) {
    try {
      await reconcileByChargeId(id);
      console.log("[pagbank/webhook] reconciliado", id);
    } catch (e) {
      console.error(
        "[pagbank/webhook] falha ao reconciliar",
        id,
        e instanceof Error ? e.message : "erro",
      );
    }
  }
  return new Response("ok", { status: 200 });
}
