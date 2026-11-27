import { describe, expect, it } from "vitest";
import {
  KitchenClosedError,
  kitchenNextOpenLabel,
  kitchenOpenNow,
  normalizeKitchenConfig,
  orderHasKitchenItem,
  spClock,
} from "@/lib/domain/kitchen";

// Brasília = UTC-3 (sem horário de verão). Helper: instante a partir do relógio de SP.
const sp = (iso: string) => new Date(`${iso}-03:00`);

// 2026-11-27 é sexta-feira (5).
const week = (): unknown[] => {
  const w: unknown[] = [[], [], [], [], [], [], []];
  w[5] = [{ o: "18:00", c: "23:00" }]; // sexta 18–23
  w[6] = [{ o: "12:00", c: "15:00" }, { o: "19:00", c: "02:00" }]; // sábado 2 turnos, vira a madrugada
  return w;
};
const cfg = normalizeKitchenConfig(week(), ["Pratos", "Porções", "Pratos", " "]);

describe("normalizeKitchenConfig", () => {
  it("dedupe e limpa categorias; horário no shape do weeklyHours", () => {
    expect(cfg.categories).toEqual(["Pratos", "Porções"]);
    expect(cfg.hours).toHaveLength(7);
    expect(cfg.hours[5]).toEqual([{ o: "18:00", c: "23:00" }]);
  });
  it("lixo vira config vazia", () => {
    expect(normalizeKitchenConfig(null, "x")).toEqual({
      hours: [[], [], [], [], [], [], []],
      categories: [],
    });
  });
});

describe("spClock", () => {
  it("usa o fuso de Brasília independente do fuso local", () => {
    expect(spClock(new Date("2026-11-28T01:30:00Z"))).toEqual({ day: 5, mins: 22 * 60 + 30 });
  });
});

describe("kitchenOpenNow", () => {
  it("config vazia = sempre aberta", () => {
    expect(kitchenOpenNow(null, sp("2026-11-27T03:00:00"))).toBe(true);
    expect(kitchenOpenNow(normalizeKitchenConfig(week(), []), sp("2026-11-27T03:00:00"))).toBe(true);
    expect(kitchenOpenNow(normalizeKitchenConfig([], ["Pratos"]), sp("2026-11-27T03:00:00"))).toBe(true);
  });
  it("dentro/fora da janela", () => {
    expect(kitchenOpenNow(cfg, sp("2026-11-27T17:59:00"))).toBe(false);
    expect(kitchenOpenNow(cfg, sp("2026-11-27T18:00:00"))).toBe(true);
    expect(kitchenOpenNow(cfg, sp("2026-11-27T22:59:00"))).toBe(true);
    expect(kitchenOpenNow(cfg, sp("2026-11-27T23:00:00"))).toBe(false);
  });
  it("janela que vira a madrugada continua aberta no dia seguinte", () => {
    expect(kitchenOpenNow(cfg, sp("2026-11-29T01:30:00"))).toBe(true); // domingo 01:30
    expect(kitchenOpenNow(cfg, sp("2026-11-29T02:00:00"))).toBe(false);
  });
});

describe("kitchenNextOpenLabel", () => {
  it("aberta → undefined", () => {
    expect(kitchenNextOpenLabel(cfg, sp("2026-11-27T19:00:00"))).toBeUndefined();
    expect(kitchenNextOpenLabel(null, sp("2026-11-27T19:00:00"))).toBeUndefined();
  });
  it("hoje / amanhã / dia da semana", () => {
    expect(kitchenNextOpenLabel(cfg, sp("2026-11-27T10:00:00"))).toBe("Cozinha abre hoje às 18:00");
    expect(kitchenNextOpenLabel(cfg, sp("2026-11-27T23:30:00"))).toBe("Cozinha abre amanhã às 12:00");
    expect(kitchenNextOpenLabel(cfg, sp("2026-11-28T16:00:00"))).toBe("Cozinha abre hoje às 19:00");
    expect(kitchenNextOpenLabel(cfg, sp("2026-11-29T10:00:00"))).toBe("Cozinha abre sexta às 18:00");
    expect(kitchenNextOpenLabel(cfg, sp("2026-11-29T10:00:00"), "en")).toBe("Kitchen opens on Friday at 18:00");
    expect(kitchenNextOpenLabel(cfg, sp("2026-11-27T10:00:00"), "en")).toBe("Kitchen opens today at 18:00");
    expect(kitchenNextOpenLabel(cfg, sp("2026-11-27T10:00:00"), "es")).toBe("La cocina abre hoy a las 18:00");
    expect(kitchenNextOpenLabel(cfg, sp("2026-11-27T23:30:00"), "es")).toBe("La cocina abre mañana a las 12:00");
    expect(kitchenNextOpenLabel(cfg, sp("2026-11-29T10:00:00"), "es")).toBe("La cocina abre el viernes a las 18:00");
  });
});

describe("orderHasKitchenItem", () => {
  const kitchen = [{ id: "m1", name: "Isca de Peixe" }];
  it("casa por id ou, sem id, pelo nome", () => {
    expect(orderHasKitchenItem([{ menuItemId: "m1", name: "x" }], kitchen)).toBe(true);
    expect(orderHasKitchenItem([{ name: "isca de peixe " }], kitchen)).toBe(true);
    expect(orderHasKitchenItem([{ menuItemId: "m2", name: "Isca de Peixe" }], kitchen)).toBe(false);
    expect(orderHasKitchenItem([{ name: "Caipirinha" }], kitchen)).toBe(false);
  });
});

it("KitchenClosedError carrega o código kitchenClosed", () => {
  expect(new KitchenClosedError().code).toBe("kitchenClosed");
});
