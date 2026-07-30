import { prisma } from "@/lib/db/prisma";
import {
  exchangeOAuthCode,
  verifyState,
  probePixReady,
} from "@/lib/payments/mercadopago";

/** Callback OAuth do Mercado Pago: troca o code por tokens e ativa pagamentos no estabelecimento. */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const v = state ? verifyState(state) : null;
  const dest = v?.dest === "painel" ? "painel" : "admin";
  const back = (q: string) => Response.redirect(new URL(`/${dest}?mp=${q}`, req.url).toString(), 303);
  if (!code || !v) return back("error");
  try {
    const t = await exchangeOAuthCode(code);
    const est = await prisma.establishment.update({
      where: { id: v.estId },
      data: {
        paymentProvider: "MERCADO_PAGO",
        mpUserId: t.userId,
        mpAccessToken: t.accessToken,
        mpRefreshToken: t.refreshToken,
        mpPublicKey: t.publicKey,
        paymentOnboarded: true,
      },
    });
    // Já testa se a conta consegue gerar QR Pix → o painel avisa o dono se não
    // tiver chave Pix (sem isso, o cliente é quem descobre no checkout).
    try {
      const pix = await probePixReady(est);
      await prisma.establishment.update({
        where: { id: est.id },
        data: { mpPixReady: pix.reason === "not-connected" ? null : pix.ready },
      });
    } catch {
      /* não bloqueia o connect */
    }
    return back("ok");
  } catch {
    return back("error");
  }
}
