import { confirmInfinitePayment } from "@/lib/db/payments";

export const dynamic = "force-dynamic";

const appBase = () => (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Retorno da página da InfinitePay (`redirect_url`). Ela anexa `order_nsu`,
 *  `slug`, `transaction_nsu`, `receipt_url` e `capture_method` → confirmamos
 *  (mesma verificação segura do webhook — os parâmetros da URL não são confiáveis)
 *  e mandamos o cliente pra página do bar, igual ao retorno do Mercado Pago.
 *  Cliente do app: o app confirma sozinho pelo polling. */
export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const orderNsu = q.get("order_nsu") ?? "";
  const slug = q.get("slug") ?? "";
  let estSlug: string | undefined;
  if (orderNsu && slug) {
    try {
      ({ estSlug } = await confirmInfinitePayment({
        orderNsu,
        slug,
        transactionNsu: q.get("transaction_nsu") ?? undefined,
      }));
    } catch (e) {
      console.error("[infinitepay] retorno erro", e); // webhook/polling ainda confirmam
    }
  }
  const dest = estSlug ? `${appBase()}/pt/${estSlug}?paid=1` : appBase();
  return Response.redirect(dest, 303);
}
