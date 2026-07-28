import { describe, it, expect } from "vitest";
import { getProvider } from "@/lib/payments";

describe("getProvider", () => {
  it("é sempre Mercado Pago (gateway fixo)", () => {
    expect(getProvider().name).toBe("MERCADO_PAGO");
  });
});
