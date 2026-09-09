import { verifySession } from "./jwt";
import { prisma } from "@/lib/db/prisma";

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
  // Gate por estabelecimento: se o Módulo do Garçom está desligado, nenhuma
  // rota do garçom opera (mesmo com um usuário WAITER válido).
  const est = await prisma.establishment.findUnique({
    where: { id: s.establishmentId },
    select: { waiterModuleEnabled: true },
  });
  if (!est?.waiterModuleEnabled) return null;
  return { userId: s.sub, establishmentId: s.establishmentId };
}
