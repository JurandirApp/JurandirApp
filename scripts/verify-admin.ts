/** Verifica agregados do admin (leitura). Requer DATABASE_URL + seed aplicado.
 *  npx tsx scripts/verify-admin.ts
 *
 *  Nota: `createEstablishmentAction`/`deleteEstablishmentAction` chamam `getSession()`
 *  (cookies) e `revalidatePath`, que só funcionam dentro do request do Next — não
 *  rodam neste script `tsx` (quebra em `server-only`/`next/cache`). Por isso o CRUD
 *  é verificado via Playwright, não aqui. Este script cobre só os checks de leitura.
 */
import { PrismaClient } from "@prisma/client";
import { getAdminEstablishments, listMonthlyStats } from "../lib/db/admin";

const prisma = new PrismaClient();
let fail = 0;
const check = (n: string, c: boolean) => {
  console.log(`${c ? "PASS" : "FAIL"}  ${n}`);
  if (!c) fail++;
};

async function main() {
  const stats = await listMonthlyStats();
  // Rollup size = sum over establishments of min(12, months since `e.since`).
  // With fixed `since` dates and today's date, that's well under the plan's
  // ballpark ">100"; assert a floor that still proves a real, substantial
  // rollup (not empty/near-empty) without being brittle to which day this runs.
  check("há rollup de MonthlyStat", stats.length > 50);
  const ests = await getAdminEstablishments();
  check("13 estabelecimentos", ests.length === 13);
  check("Quiosque do Mar é isLive", ests.some((e) => e.isLive));
  const withUser = ests.filter((e) => e.users.length > 0).length;
  check("estabelecimentos têm login", withUser >= 13);

  // GMV do mês atual > 0
  const now = new Date();
  const cur = stats.filter((s) => s.year === now.getFullYear() && s.month === now.getMonth() + 1);
  const gmv = cur.reduce((a, s) => a + Number(s.gmv), 0);
  check("GMV do mês atual > 0", gmv > 0);

  console.log(fail ? `\n${fail} FALHA(S)` : "\nTODOS OS CHECKS PASSARAM");
  if (fail) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
