import { PrismaClient } from "@prisma/client";

// Reuse a single client across HMR reloads in dev to avoid exhausting
// database connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** URL do banco com o pool do Prisma dimensionado pra serverless. O padrão do
 *  Prisma (≈ 2×CPUs+1 conexões, espera de 10 s) esgotava sob carga ("Timed out
 *  fetching a new connection from the connection pool"). Como a URL usa o
 *  pooler do Neon (PgBouncer, milhares de clientes), cada instância pode abrir
 *  mais conexões. Só completa o que a URL não define (a env sempre vence). */
function datasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    if (!u.searchParams.has("connection_limit"))
      u.searchParams.set("connection_limit", process.env.PRISMA_CONNECTION_LIMIT?.trim() || "10");
    if (!u.searchParams.has("pool_timeout"))
      u.searchParams.set("pool_timeout", process.env.PRISMA_POOL_TIMEOUT?.trim() || "20");
    return u.toString();
  } catch {
    return raw;
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: datasourceUrl(),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
