import { prisma } from "@/lib/db/prisma";

/** Liga o Quiosque do Mar em Mercado Pago modo conta-única de teste (sem OAuth/split). */
async function main() {
  const r = await prisma.establishment.updateMany({
    where: { slug: "quiosque-do-mar" },
    data: { paymentProvider: "MERCADO_PAGO", paymentOnboarded: true },
  });
  console.log("Quiosque do Mar → MERCADO_PAGO (teste). Linhas atualizadas:", r.count);
  await prisma.$disconnect();
}
main();
