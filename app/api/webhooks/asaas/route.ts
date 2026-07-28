import { confirmChargePaid } from "@/lib/db/payments";

/** Webhook do Asaas: confirma o pedido quando a cobrança é recebida. */
export async function POST(req: Request): Promise<Response> {
  if (req.headers.get("asaas-access-token") !== process.env.ASAAS_WEBHOOK_TOKEN) {
    return new Response("unauthorized", { status: 401 });
  }
  try {
    const body = await req.json();
    const event: string = body?.event;
    const chargeId: string | undefined = body?.payment?.id;
    if (chargeId && (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED")) {
      await confirmChargePaid(chargeId);
    }
  } catch {
    // corpo inválido — ignora; respondemos 200 para o Asaas não reentregar em loop
  }
  return new Response("ok", { status: 200 });
}
