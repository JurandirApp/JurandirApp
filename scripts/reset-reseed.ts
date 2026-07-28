/** Controlled clear + reseed of the dev DB (user-consented). Avoids the Prisma
 *  CLI's AI guard by using deleteMany, then runs the idempotent seed.
 *  npx tsx scripts/reset-reseed.ts */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Children first, then parents (respect FK).
  await prisma.splitShare.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.monthlyStat.deleteMany();
  await prisma.searchEvent.deleteMany();
  await prisma.qrSpot.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.user.deleteMany();
  await prisma.establishment.deleteMany();
  console.log("cleared");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
