import { prisma } from "./prisma";

export function listQrSpots(establishmentId: string) {
  return prisma.qrSpot.findMany({ where: { establishmentId }, orderBy: { createdAt: "asc" } });
}
export function createQrSpot(establishmentId: string, label: string) {
  return prisma.qrSpot.create({ data: { establishmentId, label } });
}
export function deleteQrSpot(id: string, establishmentId: string) {
  return prisma.qrSpot.deleteMany({ where: { id, establishmentId } });
}
