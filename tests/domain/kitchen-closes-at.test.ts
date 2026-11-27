import { describe, it, expect } from "vitest";
import { kitchenClosesAt, kitchenPublicFields, normalizeKitchenConfig } from "@/lib/domain/kitchen";

const day = (w: { o: string; c: string }[]) => [w, w, w, w, w, w, w];
// 2026-11-27 (sexta) 21:00 em Brasília = 00:00Z do dia 28.
const NOW = new Date("2026-11-28T00:00:00Z");

describe("kitchenClosesAt", () => {
  it("cozinha 18h–22h, agora 21h → fecha às 22h (BRT)", () => {
    const cfg = normalizeKitchenConfig(day([{ o: "18:00", c: "22:00" }]), ["Pratos"]);
    expect(kitchenClosesAt(cfg, NOW)?.toISOString()).toBe("2026-11-28T01:00:00.000Z");
    expect(kitchenPublicFields(cfg, NOW)).toEqual({
      kitchenOpenNow: true,
      kitchenClosesAt: "2026-11-28T01:00:00.000Z",
    });
  });

  it("janela que vira a madrugada (18h–02h) → fecha às 02h", () => {
    const cfg = normalizeKitchenConfig(day([{ o: "18:00", c: "02:00" }]), ["Pratos"]);
    expect(kitchenClosesAt(cfg, NOW)?.toISOString()).toBe("2026-11-28T05:00:00.000Z");
  });

  it("cozinha 00:00–23:59 todo dia = 24h → null (sem aviso)", () => {
    const cfg = normalizeKitchenConfig(day([{ o: "00:00", c: "23:59" }]), ["Pratos"]);
    expect(kitchenClosesAt(cfg, NOW)).toBeNull();
  });

  it("sem config ou fechada → null", () => {
    expect(kitchenClosesAt(normalizeKitchenConfig(null, []), NOW)).toBeNull();
    const cfg = normalizeKitchenConfig(day([{ o: "10:00", c: "15:00" }]), ["Pratos"]);
    expect(kitchenClosesAt(cfg, NOW)).toBeNull();
  });
});
