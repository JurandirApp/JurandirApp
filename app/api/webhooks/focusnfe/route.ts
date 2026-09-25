import { reconcileFiscalByRef } from "@/lib/db/fiscal";

type FocusEvent = {
  ref?: string;
  status?: string;
  cnpj_emitente?: string;
};

/** Webhook do Focus NFe. O Focus notifica quando a nota muda de estado
 *  (autorizada/rejeitada), mandando o `ref` que enviamos na emissão. NÃO
 *  confiamos no corpo: `reconcileFiscalByRef` re-consulta o estado autoritativo
 *  no próprio Focus (GET /v2/nfce/<ref>) antes de gravar — mesma blindagem dos
 *  webhooks de pagamento (sem assinatura). Responder 200 rápido; é idempotente. */
export async function POST(req: Request): Promise<Response> {
  try {
    const raw = await req.text();
    const ev = (raw ? JSON.parse(raw) : {}) as FocusEvent;
    if (ev.ref) await reconcileFiscalByRef(ev.ref);
  } catch {
    // corpo inválido — 200 mesmo assim, pro Focus não re-tentar em loop.
  }
  return new Response("ok", { status: 200 });
}
