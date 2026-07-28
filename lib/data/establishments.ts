/**
 * Landing ranking seed data — ported verbatim from the hi-fi prototype
 * (design_handoff_jurandir/Site Jurandir.dc.html). Fase 1 uses this local mock;
 * later phases replace it with the Prisma-backed establishments.
 */

export const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export type TimeWindow = { o: string; c: string };
/** Length 7, index 0 = Sunday. `null` = closed that day. */
export type WeekSchedule = (TimeWindow | null)[];

export type Establishment = {
  id: string;
  name: string;
  slug: string;
  city: string;
  neigh: string;
  tipo: string;
  cuisine: string;
  orders: number;
  rating: number | null; // null = sem avaliação ainda (estabelecimento novo)
  logo?: string; // logo da empresa (Cloudinary), opcional
  hours: WeekSchedule;
};

const BEACH_TYPES = ["Quiosque", "Estabelecimento de Praia"];

const beachH: WeekSchedule = Array.from({ length: 7 }, () => ({
  o: "09:00",
  c: "20:00",
}));

const barH: WeekSchedule = [
  { o: "17:00", c: "23:00" }, // Sun
  null, // Mon
  { o: "18:00", c: "00:00" }, // Tue
  { o: "18:00", c: "00:00" }, // Wed
  { o: "18:00", c: "01:00" }, // Thu
  { o: "18:00", c: "02:00" }, // Fri
  { o: "16:00", c: "02:00" }, // Sat
];

const bruxaH: WeekSchedule = [
  { o: "16:00", c: "23:00" }, // Sun
  null,
  null,
  { o: "18:00", c: "01:00" }, // Wed
  { o: "18:00", c: "01:00" }, // Thu
  { o: "18:00", c: "01:00" }, // Fri
  { o: "16:00", c: "01:00" }, // Sat
];

// [id, name, city, neigh, tipo, cuisine, orders, rating]
type Row = [string, string, string, string, string, string, number, number];

const rows: Row[] = [
  ["live", "Quiosque do Mar", "Itajaí/SC", "Praia Brava", "Quiosque", "Frutos do mar", 8, 4.8],
  ["e2", "Bar do Zé", "Florianópolis/SC", "Jurerê", "Bar", "Boteco", 412, 4.5],
  ["e3", "Sunset Beach Club", "Balneário Camboriú/SC", "Centro", "Balada", "Petiscaria", 689, 4.4],
  ["e4", "Cabana da Lia", "Bombinhas/SC", "Bombas", "Quiosque", "Frutos do mar", 158, 4.6],
  ["e5", "Tropicana Drinks", "Itapema/SC", "Meia Praia", "Quiosque", "Drinks & Coquetéis", 91, 4.2],
  ["e7", "Cantinho de Cabeçudas", "Itajaí/SC", "Cabeçudas", "Restaurante", "Petiscaria", 120, 4.3],
  ["e8", "Brava Norte Beach Bar", "Itajaí/SC", "Praia Brava Norte", "Estabelecimento de Praia", "Hamburgueria", 530, 4.7],
  ["e9", "Norte Drinks & Cia", "Itajaí/SC", "Praia Brava Norte", "Quiosque", "Drinks & Coquetéis", 210, 4.1],
  ["e10", "Sul do Mar Petiscaria", "Itajaí/SC", "Praia Brava Sul", "Restaurante", "Petiscaria", 480, 4.5],
  ["e11", "Bar do Sul Brava", "Itajaí/SC", "Praia Brava Sul", "Bar", "Boteco", 165, 4.2],
  ["e12", "Estúdio da Bruxa", "Londrina/PR", "Centro", "Bar", "Mexicana/Latina", 4, 5.0],
  ["e13", "Bar do Japa", "Londrina/PR", "Centro", "Bar", "Japonesa", 380, 4.6],
];

/** "Quiosque do Mar" → "quiosque-do-mar" (bate com o slug real no banco). */
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const establishments: Establishment[] = rows.map((a) => ({
  id: a[0],
  name: a[1],
  slug: slugify(a[1]),
  city: a[2],
  neigh: a[3],
  tipo: a[4],
  cuisine: a[5],
  orders: a[6],
  rating: a[7],
  hours: a[0] === "e12" ? bruxaH : BEACH_TYPES.includes(a[4]) ? beachH : barH,
}));

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Is the establishment open at the given moment? Handles overnight windows. */
export function isOpenAt(week: WeekSchedule, date: Date): boolean {
  const day = date.getDay();
  const mins = date.getHours() * 60 + date.getMinutes();

  const today = week[day];
  if (today) {
    const o = toMin(today.o);
    const c = toMin(today.c);
    if (c > o ? mins >= o && mins < c : mins >= o) return true;
  }

  // Overnight window that started yesterday (c <= o) may still be open early today.
  const yesterday = week[(day + 6) % 7];
  if (yesterday) {
    const o = toMin(yesterday.o);
    const c = toMin(yesterday.c);
    if (c <= o && mins < c) return true;
  }

  return false;
}

/** Unique, sorted list helper for filter options. */
export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
