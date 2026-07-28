import { prisma } from "@/lib/db/prisma";
import { ackJob } from "@/lib/db/print";

/** Agente confirma impressão (ou reporta falha) de um job (auth por x-print-token). */
export async function POST(req: Request): Promise<Response> {
  const token = req.headers.get("x-print-token");
  if (!token) return new Response("unauthorized", { status: 401 });
  const est = await prisma.establishment.findUnique({
    where: { printAgentToken: token },
    select: { id: true },
  });
  if (!est) return new Response("unauthorized", { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    jobId?: string;
    ok?: boolean;
    error?: string;
  };
  if (!body.jobId) return new Response("bad request", { status: 400 });
  const job = await prisma.printJob.findUnique({
    where: { id: body.jobId },
    select: { establishmentId: true },
  });
  if (!job || job.establishmentId !== est.id) return new Response("forbidden", { status: 403 });
  await ackJob(body.jobId, Boolean(body.ok), body.error);
  return new Response("ok", { status: 200 });
}
