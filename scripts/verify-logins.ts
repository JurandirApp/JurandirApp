import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";

async function main() {
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { email: "asc" }],
    include: { establishment: { select: { name: true, isLive: true } } },
  });
  console.log(`\n${users.length} usuários:\n`);
  for (const u of users) {
    const pw = u.role === "ADMIN" ? "admin1234" : "demo1234";
    const ok = await verifyPassword(pw, u.passwordHash);
    const est = u.establishment ? `${u.establishment.name}${u.establishment.isLive ? " (LIVE)" : ""}` : "-";
    console.log(
      `${ok ? "✓" : "✗"}  ${u.role.padEnd(13)} ${u.email.padEnd(34)} ${pw.padEnd(10)} ${est}`,
    );
  }
  await prisma.$disconnect();
}
main();
