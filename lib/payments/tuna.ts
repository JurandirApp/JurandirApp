import type { ChargeStatus } from "./types";

// Tuna Gateway (7º gateway). Núcleo: modo TEST/PRODUCTION, envs, HTTP, erros e
// mapeamento de status. As cobranças ficam nas tasks seguintes.
// Segredos (app token) NUNCA vão pro cliente nem pro log; corpo da requisição
// também nunca é logado.
type Mode = "TEST" | "PRODUCTION";
let cachedMode: Mode | null = null;
let cachedModeAt = 0;
const MODE_TTL_MS = 30_000;
const TIMEOUT_MS = 20_000;

const modeSuffix = (): Mode => cachedMode ?? "TEST";

/** Atualiza o modo a partir do banco (cacheado). No-op em teste (sem DB). */
export async function ensureTunaMode(): Promise<Mode> {
  if (process.env.VITEST || process.env.NODE_ENV === "test") return modeSuffix();
  if (cachedMode && Date.now() - cachedModeAt < MODE_TTL_MS) return cachedMode;
  try {
    const { getTunaMode } = await import("@/lib/db/settings");
    cachedMode = (await getTunaMode()) as Mode;
  } catch {
    cachedMode = cachedMode ?? "TEST";
  }
  cachedModeAt = Date.now();
  return cachedMode;
}

/** Invalida o cache do modo — chamar quando o admin troca teste⇄produção. */
export function bustTunaModeCache(): void {
  cachedMode = null;
  cachedModeAt = 0;
}

/** Só para testes: fixa o modo em memória sem tocar no banco (null = default). */
export function __setTunaModeForTests(mode: Mode | null): void {
  cachedMode = mode;
  cachedModeAt = mode ? Date.now() : 0;
}

/** TESTE: `NOME_TEST` caindo pro `NOME`; PRODUÇÃO: `NOME`. */
const envByMode = (name: string): string =>
  modeSuffix() === "TEST"
    ? (process.env[`${name}_TEST`] ?? process.env[name] ?? "")
    : (process.env[name] ?? "");

const hostFor = (api: "engine" | "token"): string => {
  const name = api === "engine" ? "TUNA_ENGINE_URL" : "TUNA_TOKEN_URL";
  const def = api === "engine" ? "https://engine.tunagateway.com" : "https://token.tunagateway.com";
  return (envByMode(name) || def).replace(/\/$/, "");
};

export class TunaError extends Error {
  constructor(
    public status: number,
    public code: number | null,
    public body: string,
  ) {
    super(`Tuna ${status}${code !== null ? ` (code ${code})` : ""}: ${body}`);
    this.name = "TunaError";
  }
}

export async function tunaPost<T>(
  api: "engine" | "token",
  path: string,
  body: unknown,
  opts: { idempotencyKey?: string; auth?: "app" | "none" } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if ((opts.auth ?? "app") !== "none") {
    headers["x-tuna-account"] = envByMode("TUNA_ACCOUNT");
    headers["x-tuna-apptoken"] = envByMode("TUNA_APPTOKEN");
  }
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  // Timeout/rede propagam como erro comum (cobrança INCERTA, não é 4xx).
  const res = await fetch(`${hostFor(api)}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (res.status >= 400) throw new TunaError(res.status, null, text);
  const json = text ? JSON.parse(text) : {};
  const code = (json as { code?: unknown } | null)?.code;
  if (typeof code === "number" && code < 0) throw new TunaError(422, code, text);
  return json as T;
}

/** Status geral da Tuna → status interno. */
export function mapTunaStatus(status: string | null | undefined): ChargeStatus {
  if (status === "2" || status === "8") return "paid";
  if (["3", "4", "5", "6", "7", "9"].includes(status ?? "")) return "failed";
  return "pending";
}

/** Lê campo sem diferenciar maiúsculas (a Tuna varia o casing, ex.: pixInfo). */
export function pickCi(obj: unknown, ...keys: string[]): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const entries = Object.entries(obj as Record<string, unknown>);
  for (const k of keys) {
    const lk = k.toLowerCase();
    const hit = entries.find(([ek]) => ek.toLowerCase() === lk);
    if (hit) return hit[1];
  }
  return undefined;
}
