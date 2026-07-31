import { describe, it, expect } from "vitest";
import { getProvider, resolveGateway, getProviderByName } from "@/lib/payments";
import type { Establishment } from "@prisma/client";

const est = (over: Partial<Establishment> = {}): Establishment =>
  ({
    gatewayPix: "MERCADO_PAGO",
    gatewayCredit: "MERCADO_PAGO",
    gatewayDebit: "MERCADO_PAGO",
    ...over,
  }) as Establishment;

describe("resolveGateway", () => {
  it("roteia por método (Pix/Crédito/Débito)", () => {
    const e = est({ gatewayPix: "PAGARME", gatewayCredit: "MERCADO_PAGO", gatewayDebit: "MERCADO_PAGO" });
    expect(resolveGateway(e, "PIX")).toBe("PAGARME");
    expect(resolveGateway(e, "CREDIT")).toBe("MERCADO_PAGO");
    expect(resolveGateway(e, "DEBIT")).toBe("MERCADO_PAGO");
  });
});

describe("getProviderByName", () => {
  it("mapeia nome do enum → provider", () => {
    expect(getProviderByName("MERCADO_PAGO").name).toBe("MERCADO_PAGO");
    expect(getProviderByName("PAGARME").name).toBe("PAGARME");
    expect(getProviderByName("ASAAS").name).toBe("ASAAS");
  });
});

describe("getProvider", () => {
  it("resolve o provider pelo método configurado", () => {
    expect(getProvider(est(), "PIX").name).toBe("MERCADO_PAGO");
    expect(getProvider(est({ gatewayPix: "PAGARME" }), "PIX").name).toBe("PAGARME");
  });
});
