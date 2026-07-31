import { createHmac, timingSafeEqual } from "crypto";
import { reconcileByChargeId } from "@/lib/db/payments";

/** Valida o X-Hub-Signature do Pagar.me quando PAGARME_WEBHOOK_SECRET está setado.
 *  Sem segredo, confiamos no re-fetch autoritativo em reconcileByChargeId (um
 *  atacante não consegue "marcar pago" — o status vem do próprio Pagar.me). */
function signatureOk(raw: string, header: string | null): boolean {
  const secret = process.env.PAGARME_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!header) return false;
  // Formato "sha256=<hex>" (ou "sha1=<hex>"). Testa os dois algoritmos.
  const [algo, sent] = header.includes("=") ? header.split("=") : ["sha256", header];
  const alg = algo === "sha1" ? "sha1" : "sha256";
  const expected = createHmac(alg, secret).update(raw).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  } catch {
    return false;
  }
}

type PgEvent = {
  type?: string;
  data?: { id?: string; charges?: { id?: string }[] };
};

/** Extrai o id da cobrança (ch_…) do evento — direto ou via o pedido. */
function chargeIdOf(ev: PgEvent): string | null {
  const id = ev.data?.id;
  if (id && id.startsWith("ch_")) return id;
  const fromOrder = ev.data?.charges?.[0]?.id;
  return fromOrder ?? (id ?? null);
}

/** Webhook do Pagar.me: re-consulta a cobrança (autoritativo) e confirma se paga. */
export async function POST(req: Request): Promise<Response> {
  try {
    const raw = await req.text();
    if (!signatureOk(raw, req.headers.get("x-hub-signature"))) {
      return new Response("invalid signature", { status: 401 });
    }
    const ev = (raw ? JSON.parse(raw) : {}) as PgEvent;
    const chargeId = chargeIdOf(ev);
    // Só reage a eventos de cobrança paga/atualizada; o re-fetch decide de fato.
    if (chargeId && (ev.type ?? "").startsWith("charge")) {
      await reconcileByChargeId(chargeId);
    }
  } catch {
    // ignora corpo inválido
  }
  return new Response("ok", { status: 200 });
}
