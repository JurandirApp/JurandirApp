import { verifySession, type SessionPayload } from "./jwt";

/**
 * Autentica uma request do app pelo header `Authorization: Bearer <jwt>`.
 * Retorna a sessão só se for um usuário ESTABLISHMENT com estabelecimento —
 * usado pelas rotas protegidas do painel (`/api/public/establishment/*`).
 */
export async function authEstablishment(req: Request): Promise<SessionPayload | null> {
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  const s = await verifySession(token);
  if (!s || s.role !== "ESTABLISHMENT" || !s.establishmentId) return null;
  return s;
}

/** Autentica um ADMIN pelo Bearer token — rotas de `/api/public/admin/*`. */
export async function authAdmin(req: Request): Promise<SessionPayload | null> {
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  const s = await verifySession(token);
  if (!s || s.role !== "ADMIN") return null;
  return s;
}
