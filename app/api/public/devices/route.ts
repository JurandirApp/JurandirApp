import { authWaiter } from "@/lib/auth/waiter";
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

  const s = await authWaiter(req);
  if (s) {
    await registerDevice({
      token: parsed.data.token,
      userId: s.userId,
      establishmentId: s.establishmentId,
    });
  } else {
    await registerDevice({
      token: parsed.data.token,
      clientId: parsed.data.clientId,
    });
  }

  return Response.json({ ok: true }, { headers: CORS });
}
