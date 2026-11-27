import type { SessionPayload } from "./jwt";

// Modo visualização ("Ver como o cliente vê") — regras puras de quem pode o quê.

/** `?preview=1` só vale para a sessão do PRÓPRIO estabelecimento (ou ADMIN).
 *  Qualquer outra pessoa recebe a página normal (o parâmetro é ignorado). */
export function canPreview(
  session: SessionPayload | null,
  establishmentId: string,
): boolean {
  if (!session) return false;
  if (session.role === "ADMIN") return true;
  return session.role === "ESTABLISHMENT" && session.establishmentId === establishmentId;
}

/** A sessão é da equipe (estabelecimento/garçom) DESTE bar? As actions de
 *  pedido do site recusam (`previewMode`): a equipe não faz pedido de cliente
 *  com a sessão do painel. Não vale para as rotas `/api/public/*` do app. */
export function isStaffOf(
  session: SessionPayload | null,
  establishmentId: string,
): boolean {
  if (!session || !session.establishmentId) return false;
  return (
    (session.role === "ESTABLISHMENT" || session.role === "WAITER") &&
    session.establishmentId === establishmentId
  );
}

/** Valor de `?preview=` que liga o modo. */
export function wantsPreview(raw: string | string[] | undefined): boolean {
  return raw === "1";
}
