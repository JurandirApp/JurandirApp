import { prisma } from "@/lib/db/prisma";
import { takePendingJobs } from "@/lib/db/print";

/** Agente puxa as comandas pendentes do estabelecimento (auth por x-print-token). */
export async function GET(req: Request): Promise<Response> {
  const token = req.headers.get("x-print-token");
  if (!token) return new Response("unauthorized", { status: 401 });
  const est = await prisma.establishment.findUnique({
    where: { printAgentToken: token },
    select: { id: true },
  });
  if (!est) return new Response("unauthorized", { status: 401 });
  const jobs = await takePendingJobs(est.id);
  return Response.json({ jobs });
}
