/**
 * Admin panel seed data & constants — ported from the prototype
 * (design_handoff_jurandir/Painel Admin.dc.html). Fase 5 mock; Fase 2 replaces
 * it with Prisma-backed data (establishments, orders, search events).
 */

export type PayKey = "credito" | "debito" | "pix" | "usdc";

export type AdminEst = {
  id: string;
  isLive?: boolean;
  paymentProvider?: "ASAAS" | "MERCADO_PAGO";
  paymentOnboarded?: boolean;
  printerIp?: string;
  printEnabled?: boolean;
  hasPrintToken?: boolean;
  name: string;
  owner: string;
  city: string;
  neigh: string;
  tipo: string;
  plan: string;
  status: "ativo" | "pendente";
  since: string; // YYYY-MM-DD
  fee: string; // percent as string (editable)
  orders: number; // monthly baseline
  revenue: number; // monthly baseline
  byPay: Record<PayKey, number>;
  phone: string;
  email: string;
  website: string;
  whatsapp: string;
  instagram: string;
  logoImg?: string;
  user: string;
  password: string;
  posto: string;
  radius: string;
};

export const PAY_META: Record<PayKey, { label: string; color: string }> = {
  credito: { label: "Crédito", color: "#3b82f6" },
  debito: { label: "Débito", color: "#10b981" },
  pix: { label: "Pix", color: "#14b8a6" },
  usdc: { label: "USDC", color: "#0E565B" },
};

/** Monthly seasonality (Jan..Dec). Scales the baseline for a selected month. */
export const SEASON = [1.9, 1.8, 1.5, 1.1, 0.9, 0.8, 0.95, 0.9, 0.85, 1.0, 1.3, 2.0];

export const BEACH_TYPES = ["Quiosque", "Estabelecimento de Praia"];

export const METHOD_LABEL: Record<string, string> = {
  credito: "Crédito",
  debito: "Débito",
  pix: "Pix",
  usdc: "USDC",
  split: "Dividido",
};

// [id, name, owner, city, neigh, tipo, plan, status, since, fee, orders, revenue,
//  [credito, debito, pix, usdc], phone, email, website, whatsapp, instagram, user, pass, posto, radius]
type Row = [
  string, string, string, string, string, string, string, "ativo" | "pendente",
  string, string, number, number, [number, number, number, number],
  string, string, string, string, string, string, string, string, string,
];

const rows: Row[] = [
  ["live", "Quiosque do Mar", "Mneto", "Itajaí/SC", "Praia Brava", "Quiosque", "Pro", "ativo", "2025-11-02", "8", 8, 835, [271, 95, 365, 104], "(47) 3344-5566", "contato@quiosquedomar.com.br", "www.quiosquedomar.com.br", "5547999990000", "@quiosquedomar", "contato@quiosquedomar.com.br", "demo1234", "Posto 3", "500"],
  ["e2", "Bar do Zé", "José Almeida", "Florianópolis/SC", "Jurerê", "Bar", "Pro", "ativo", "2025-09-15", "7", 412, 38400, [15200, 5800, 14000, 3400], "(48) 3222-1010", "contato@bardoze.com.br", "www.bardoze.com.br", "5548999991111", "@bardoze", "bardoze", "barze2025", "", ""],
  ["e3", "Sunset Beach Club", "Marina Rocha", "Balneário Camboriú/SC", "Centro", "Balada", "Pro", "ativo", "2025-10-01", "9", 689, 71200, [24000, 8200, 25000, 14000], "(47) 3360-2020", "reservas@sunsetbeach.com.br", "www.sunsetbeachclub.com.br", "5547999992222", "@sunsetbeachclub", "sunsetbeach", "sunset2025", "", ""],
  ["e4", "Cabana da Lia", "Lia Fernandes", "Bombinhas/SC", "Bombas", "Quiosque", "Básico", "ativo", "2026-01-20", "6", 158, 12600, [5200, 2400, 4600, 400], "(47) 3369-3030", "lia@cabanadalia.com.br", "", "5547999993333", "@cabanadalia", "cabanalia", "lia2026", "Posto 1", "400"],
  ["e5", "Tropicana Drinks", "Rafael Souza", "Itapema/SC", "Meia Praia", "Quiosque", "Básico", "ativo", "2026-02-11", "8", 91, 7300, [3100, 1500, 2500, 200], "(47) 3368-4040", "contato@tropicanadrinks.com.br", "", "5547999994444", "@tropicanadrinks", "tropicana", "tropi2026", "Posto 2", "300"],
  ["e6", "Recanto do Mar", "Paula Lima", "Garopaba/SC", "Praia do Silveira", "Restaurante", "Básico", "pendente", "2026-06-15", "8", 0, 0, [0, 0, 0, 0], "(48) 3354-5050", "paula@recantodomar.com.br", "", "5548999995555", "@recantodomar", "recantomar", "recanto2026", "", ""],
  ["e7", "Cantinho de Cabeçudas", "Sandra Reis", "Itajaí/SC", "Cabeçudas", "Restaurante", "Básico", "ativo", "2026-03-05", "7", 120, 9800, [3800, 1800, 3600, 600], "(47) 3344-7070", "contato@cantinhocabecudas.com.br", "", "5547999996666", "@cantinhocabecudas", "cabecudas", "cabe2026", "", ""],
  ["e8", "Brava Norte Beach Bar", "Tiago Moraes", "Itajaí/SC", "Praia Brava Norte", "Estabelecimento de Praia", "Pro", "ativo", "2025-12-10", "8", 530, 52000, [18000, 6000, 20000, 8000], "(47) 3344-8080", "contato@bravanorte.com.br", "www.bravanorte.com.br", "5547999997777", "@bravanortebar", "bravanorte", "norte2025", "Posto 5", "600"],
  ["e9", "Norte Drinks & Cia", "Carla Nunes", "Itajaí/SC", "Praia Brava Norte", "Quiosque", "Básico", "ativo", "2026-02-01", "8", 210, 18600, [7000, 3000, 7600, 1000], "(47) 3344-8181", "contato@nortedrinks.com.br", "", "5547999997788", "@nortedrinks", "nortedrinks", "drinks2026", "Posto 5", "300"],
  ["e10", "Sul do Mar Petiscaria", "Eduardo Pires", "Itajaí/SC", "Praia Brava Sul", "Restaurante", "Pro", "ativo", "2025-11-20", "9", 480, 47500, [16500, 5500, 18500, 7000], "(47) 3344-9090", "contato@suldomar.com.br", "www.suldomar.com.br", "5547999998899", "@suldomar", "suldomar", "sul2025", "", ""],
  ["e11", "Bar do Sul Brava", "Patrícia Lopes", "Itajaí/SC", "Praia Brava Sul", "Bar", "Básico", "ativo", "2026-01-12", "7", 165, 13200, [5000, 2200, 5400, 600], "(47) 3344-9191", "contato@bardosul.com.br", "", "5547999998800", "@bardosulbrava", "bardosul", "bardosul2026", "", ""],
  ["e12", "Estúdio da Bruxa", "A definir", "Londrina/PR", "Centro", "Bar", "Básico", "ativo", "2026-07-21", "2", 4, 297.5, [71.6, 0, 163.2, 62.7], "", "", "", "", "@estudioda.bruxa", "estudiodabruxa", "bruxa2026", "", ""],
  ["e13", "Bar do Japa", "A definir", "Londrina/PR", "Centro", "Bar", "Básico", "ativo", "2026-07-22", "8", 380, 34200, [12000, 5200, 14000, 3000], "", "", "", "", "@_bardojapa", "bardojapa", "japa2026", "", ""],
];

export const SEED_ESTS: AdminEst[] = rows.map((a) => ({
  id: a[0],
  name: a[1],
  owner: a[2],
  city: a[3],
  neigh: a[4],
  tipo: a[5],
  plan: a[6],
  status: a[7],
  since: a[8],
  fee: a[9],
  orders: a[10],
  revenue: a[11],
  byPay: { credito: a[12][0], debito: a[12][1], pix: a[12][2], usdc: a[12][3] },
  phone: a[13],
  email: a[14],
  website: a[15],
  whatsapp: a[16],
  instagram: a[17],
  user: a[18],
  password: a[19],
  posto: a[20],
  radius: a[21],
}));

// ---- Backlog orders ----------------------------------------------------

export type AdminOrder = {
  id: number;
  code: string;
  est: string;
  ts: number;
  m: string;
  card: string;
  total: number;
  items: string;
  cust: string;
  /** Pago (IN_PRODUCTION/DELIVERED) → conta como venda/GMV. */
  paid: boolean;
};

// [id, code, estId, minutesAgo, method, card, total, items, cust]
type ORow = [number, string, string, number, string, string, number, string, string];

const oRows: ORow[] = [
  [11, "PED-4C8A21EF", "live", 2, "split", "", 96, "1× Filé com Fritas, 2× Heineken Long Neck", "Lucas"],
  [10, "PED-7F3A9C2D", "live", 3, "pix", "", 109, "1× Combo Casal, 1× Água de Coco", "Mariana"],
  [9, "PED-1D5B90A3", "live", 11, "split", "", 90, "1× Aperol Spritz, 1× Batata Frita, 2× Heineken Long Neck", "Turma da Júlia"],
  [8, "PED-9C04D7B1", "live", 20, "credito", "Visa •••• 4412", 109, "1× Moqueca de Peixe, 2× Água de Coco", "Carlos"],
  [7, "PED-5E62A803", "live", 45, "debito", "Elo •••• 2210", 95, "1× Combinação Cervejeira", ""],
  [6, "PED-B37F10C6", "live", 80, "pix", "", 70, "2× Bowl de Açaí, 1× Suco de Laranja", "Beatriz"],
  [5, "PED-64A0C9E7", "live", 1440, "credito", "Master •••• 7810", 162, "1× Filé com Fritas, 1× Porção de Camarão, 1× Caipirinha de Limão", "Roberto"],
  [3, "PED-F92B37D4", "live", 7200, "usdc", "", 104, "2× Combo Sunset", "Ana"],
  [13, "PED-A05D38C2", "e12", 6, "pix", "", 64.7, "1× Ceviche, 2× El Mojo", "Bianca"],
  [14, "PED-3E97B1F8", "e12", 14, "split", "", 98.5, "1× Burrito al Pastor, 1× Quesadilla, 3× Corona 600ml", "Turma do Léo"],
  [15, "PED-C21F84D9", "e12", 40, "credito", "Visa •••• 9034", 71.6, "1× Pollo Chipotle, 1× Batata Chilli Crisp, 2× Caipirinha", "Camila"],
  [18, "PED-80D6E4A5", "e12", 5760, "usdc", "", 62.7, "1× Burrito de Carnitas, 1× Ananás y Salsa Caliente, 1× Chamoyada", "Nina"],
];

export type OrderSeed = Omit<AdminOrder, "ts"> & { minutesAgo: number };

export const SEED_ORDERS: OrderSeed[] = oRows.map((a) => ({
  id: a[0],
  code: a[1],
  est: a[2],
  minutesAgo: a[3],
  m: a[4],
  card: a[5],
  total: a[6],
  items: a[7],
  cust: a[8],
  paid: true,
}));

// ---- Search events (landing analytics) ---------------------------------

export type SearchEvent = { field: string; value: string; day: number };

// [field, value, count]
const EV: [string, string, number][] = [
  ["city", "Itajaí/SC", 42], ["city", "Balneário Camboriú/SC", 28], ["city", "Florianópolis/SC", 19], ["city", "Londrina/PR", 16], ["city", "Itapema/SC", 12], ["city", "Bombinhas/SC", 9], ["city", "Garopaba/SC", 6],
  ["neighborhood", "Praia Brava", 24], ["neighborhood", "Centro", 18], ["neighborhood", "Praia Brava Norte", 14], ["neighborhood", "Jurerê", 11], ["neighborhood", "Praia Brava Sul", 10], ["neighborhood", "Meia Praia", 7], ["neighborhood", "Cabeçudas", 5],
  ["cuisine", "Frutos do mar", 33], ["cuisine", "Mexicana/Latina", 26], ["cuisine", "Petiscaria", 21], ["cuisine", "Boteco", 15], ["cuisine", "Drinks & Coquetéis", 12], ["cuisine", "Hamburgueria", 9],
  ["tipo", "Bar", 31], ["tipo", "Quiosque", 22], ["tipo", "Restaurante", 18], ["tipo", "Estabelecimento de Praia", 10], ["tipo", "Balada", 6], ["tipo", "Evento", 4],
];

export const SEED_EVENTS: SearchEvent[] = (() => {
  const events: SearchEvent[] = [];
  let n = 0;
  EV.forEach(([field, value, count]) => {
    for (let i = 0; i < count; i++) {
      events.push({ field, value, day: n % 30 });
      n++;
    }
  });
  return events;
})();

export const EST_TYPES = [
  "Restaurante",
  "Bar",
  "Quiosque",
  "Evento",
  "Balada",
  "Estabelecimento de Praia",
];
export const PLANS = ["Básico", "Pro"];

export function feeNum(fee: string): number {
  return parseFloat(String(fee).replace(",", ".")) || 0;
}
