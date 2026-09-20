import { describe, expect, test } from "vitest";

import { adjustPrice, computeAdjustment, type AdjustableItem } from "./bulk-adjust";

describe("adjustPrice — exact (arredonda ao centavo)", () => {
  test("+30% sem quebra mantém o valor cheio", () => {
    expect(adjustPrice(20, 30, "exact")).toBe(26);
  });

  test("+15% com quebra arredonda meio-pra-cima ao centavo", () => {
    expect(adjustPrice(8.5, 15, "exact")).toBe(9.78); // 9.775 -> 9.78
  });

  test("percentual negativo aplica desconto", () => {
    expect(adjustPrice(10, -15, "exact")).toBe(8.5);
  });

  test("0% não altera o preço", () => {
    expect(adjustPrice(12.34, 0, "exact")).toBe(12.34);
  });
});

describe("adjustPrice — end90 (termina em ,90, arredonda pra cima)", () => {
  test("sobe pro ,90 seguinte", () => {
    expect(adjustPrice(8.5, 15, "end90")).toBe(9.9); // 9.775 -> 9.90
  });

  test("valor cheio vira ,90 do mesmo real", () => {
    expect(adjustPrice(20, 30, "end90")).toBe(26.9); // 26.00 -> 26.90
  });

  test("quando passa do ,90, pula pro real seguinte", () => {
    expect(adjustPrice(9.95, 0, "end90")).toBe(10.9); // 9.95 -> 10.90
  });
});

describe("adjustPrice — end99 (termina em ,99, arredonda pra cima)", () => {
  test("sobe pro ,99", () => {
    expect(adjustPrice(8.5, 15, "end99")).toBe(9.99); // 9.775 -> 9.99
  });
});

describe("adjustPrice — whole (real cheio, mais próximo)", () => {
  test("meio-pra-cima vira o real de cima", () => {
    expect(adjustPrice(8.5, 15, "whole")).toBe(10); // 9.775 -> 10
  });

  test("abaixo do meio fica no real de baixo", () => {
    expect(adjustPrice(20, 2, "whole")).toBe(20); // 20.40 -> 20
  });
});

describe("adjustPrice — robustez de dinheiro", () => {
  test("não sofre com o erro de float (8.5 * 1.15 = 9.7749999… em float)", () => {
    expect(adjustPrice(8.5, 15, "exact")).toBe(9.78);
  });

  test("nunca retorna valor negativo", () => {
    expect(adjustPrice(10, -100, "exact")).toBe(0);
  });
});

describe("computeAdjustment — monta o 'de → para' da seleção", () => {
  const lanche: AdjustableItem = {
    id: "i1",
    name: "Lanche",
    price: 20,
    options: [
      { id: "o1", name: "Bacon", priceDelta: 3 },
      { id: "o2", name: "Sem cebola", priceDelta: 0 },
    ],
  };

  test("ajusta o preço base de cada item", () => {
    const [change] = computeAdjustment([lanche], {
      percent: 30,
      rounding: "exact",
      includeAddons: false,
    });
    expect(change.oldPrice).toBe(20);
    expect(change.newPrice).toBe(26);
  });

  test("sem incluir adicionais, não mexe nos adicionais", () => {
    const [change] = computeAdjustment([lanche], {
      percent: 30,
      rounding: "exact",
      includeAddons: false,
    });
    expect(change.options).toEqual([]);
  });

  test("incluindo adicionais, aplica o mesmo % nos adicionais com preço", () => {
    const [change] = computeAdjustment([lanche], {
      percent: 30,
      rounding: "exact",
      includeAddons: true,
    });
    expect(change.options).toEqual([{ id: "o1", name: "Bacon", oldDelta: 3, newDelta: 3.9 }]);
  });

  test("preserva a ordem e cobre todos os itens selecionados", () => {
    const suco: AdjustableItem = { id: "i2", name: "Suco", price: 10, options: [] };
    const changes = computeAdjustment([lanche, suco], {
      percent: 0,
      rounding: "exact",
      includeAddons: false,
    });
    expect(changes.map((c) => c.id)).toEqual(["i1", "i2"]);
  });
});
