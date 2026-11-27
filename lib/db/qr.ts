import { prisma } from "./prisma";
import { planBatch } from "@/lib/domain/qr-batch";

export function listQrSpots(establishmentId: string) {
  return prisma.qrSpot.findMany({ where: { establishmentId }, orderBy: { createdAt: "asc" } });
}
export function createQrSpot(establishmentId: string, label: string) {
  return prisma.qrSpot.create({ data: { establishmentId, label } });
}
export function deleteQrSpot(id: string, establishmentId: string) {
  return prisma.qrSpot.deleteMany({ where: { id, establishmentId } });
}

/** Cadastro em lote: pula o que já existe (sem diferenciar maiúsculas) e os
 *  repetidos do próprio lote; `skipDuplicates` cobre corrida com outro cadastro.
 *  `createdAt` sobe 1 ms por item pra lista (ordenada por createdAt) manter a
 *  ordem digitada. Devolve quantos criou/pulou e TODOS os pontos do bar. */
export async function createQrSpotsBatch(establishmentId: string, labels: string[]) {
  const existing = await prisma.qrSpot.findMany({
    where: { establishmentId },
    select: { label: true },
  });
  const { toCreate } = planBatch(
    labels,
    existing.map((e) => e.label),
  );
  const base = Date.now();
  const res = toCreate.length
    ? await prisma.qrSpot.createMany({
        data: toCreate.map((label, i) => ({
          establishmentId,
          label,
          createdAt: new Date(base + i),
        })),
        skipDuplicates: true,
      })
    : { count: 0 };
  const spots = await listQrSpots(establishmentId);
  return { created: res.count, skipped: labels.length - res.count, spots };
}
