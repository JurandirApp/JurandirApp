import { prisma } from "./prisma";

/** Cria um chamado. DEDUP: se já existe um PENDING pra mesma mesa no bar,
 *  reusa (evita flood e alerta duplicado). */
export async function createHelpRequest(input: {
  establishmentId: string;
  locationLabel: string;
  clientId?: string | null;
  orderId?: string | null;
  reason?: "PAYMENT" | "GENERAL";
}): Promise<{ id: string; reused: boolean }> {
  const existing = await prisma.helpRequest.findFirst({
    where: { establishmentId: input.establishmentId, locationLabel: input.locationLabel, status: "PENDING" },
    select: { id: true },
  });
  if (existing) return { id: existing.id, reused: true };
  const created = await prisma.helpRequest.create({
    data: {
      establishmentId: input.establishmentId,
      locationLabel: input.locationLabel,
      clientId: input.clientId ?? null,
      orderId: input.orderId ?? null,
      reason: input.reason ?? "PAYMENT",
    },
    select: { id: true },
  });
  return { id: created.id, reused: false };
}

/** Chamados PENDING de um bar, mais antigos primeiro. */
export async function listPendingCalls(establishmentId: string) {
  return prisma.helpRequest.findMany({
    where: { establishmentId, status: "PENDING" },
    select: { id: true, locationLabel: true, reason: true, createdAt: true, orderId: true },
    orderBy: { createdAt: "asc" },
  });
}

/** Marca atendido. Idempotente e escopado ao bar: só afeta um PENDING do bar;
 *  se já foi atendido (ou não é do bar), devolve ok:true sem erro. */
export async function handleCall(id: string, userId: string | null, establishmentId: string): Promise<{ ok: boolean }> {
  await prisma.helpRequest.updateMany({
    where: { id, establishmentId, status: "PENDING" },
    data: { status: "HANDLED", handledAt: new Date(), handledByUserId: userId },
  });
  return { ok: true };
}
