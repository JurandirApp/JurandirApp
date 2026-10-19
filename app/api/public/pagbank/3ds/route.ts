import { threeDsPageHtml } from "@/lib/payments/threeds-page";

export const dynamic = "force-dynamic";

/** GET /api/public/pagbank/3ds — página 3DS aberta pela WebView do app. */
export async function GET(): Promise<Response> {
  return new Response(threeDsPageHtml(), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
