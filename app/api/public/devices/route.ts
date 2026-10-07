import { authWaiter } from "@/lib/auth/waiter";
import { authEstablishment } from "@/lib/auth/bearer";
import { registerDevice } from "@/lib/db/devices";
import { deviceRegisterSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/** POST — registra um device token para notificações. */
export async function POST(req: Request): Promise<Response> {
  const parsed = deviceRegisterSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalid" }, { status: 422, headers: CORS });
  }

  // Garçom OU estabelecimento registram um token vinculado ao bar (userId +
  // establishmentId) — os dois recebem os chamados (notifyWaitersHelp pega todo
  // usuário do bar com token). Sem sessão de bar → token de cliente.
  const w = await authWaiter(req);
  const e = w ? null : await authEstablishment(req);
  if (w) {
    await registerDevice({
      token: parsed.data.token,
      userId: w.userId,
      establishmentId: w.establishmentId,
    });
  } else if (e) {
    await registerDevice({
      token: parsed.data.token,
      userId: e.sub,
      establishmentId: e.establishmentId ?? null,
    });
  } else {
    await registerDevice({
      token: parsed.data.token,
      clientId: parsed.data.clientId,
    });
  }

  return Response.json({ ok: true }, { headers: CORS });
}
