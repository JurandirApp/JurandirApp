/**
 * Establishment panel seed data & constants — ported from the prototype
 * (design_handoff_jurandir/Painel do Estabelecimento.dc.html). Fase 3 uses this
 * local mock; Fase 2 replaces it with Prisma-backed data.
 *
 * Zero-emoji: the prototype uses emoji for category/item fallbacks — here each
 * category maps to a Material Symbols glyph instead.
 */

export type OrderStatus = "aguardando" | "producao" | "entregue";
export type PayMethod = "credito" | "debito" | "pix" | "usdc";

export type PrintJobStatus = "PENDING" | "PRINTED" | "FAILED";
export type PanelPrintJob = {
  id: string;
  kind: "ORDER" | "TEST";
  status: PrintJobStatus;
  code: string; // código do pedido, ou "TESTE"
  timeLabel: string; // HH:MM
  error?: string;
};

export type MenuItem = {
  id: number;
  dbId?: string;
  name: string;
  desc: string;
  price: number;
  old: number | null;
  photo: string;
  measure: number | null;
  unit: string | null;
  cat: string;
  sub: string;
};

/** [quantity, item name, unit price] */
export type OrderLine = [number, string, number];

export type Split = { people: number; paid: number; paidAmt: number };

export type Order = {
  id: number;
  dbId?: string;
  code: string;
  st: OrderStatus;
  pay: PayMethod;
  loc: string;
  posto?: string;
  cust?: string;
  /** epoch ms */
  ts: number;
  items: OrderLine[];
  note?: string;
  card?: string;
  splits?: Split;
};

export type Qr = { id: string; label: string };

// ---- Constants ----------------------------------------------------------

export const PM: Record<
  PayMethod,
  { label: string; color: string; icon: string }
> = {
  credito: { label: "Crédito", color: "#3b82f6", icon: "credit_card" },
  debito: { label: "Débito", color: "#10b981", icon: "account_balance_wallet" },
  pix: { label: "Pix", color: "#14b8a6", icon: "qr_code_2" },
  usdc: { label: "Stablecoin (USDC)", color: "#8b5cf6", icon: "toll" },
};

/** Real logos (in /public) for Pix and USDC; card/debit use glyphs. */
export const PAY_LOGOS: Partial<Record<PayMethod, string>> = {
  pix: "/pix-logo.png",
  usdc: "/usdc-logo.png",
};

/** Gateway fee % per method (shown in the audit). */
export const GW: Record<PayMethod, number> = {
  credito: 3.49,
  debito: 1.99,
  pix: 0.99,
  usdc: 1.0,
};

export const CATS: Record<string, string[]> = {
  "Combos & Combinações": ["Combos", "Combinações"],
  Bebidas: ["Drinks", "Cervejas", "Refrigerantes", "Naturais", "Águas"],
  Alimentos: ["Porções", "Pratos", "Saudáveis"],
  Snacks: ["Salgados", "Petiscos"],
  Sobremesas: ["Sorvetes", "Doces"],
};

/** Material Symbols glyph per category (replaces the prototype's emoji). */
export const CAT_ICON: Record<string, string> = {
  "Combos & Combinações": "restaurant_menu",
  Bebidas: "local_bar",
  Alimentos: "restaurant",
  Snacks: "lunch_dining",
  Sobremesas: "icecream",
  Outros: "category",
};

export const CAT_COLORS: Record<string, string> = {
  "Combos & Combinações": "#8b5cf6",
  Bebidas: "#06b6d4",
  Alimentos: "#f59e0b",
  Snacks: "#eab308",
  Sobremesas: "#ec4899",
  Outros: "#94a3b8",
};

// ---- Seed: menu ---------------------------------------------------------

const ph = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=300&q=70`;

// [id, name, desc, price, old, photoId, measure, unit, cat, sub]
type MenuRow = [
  number, string, string, number, number | null,
  string | null, number | null, string | null, string, string,
];

const menuRows: MenuRow[] = [
  [27, "Combo Casal", "2 caipirinhas + porção de camarão", 99, 112, "photo-1414235077428-338989a2e8c0", null, null, "Combos & Combinações", "Combos"],
  [30, "Combo Sunset", "Aperol Spritz + Petit Gâteau", 52, 62, "photo-1560512823-829485b8bf24", null, null, "Combos & Combinações", "Combinações"],
  [1, "Caipirinha de Limão", "Cachaça artesanal, limão tahiti, açúcar e gelo", 22, 28, "photo-1551538827-9c037cb4f32a", 300, "ml", "Bebidas", "Drinks"],
  [2, "Aperol Spritz", "Aperol, prosecco, água com gás e laranja", 28, 34, "photo-1560512823-829485b8bf24", 300, "ml", "Bebidas", "Drinks"],
  [3, "Heineken Long Neck", "Cerveja pilsen bem gelada", 12, null, "photo-1608270586620-248524c67de9", 330, "ml", "Bebidas", "Cervejas"],
  [4, "Stella Artois", "Garrafa compartilhável bem gelada", 18, null, "photo-1535958636474-b021ee887b13", 600, "ml", "Bebidas", "Cervejas"],
  [5, "Água de Coco", "Coco verde natural, servido na hora", 10, null, "photo-1520950237264-3e10a6d27dd5", 500, "ml", "Bebidas", "Naturais"],
  [6, "Suco de Laranja", "Laranja espremida na hora", 14, null, "photo-1600271886742-f049cd451bba", 400, "ml", "Bebidas", "Naturais"],
  [22, "Coca-Cola Lata", "Refrigerante gelado em lata", 8, null, "photo-1554866585-cd94860890b7", 350, "ml", "Bebidas", "Refrigerantes"],
  [25, "Água Mineral sem Gás", "Garrafa gelada 500ml", 5, null, "photo-1559839734-2b71ea197ec2", 500, "ml", "Bebidas", "Águas"],
  [7, "Porção de Camarão", "Camarão empanado com molho tártaro", 68, 89, "photo-1625938145312-c971e35e51f3", 300, "g", "Alimentos", "Porções"],
  [8, "Batata Frita", "Batata rústica crocante com cheddar e bacon", 38, null, "photo-1573080496219-bb080dd4f877", 400, "g", "Alimentos", "Porções"],
  [9, "Moqueca de Peixe", "Peixe fresco, leite de coco, arroz e pirão", 89, null, "photo-1559847844-5315695dadae", 700, "g", "Alimentos", "Pratos"],
  [12, "Bowl de Açaí", "Açaí, granola, banana e mel", 28, 36, "photo-1590301157890-4810ed352733", 500, "ml", "Alimentos", "Saudáveis"],
  [13, "Mix de Castanhas", "Castanha de caju, amêndoas e nozes torradas", 24, null, "photo-1599629954294-14df9ec8bc05", 100, "g", "Snacks", "Petiscos"],
  [14, "Pipoca Gourmet", "Pipoca amanteigada com toque de parmesão", 18, null, "photo-1578849278619-e73505e9610f", 80, "g", "Snacks", "Petiscos"],
  [16, "Casquinha Dupla", "Dois sabores na casquinha crocante", 16, null, "photo-1576506295286-5cda18df43e7", 120, "g", "Sobremesas", "Sorvetes"],
  [19, "Petit Gâteau", "Bolo de chocolate com recheio cremoso e sorvete", 32, 38, "photo-1606313564200-e75d5e30476c", 150, "g", "Sobremesas", "Doces"],
  [20, "Churros com Doce de Leite", "Churros fresquinhos com doce de leite", 24, null, "photo-1612203985729-70726954388c", 150, "g", "Sobremesas", "Doces"],
];

export const SEED_MENU: MenuItem[] = menuRows.map((a) => ({
  id: a[0],
  name: a[1],
  desc: a[2],
  price: a[3],
  old: a[4],
  photo: a[5] ? ph(a[5]) : "",
  measure: a[6],
  unit: a[7],
  cat: a[8],
  sub: a[9],
}));

// ---- Seed: orders -------------------------------------------------------

export type OrderSeed = Omit<Order, "ts"> & { minutesAgo: number };

export const SEED_ORDERS: OrderSeed[] = [
  { id: 41, code: "PED-7F3A9C2D", st: "aguardando", pay: "pix", loc: "Guarda-sol nº 22", posto: "Posto 3", cust: "Marina", minutesAgo: 18, items: [[4, "Caipirinha de Limão", 22], [1, "Porção de Camarão", 68]], splits: { people: 4, paid: 2, paidAmt: 78 } },
  { id: 42, code: "PED-2B91E4AF", st: "producao", pay: "pix", loc: "Guarda-sol nº 14", posto: "Posto 3", cust: "Rafa", minutesAgo: 32, items: [[2, "Água de Coco", 10], [1, "Bowl de Açaí", 28]], note: "Sem granola no açaí, por favor." },
  { id: 43, code: "PED-9C04D7B1", st: "producao", pay: "credito", loc: "Guarda-sol nº 07", posto: "Posto 2", cust: "Ana Paula", minutesAgo: 51, items: [[1, "Combo Casal", 99]], card: "Visa •••• 4412" },
  { id: 40, code: "PED-5E62A803", st: "entregue", pay: "debito", loc: "Deck 03", cust: "", minutesAgo: 130, items: [[1, "Batata Frita", 38], [2, "Heineken Long Neck", 12]] },
  { id: 39, code: "PED-B37F10C6", st: "entregue", pay: "pix", loc: "Guarda-sol nº 22", posto: "Posto 3", cust: "Família Souza", minutesAgo: 260, items: [[1, "Moqueca de Peixe", 89], [2, "Suco de Laranja", 14]] },
  { id: 38, code: "PED-D18E52F0", st: "entregue", pay: "usdc", loc: "Guarda-sol nº 14", posto: "Posto 3", cust: "", minutesAgo: 1560, items: [[2, "Aperol Spritz", 28]] },
  { id: 37, code: "PED-64A0C9E7", st: "entregue", pay: "credito", loc: "Guarda-sol nº 05", posto: "Posto 2", cust: "Léo", minutesAgo: 4380, items: [[1, "Combo Sunset", 52], [1, "Churros com Doce de Leite", 24]], card: "Master •••• 7810" },
  { id: 36, code: "PED-F92B37D4", st: "entregue", pay: "pix", loc: "Guarda-sol nº 09", posto: "Posto 2", cust: "", minutesAgo: 7300, items: [[6, "Heineken Long Neck", 12], [1, "Mix de Castanhas", 24]] },
];

/** Orders that "arrive" in real time after mount (demo). */
export const INCOMING_ORDERS: Array<Omit<Order, "id" | "code" | "st" | "ts">> = [
  { pay: "pix", loc: "Guarda-sol nº 31", posto: "Posto 3", cust: "Bruno", items: [[2, "Heineken Long Neck", 12], [1, "Batata Frita", 38]] },
  { pay: "credito", card: "Visa •••• 2291", loc: "Deck 05", cust: "", items: [[1, "Moqueca de Peixe", 89], [2, "Água de Coco", 10]] },
  { pay: "pix", loc: "Guarda-sol nº 08", posto: "Posto 2", cust: "Camila", items: [[1, "Combo Sunset", 52]] },
];

export const SEED_QRS: Qr[] = [
  { id: "1", label: "Guarda-sol nº 14" },
  { id: "2", label: "Guarda-sol nº 22" },
];

export type ProfileForm = {
  name: string;
  tagline: string;
  desc: string;
  address: string;
  hours: string;
  serviceFee: string;
  radius: string;
  phone: string;
  email: string;
  website: string;
  whatsapp: string;
  instagram: string;
};

export const SEED_PROFILE: ProfileForm = {
  name: "Quiosque do Mar",
  tagline: "Drinks autorais, frutos do mar e pé na areia",
  desc: "O melhor da Praia Brava: caipirinhas premiadas, porções generosas e aquele açaí gelado pra fechar o dia. Atendimento direto no seu guarda-sol.",
  address: "Av. Beira-Mar, 1200 — Praia Brava, Itajaí/SC",
  hours: "Todos os dias · 09h às 20h",
  serviceFee: "10",
  radius: "500",
  phone: "(47) 3344-5566",
  email: "contato@quiosquedomar.com.br",
  website: "www.quiosquedomar.com.br",
  whatsapp: "5547999990000",
  instagram: "@quiosquedomar",
};

export const COVER_IMG =
  "https://images.unsplash.com/photo-1559827260-dc66d52bef19?auto=format&fit=crop&w=900&q=70";
