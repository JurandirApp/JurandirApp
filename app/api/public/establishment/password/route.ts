import { authEstablishment } from "@/lib/auth/bearer";
import { prisma } from "@/lib/db/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * POST /api/public/establishment/password
 * Autenticado (Bearer). Body: { current, next }. Confere a senha atual e troca
 * pela nova (mín. 6). O usuário é o dono logado (sub do token).
 */
export async function POST(req: Request): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers: CORS });

  let body: { current?: unknown; next?: unknown };
  try {
    body = (await req.json()) as { current?: unknown; next?: unknown };
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400, headers: CORS });
  }
  const current = typeof body.current === "string" ? body.current : "";
  const next = typeof body.next === "string" ? body.next : "";
  if (!current || next.length < 6) {
    return Response.json({ ok: false, error: "invalid" }, { status: 422, headers: CORS });
  }

  const user = await prisma.user.findUnique({ where: { id: s.sub } });
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers: CORS });

  const valid = await verifyPassword(current, user.passwordHash);
  if (!valid) {
    return Response.json({ ok: false, error: "currentWrong" }, { status: 400, headers: CORS });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next) },
  });
  return Response.json({ ok: true }, { headers: CORS });
}
