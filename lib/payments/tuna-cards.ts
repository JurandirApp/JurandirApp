import { createHmac } from "node:crypto";

// Cartões salvos da Tuna (card on file). O app não tem login: cada aparelho
// gera UMA vez uma chave secreta (`deviceKey`, 32 bytes aleatórios em base64url)
// e os cartões ficam no customer da Tuna derivado dela aqui no servidor
// (HMAC com segredo nosso). Só quem tem a chave do aparelho abre sessão desse
// customer — e a Tuna só lista os cartões do customer da sessão. A chave, o id
// derivado e os tokens NUNCA são logados.

const DEVICE_KEY_RE = /^[A-Za-z0-9_-]{32,128}$/;

/** Chave do aparelho válida (base64url, 32–128 chars) ou undefined — inválida
 *  é tratada como ausente (nunca derruba a cobrança). */
export function sanitizeDeviceKey(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const k = v.trim();
  return DEVICE_KEY_RE.test(k) ? k : undefined;
}

/** Segredo do HMAC: `TUNA_CARD_KEY_SECRET`, caindo pro `AUTH_SECRET`. Vazio → "". */
export function tunaCardKeySecret(env: Record<string, string | undefined> = process.env): string {
  return (env.TUNA_CARD_KEY_SECRET ?? "").trim() || (env.AUTH_SECRET ?? "").trim();
}

export type TunaDeviceCustomer = { id: string; email: string };

/** Customer da Tuna do aparelho: `id = "jdev_" + HMAC-SHA256(segredo, chave)`
 *  (40 hex), `email = <id>@cartoes.jurandir.app.br`. Chave inválida → null.
 *  Sem segredo → lança (nunca deriva com segredo vazio: o id ficaria
 *  previsível e mudaria quando o segredo fosse configurado). */
export function deriveTunaDeviceCustomer(
  deviceKey: unknown,
  env: Record<string, string | undefined> = process.env,
): TunaDeviceCustomer | null {
  const key = sanitizeDeviceKey(deviceKey);
  if (!key) return null;
  const secret = tunaCardKeySecret(env);
  if (!secret) throw new Error("segredo dos cartões salvos ausente");
  const id = `jdev_${createHmac("sha256", secret).update(key).digest("hex").slice(0, 40)}`;
  return { id, email: `${id}@cartoes.jurandir.app.br` };
}
