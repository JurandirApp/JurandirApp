/**
 * Exercises the Fase 2 foundation against a seeded database.
 * Run AFTER `npm run db:migrate` + `npm run db:seed`, with DATABASE_URL set.
 *   npx tsx scripts/verify-db.ts
 */
import { PrismaClient, PaymentMethod } from "@prisma/client";
import { verifyPassword } from "../lib/auth/password";
import { getEstablishmentBySlug } from "../lib/db/establishments";
import { createOrder, payShare } from "../lib/db/orders";
import { createLead } from "../lib/db/leads";
import { recordSearchEvent } from "../lib/db/search";

const prisma = new PrismaClient();
let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
}

async function main() {
  // 1) Establishment count == 13
  const estCount = await prisma.establishment.count();
  check("13 estabelecimentos", estCount === 13);

  // 2) Login (both accounts)
  const admin = await prisma.user.findUnique({ where: { email: "admin@jurandir.app" } });
  check("admin existe", !!admin);
  check("admin senha OK", !!admin && (await verifyPassword("admin1234", admin.passwordHash)));
  check(
    "admin senha errada falha",
    !!admin && !(await verifyPassword("errada", admin.passwordHash)),
  );

  const demo = await prisma.user.findUnique({
    where: { email: "contato@quiosquedomar.com.br" },
  });
  check(
    "estabelecimento existe",
    !!demo && demo.role === "ESTABLISHMENT" && !!demo.establishmentId,
  );
  check("estabelecimento senha OK", !!demo && (await verifyPassword("demo1234", demo.passwordHash)));

  const est = await getEstablishmentBySlug("quiosque-do-mar");
  check("slug quiosque-do-mar existe", !!est);
  if (!est) throw new Error("sem estabelecimento demo");

  // 3) Split order -> AWAITING_PAYMENT; pay both shares -> IN_PRODUCTION
  const split = await createOrder({
    establishmentId: est.id,
    locationLabel: "Guarda-sol nº 99",
    items: [{ name: "Combo Casal", qty: 1, unitPrice: 99 }],
    payment: { kind: "split", shares: [{ method: null }, { method: null }] },
  });
  check("split criado como AWAITING_PAYMENT", split.status === "AWAITING_PAYMENT");
  await payShare(split.id, 0, PaymentMethod.PIX);
  const afterBoth = await payShare(split.id, 1, PaymentMethod.CREDIT);
  check("split 100% pago vira IN_PRODUCTION", afterBoth?.status === "IN_PRODUCTION");

  // 4) Full credit order (>= R$100) with masked card + gateway fee snapshot
  const full = await createOrder({
    establishmentId: est.id,
    locationLabel: "Guarda-sol nº 100",
    items: [{ name: "Combo Casal", qty: 2, unitPrice: 99 }],
    payment: { kind: "full", method: "CREDIT", installments: 3, cardMask: "Visa •••• 4412" },
  });
  check("pagamento total vira IN_PRODUCTION", full.status === "IN_PRODUCTION");
  check("gatewayFeePct snapshot 3.49", Number(full.payment?.gatewayFeePct) === 3.49);
  check("cartão mascarado", full.payment?.cardMask === "Visa •••• 4412");

  // 5) Lead + search event
  const lead = await createLead({ name: "Ana", establishmentName: "Novo Bar", city: "Itajaí/SC" });
  check("lead criado", !!lead.id);
  const ev = await recordSearchEvent({ query: "camarão", city: "Itajaí/SC" });
  check("search event criado", !!ev.id);

  console.log(failures === 0 ? "\nTODOS OS CHECKS PASSARAM" : `\n${failures} CHECK(S) FALHARAM`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
