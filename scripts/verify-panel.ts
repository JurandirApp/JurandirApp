/** Verifies panel reads are tenant-scoped. npx tsx scripts/verify-panel.ts */
import { PrismaClient } from "@prisma/client";
import { listPanelOrders, listPanelMenu } from "../lib/db/panel";
const prisma = new PrismaClient();
let fail = 0;
const check = (n: string, c: boolean) => {
  console.log(`${c ? "PASS" : "FAIL"}  ${n}`);
  if (!c) fail++;
};

async function main() {
  const live = await prisma.establishment.findUnique({ where: { slug: "quiosque-do-mar" } });
  const other = await prisma.establishment.findFirst({ where: { slug: { not: "quiosque-do-mar" } } });
  if (!live || !other) throw new Error("need 2 establishments");
  const liveOrders = await listPanelOrders(live.id);
  const liveMenu = await listPanelMenu(live.id);
  check("Quiosque do Mar has orders", liveOrders.length > 0);
  check("Quiosque do Mar has 19 menu items", liveMenu.length === 19);
  check("all live orders belong to live", liveOrders.every((o) => o.establishmentId === live.id));
  const otherMenu = await listPanelMenu(other.id);
  check("other establishment menu is its own", otherMenu.every((m) => m.establishmentId === other.id));
  check("no cross-tenant leak in live menu", !liveMenu.some((m) => m.establishmentId !== live.id));
  console.log(fail ? `\n${fail} FALHA(S)` : "\nTODOS OS CHECKS PASSARAM");
  if (fail) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
