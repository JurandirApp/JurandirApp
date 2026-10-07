import { prisma } from "@/lib/db/prisma";
import { sendPush } from "./fcm";

/** Push pros garçons de um bar quando um cliente chama na mesa. Best-effort. */
export async function notifyWaitersHelp(establishmentId: string, mesa: string): Promise<void> {
  const rows = await prisma.deviceToken.findMany({
    where: { establishmentId, userId: { not: null } },
    select: { token: true },
  });
  if (rows.length === 0) return;
  await sendPush(rows.map((r) => r.token), "🔔 Chamado na mesa", `${mesa} precisa de ajuda com o pagamento`);
}
