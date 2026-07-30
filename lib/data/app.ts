/**
 * Client App (Fase 4) seed data & constants — ported from the prototype
 * (design_handoff_jurandir/App do Cliente.dc.html). Public QR → cardápio →
 * checkout → confirmation → "meus pedidos" flow for a single establishment.
 *
 * Tenant content (establishment name, menu items, address, hours, contacts)
 * stays in PT — only UI chrome is translated. Zero-emoji: category pills use
 * Material Symbols (CAT_ICON) instead of the prototype's emoji.
 */

import type { MenuItem } from "@/lib/data/panel";

export type PayId = "credito" | "debito" | "pix" | "usdc";

/** Payment methods as shown in the client app (own icon set + colors). */
export const PM: Record<PayId, { color: string; icon: string }> = {
  credito: { color: "#3b82f6", icon: "credit_card" },
  debito: { color: "#10b981", icon: "payments" },
  pix: { color: "#14b8a6", icon: "smartphone" },
  usdc: { color: "#8b5cf6", icon: "paid" },
};

export const PAY_IDS: PayId[] = ["credito", "debito", "pix", "usdc"];

/** Métodos ainda não liberados — aparecem como "em breve" e não dá pra escolher.
 *  (Débito: pendente de bandeiras no gateway; USDC: ainda não integrado.) */
export const COMING_SOON: PayId[] = ["debito", "usdc"];
export const isComingSoon = (id: PayId): boolean => COMING_SOON.includes(id);

/** Real logos (in /public) for Pix and USDC on the "Pague com" strip. */
export const PAY_LOGOS: Partial<Record<PayId, string>> = {
  pix: "/pix-logo.png",
  usdc: "/usdc-logo.png",
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
};

// ---- Establishment (tenant content — stays PT) ---------------------------

export type AppEstablishment = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  cover: string;
  logo: string | null;
  address: string;
  hours: string;
  platformFeePct: number;
  serviceFeePct: number;
  posto: string;
  whatsapp: string;
  instagram: { url: string; handle: string };
  phone: { tel: string; display: string };
  website: { url: string };
};

export const APP_EST: AppEstablishment = {
  id: "quiosque-do-mar",
  slug: "quiosque-do-mar",
  name: "Quiosque do Mar",
  tagline: "Drinks autorais, frutos do mar e pé na areia",
  cover:
    "https://images.unsplash.com/photo-1559827260-dc66d52bef19?auto=format&fit=crop&w=900&q=70",
  logo: null,
  address: "Av. Beira-Mar, 1200 — Praia Brava, Itajaí/SC",
  hours: "Todos os dias · 09h às 20h",
  platformFeePct: 8,
  serviceFeePct: 10,
  posto: "Posto 3",
  whatsapp: "https://wa.me/5547999990000",
  instagram: { url: "https://instagram.com/quiosquedomar", handle: "@quiosquedomar" },
  phone: { tel: "4733445566", display: "(47) 3344-5566" },
  website: { url: "https://www.quiosquedomar.com.br" },
};

// ---- Seed: menu (w=600 photos for the customer-facing app) ---------------

const ph = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=600&q=70`;

// [id, name, desc, price, old, photoId, measure, unit, cat, sub]
type MenuRow = [
  number, string, string, number, number | null,
  string, number | null, string | null, string, string,
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

export const APP_MENU: MenuItem[] = menuRows.map((a) => ({
  id: a[0],
  name: a[1],
  desc: a[2],
  price: a[3],
  old: a[4],
  photo: ph(a[5]),
  measure: a[6],
  unit: a[7],
  cat: a[8],
  sub: a[9],
}));

export const DEFAULT_LOC_BEACH = "Guarda-sol nº 14";
export const DEFAULT_LOC_TABLE = "Mesa nº 14";
