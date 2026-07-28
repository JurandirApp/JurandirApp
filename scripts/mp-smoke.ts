import { mercadoPagoProvider } from "@/lib/payments/mercadopago";
import type { Establishment } from "@prisma/client";

async function main() {
  const est = {
    id: "smoke",
    paymentProvider: "MERCADO_PAGO",
    mpAccessToken: null, // sem OAuth → usa MP_TEST_ACCESS_TOKEN (conta única)
  } as unknown as Establishment;

  const tok = process.env.MP_TEST_ACCESS_TOKEN ?? "";
  console.log("MP_TEST_ACCESS_TOKEN:", tok ? `${tok.slice(0, 14)}…` : "(vazio!)");

  const reference = "SMOKE-" + Date.now().toString(36).toUpperCase();
  try {
    const r = await mercadoPagoProvider.createPixCharge({
      est,
      reference,
      total: 1.5,
      platformFee: 0.12,
      description: "Smoke test Jurandir",
    });
    console.log("\n✅ Pix criado na API real do MP");
    console.log("  chargeId:", r.chargeId);
    console.log("  status  :", r.status);
    console.log("  copia-e-cola:", r.pixPayload.slice(0, 50), "…");
    console.log("  QR base64 (bytes):", r.pixQrImage.length);

    const st = await mercadoPagoProvider.getChargeStatus(est, r.chargeId);
    console.log("  re-fetch status:", st);
  } catch (e) {
    console.error("\n❌ FALHOU:", (e as Error).message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
