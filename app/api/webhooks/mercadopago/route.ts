import { createHmac } from "crypto";
import { reconcileByChargeId } from "@/lib/db/payments";

/** Valida a assinatura x-signature do MP quando MP_WEBHOOK_SECRET está configurado.
 *  Sem segredo, confiamos no re-fetch autoritativo em reconcileByChargeId. */
function signatureOk(req: Request, dataId: string): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return true;
  const sig = req.headers.get("x-signature") ?? "";
  const reqId = req.headers.get("x-request-id") ?? "";
  const parts = Object.fromEntries(
    sig.split(",").map((kv) => kv.split("=").map((s) => s.trim()) as [string, string]),
  );
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;
  const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;
  const hmac = createHmac("sha256", secret).update(manifest).digest("hex");
  return hmac === v1;
}

/** Webhook do Mercado Pago: re-consulta o pagamento (autoritativo) e confirma se aprovado. */
export async function POST(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const body = (await req.json().catch(() => ({}))) as {
      type?: string;
      data?: { id?: string };
    };
    const type = body.type ?? url.searchParams.get("type");
    const id = body.data?.id ?? url.searchParams.get("data.id");
    if (type === "payment" && id && signatureOk(req, String(id))) {
      await reconcileByChargeId(String(id));
    }
  } catch {
    // ignora corpo inválido
  }
  return new Response("ok", { status: 200 });
}
