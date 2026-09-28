import { createOrder, getOrdersByIds } from "@/lib/db/orders";
import { payOrderWithCardToken, resolveChargeableOrder } from "@/lib/db/payments";
import { orderCreateSchema } from "@/lib/validation";
import { toClientOrder } from "@/lib/app/adapters";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * POST /api/public/orders/card
 * Body: { order: <orderCreateInput com payment.method=CREDIT|DEBIT>,
 *         cardToken: string, installments?: number, method?: "credit"|"debit" }
 * Cria o pedido e cobra o cartão via `card_token` (tokenização Pagar.me v5 — o
 * app tokeniza com a chave pública; o cartão cru NUNCA chega aqui).
 */
export async function POST(req: Request): Promise<Response> {
  let body: {
    order?: unknown;
    orderId?: unknown;
    customerDocument?: unknown;
    cardToken?: unknown;
    installments?: unknown;
    method?: unknown;
    billing?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400, headers: CORS });
  }

  const cardToken = typeof body.cardToken === "string" ? body.cardToken : "";
  if (!cardToken) {
    return Response.json({ ok: false, error: "tokenRequired" }, { status: 422, headers: CORS });
  }
  // Billing do portador (antifraude Pagar.me). O app resolve o CEP e manda os 4
  // campos; só passa adiante se todos vierem como string preenchida.
  const b = (body.billing ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const billing =
    str(b.line_1) && str(b.zip_code) && str(b.city) && str(b.state)
      ? { line_1: str(b.line_1), zip_code: str(b.zip_code), city: str(b.city), state: str(b.state) }
      : undefined;
  const method = body.method === "debit" ? "debit" : "credit";
  const installments =
    typeof body.installments === "number" && Number.isInteger(body.installments) && body.installments > 0
      ? body.installments
      : 1;

  // Fluxo resiliente (novo app): o pedido é criado ANTES (o app já tem o id) e
  // aqui só cobramos. Fluxo antigo (compat): vem `order` e criamos + cobramos.
  const existingId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  const bodyDoc = typeof body.customerDocument === "string" ? body.customerDocument : undefined;

  try {
    let targetId: string;
    let payerDoc: string | undefined;
    if (existingId) {
      const r = await resolveChargeableOrder(existingId);
      if (r.kind === "notfound") {
        return Response.json({ ok: false, error: "orderNotFound" }, { status: 404, headers: CORS });
      }
      if (r.kind === "settled") {
        // Já pago ou já com cobrança em andamento — NÃO cobra de novo.
        const [f] = await getOrdersByIds([existingId]);
        return Response.json(
          { ok: true, status: r.status, order: f ? toClientOrder(f) : null },
          { headers: CORS },
        );
      }
      targetId = r.id;
      payerDoc = bodyDoc;
    } else {
      const parsed = orderCreateSchema.safeParse(body.order);
      if (!parsed.success) {
        return Response.json({ ok: false, error: "invalidOrder" }, { status: 422, headers: CORS });
      }
      const created = await createOrder(parsed.data);
      targetId = created.id;
      payerDoc = parsed.data.customerDocument;
    }

    const pay = await payOrderWithCardToken(targetId, cardToken, installments, method, payerDoc, billing);
    const [fresh] = await getOrdersByIds([targetId]);
    return Response.json(
      {
        ok: pay.status !== "failed",
        status: pay.status, // paid | pending | failed
        detail: pay.statusDetail,
        order: fresh ? toClientOrder(fresh) : null,
      },
      { headers: CORS },
    );
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[orders/card] falha ao cobrar cartão:", detail);
    return Response.json({ ok: false, status: "failed", error: "failed" }, { status: 500, headers: CORS });
  }
}
