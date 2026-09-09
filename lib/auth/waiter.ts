import { verifySession } from "./jwt";

/**
 * Autentica uma request do app pelo header `Authorization: Bearer <jwt>`.
 * Retorna a sessão só se for um usuário WAITER vinculado a um estabelecimento —
 * usado pelas rotas protegidas do painel/app do garçom (`/api/public/waiter/*`).
 *
 * Mirrors `authEstablishment` em `./bearer.ts`, trocando o role exigido.
 */
export async function authWaiter(
  req: Request,
): Promise<{ userId: string; establishmentId: string } | null> {
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  const s = await verifySession(token);
  if (!s || s.role !== "WAITER" || !s.establishmentId) return null;
  return { userId: s.sub, establishmentId: s.establishmentId };
}
