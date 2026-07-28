import { prisma } from "@/lib/db/prisma";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const host = url.replace(/:\/\/[^@]*@/, "://").split("/")[2] ?? "?";
  console.log("connecting to host:", host);
  const users = await prisma.user.count();
  const orders = await prisma.order.count();
  console.log("OK — users:", users, "| orders:", orders);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
