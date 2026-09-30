import { prisma } from "@/lib/db/prisma";
import { exchangeConnectCode, verifyConnectState } from "@/lib/payments/pagbank";

/** Callback do Connect do PagBank: troca o code pelo account_id (ACCO_…) do bar
 *  e o grava — a partir daí as cobranças PagBank dividem o valor com ele. */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const estId = state ? verifyConnectState(state) : null;
  const back = (q: string) => Response.redirect(new URL(`/painel?pb=${q}`, req.url).toString(), 303);
  if (!code || !estId) return back("error");
  try {
    const { accountId } = await exchangeConnectCode(code);
    await prisma.establishment.update({
      where: { id: estId },
      data: { pagbankAccountId: accountId },
    });
    return back("ok");
  } catch (e) {
    console.error("[pagbank/callback] falha no connect:", e instanceof Error ? e.message : String(e));
    return back("error");
  }
}
