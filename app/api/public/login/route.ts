import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { signSession } from "@/lib/auth/jwt";
import { loginSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * POST /api/public/login  { email, password }
 * Login real (mesma verificação do web: bcrypt no Neon). Só existem usuários
 * ESTABLISHMENT e ADMIN — cliente é anônimo. Devolve um JWT (para o app guardar
 * e usar nas rotas protegidas dos painéis) + os dados do usuário.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid" }, { status: 400, headers: CORS });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalid" }, { status: 422, headers: CORS });
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.trim().toLowerCase() },
  });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return Response.json({ ok: false, error: "invalidCredentials" }, { status: 401, headers: CORS });
  }

  const token = await signSession({
    sub: user.id,
    role: user.role,
    establishmentId: user.establishmentId,
    name: user.name,
  });

  return Response.json(
    {
      ok: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role, // ADMIN | ESTABLISHMENT
        establishmentId: user.establishmentId,
      },
    },
    { headers: CORS },
  );
}
