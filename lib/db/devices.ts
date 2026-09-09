import { prisma } from "./prisma";

export async function registerDevice(input: {
  token: string; userId?: string | null; clientId?: string | null; establishmentId?: string | null;
}) {
  await prisma.deviceToken.upsert({
    where: { token: input.token },
    create: {
      token: input.token,
      userId: input.userId ?? null,
      clientId: input.clientId ?? null,
      establishmentId: input.establishmentId ?? null,
    },
    update: {
      userId: input.userId ?? null,
      clientId: input.clientId ?? null,
      establishmentId: input.establishmentId ?? null,
    },
  });
}
