import { prisma } from "./prisma";
import { hashPassword } from "@/lib/auth/password";
import { waiterUpsertSchema, type WaiterUpsertInput } from "../validation";

/** Lista os garçons de um estabelecimento (ordenados por nome). */
export function listWaiters(establishmentId: string) {
  return prisma.user
    .findMany({
      where: { establishmentId, role: "WAITER" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    })
    .then((rows) => rows.map((r) => ({ id: r.id, name: r.name, user: r.email })));
}

/**
 * Cria ou atualiza um garçom. No update, `password` vazio/ausente mantém o
 * hash atual; no create, senha é obrigatória. Update é scoped por
 * establishmentId (defense-in-depth, igual ao padrão de `lib/db/menu.ts`).
 */
export async function upsertWaiter(establishmentId: string, input: WaiterUpsertInput) {
  const data = waiterUpsertSchema.parse(input);

  if (data.id) {
    const r = await prisma.user.updateMany({
      where: { id: data.id, establishmentId, role: "WAITER" },
      data: {
        name: data.name,
        email: data.user,
        ...(data.password ? { passwordHash: await hashPassword(data.password) } : {}),
      },
    });
    if (r.count === 0) return null; // not found / not owned
    return { id: data.id, name: data.name, user: data.user };
  }

  if (!data.password) return null; // senha obrigatória no create
  const u = await prisma.user.create({
    data: {
      name: data.name,
      email: data.user,
      passwordHash: await hashPassword(data.password),
      role: "WAITER",
      establishment: { connect: { id: establishmentId } },
    },
    select: { id: true, name: true, email: true },
  });
  return { id: u.id, name: u.name, user: u.email };
}

/** Remove um garçom, scoped por establishmentId (tenant só apaga o próprio). */
export function deleteWaiter(id: string, establishmentId: string) {
  return prisma.user.deleteMany({ where: { id, establishmentId, role: "WAITER" } });
}

/** Eventos PICKED/DELIVERED de um garçom (histórico de atividade), mais recentes primeiro. */
export function waiterActivity(establishmentId: string, waiterId: string) {
  return prisma.orderEvent.findMany({
    where: { waiterId, order: { establishmentId }, type: { in: ["PICKED", "DELIVERED"] } },
    orderBy: { at: "desc" },
    take: 100,
  });
}
