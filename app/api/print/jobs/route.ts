import { prisma } from "@/lib/db/prisma";
import { takePendingJobs } from "@/lib/db/print";

/** Agente puxa as comandas pendentes do estabelecimento (auth por x-print-token).
 *  Cada comanda vem com o alvo (impressora) pro agente rotear: conexão + target
 *  (USB: nome no Windows; NETWORK: IP) + porta. */
export async function GET(req: Request): Promise<Response> {
  const token = req.headers.get("x-print-token");
  if (!token) return new Response("unauthorized", { status: 401 });
  const est = await prisma.establishment.findUnique({
    where: { printAgentToken: token },
    select: { id: true },
  });
  if (!est) return new Response("unauthorized", { status: 401 });

  const rows = await takePendingJobs(est.id);
  // Comanda sem impressora (legado/teste) cai na padrão/primeira ativa do bar.
  const fallback = rows.some((r) => !r.printer)
    ? await prisma.printer.findFirst({
        where: { establishmentId: est.id, active: true },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: { connection: true, target: true, port: true },
      })
    : null;

  const jobs = rows.map((r) => {
    const p = r.printer ?? fallback;
    return {
      id: r.id,
      payloadB64: r.payloadB64,
      connection: p?.connection ?? null,
      target: p?.target ?? null,
      port: p?.port ?? null,
    };
  });
  return Response.json({ jobs });
}
