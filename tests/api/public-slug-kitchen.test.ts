import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  getEst: vi.fn(),
  listMenu: vi.fn(),
  popular: vi.fn(),
  spots: vi.fn(),
}));

vi.mock("@/lib/db/establishments", () => ({ getEstablishmentBySlug: m.getEst }));
vi.mock("@/lib/db/menu", () => ({ listMenu: m.listMenu, getPopularItemNames: m.popular }));
vi.mock("@/lib/db/qr", () => ({ listQrSpots: m.spots }));
vi.mock("@/lib/payments/tuna-public", () => ({
  tunaPublicReadiness: async () => () => ({ pixReady: false, cardReady: false }),
}));

import { GET } from "@/app/api/public/[slug]/route";

const EST = {
  id: "e1", slug: "bar", name: "Bar", tagline: null, coverImg: null, logoImg: null,
  address: null, hours: null, posto: null, platformFeePct: 8, serviceFeePct: 10,
  whatsapp: null, instagram: null, phone: null, website: null,
  gatewayPix: "PAGARME", gatewayCredit: "PAGARME", gatewayDebit: "PAGARME",
  gatewayApplePay: "PAGARME", gatewayGooglePay: "PAGARME",
  pagarmeRecipientId: null, asaasWalletId: null, appmaxRecipientHash: null,
};
const item = (id: string, category: string) => ({
  id, name: id, description: null, price: 10, oldPrice: null, photo: null, measure: null,
  unit: null, category, subcategory: "x", sortOrder: 0, active: true, optionGroups: [],
});

const call = async (lang?: string) => {
  const res = await GET(
    new Request(`https://jurandir.app.br/api/public/bar${lang ? `?lang=${lang}` : ""}`),
    { params: Promise.resolve({ slug: "bar" }) },
  );
  return res.json();
};

beforeEach(() => {
  vi.clearAllMocks();
  m.listMenu.mockResolvedValue([item("prato", "Alimentos"), item("chopp", "Bebidas")]);
  m.popular.mockResolvedValue([]);
  m.spots.mockResolvedValue([]);
});

describe("GET /api/public/{slug} — cozinha", () => {
  it("sem config: aberta, sem rótulo, kitchen=false em todos", async () => {
    m.getEst.mockResolvedValue({ ...EST, kitchenHours: null, kitchenCategories: [] });
    const body = await call();
    expect(body.est.kitchenOpenNow).toBe(true);
    expect(body.est).not.toHaveProperty("kitchenNextOpenLabel");
    expect(body.menu.map((x: { kitchen: boolean }) => x.kitchen)).toEqual([false, false]);
  });

  it("com config: marca itens da cozinha; fechada traz rótulo", async () => {
    // Só domingo 03:00–03:01 → fechada em quase todo instante.
    const hours = [[{ o: "03:00", c: "03:01" }], [], [], [], [], [], []];
    m.getEst.mockResolvedValue({ ...EST, kitchenHours: hours, kitchenCategories: ["Alimentos"] });
    const body = await call();
    expect(body.menu.map((x: { kitchen: boolean }) => x.kitchen)).toEqual([true, false]);
    expect(body.est.kitchenOpenNow).toBe(false);
    expect(body.est.kitchenNextOpenLabel).toMatch(/^Cozinha abre .* às 03:00$/);
    const en = await call("en");
    expect(en.est.kitchenNextOpenLabel).toMatch(/^Kitchen opens .* at 03:00$/);
  });
});
