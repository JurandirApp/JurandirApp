import { authEstablishment } from "@/lib/auth/bearer";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { normalizeWeekly, formatWeekly, deriveDayStartHour } from "@/lib/domain/schedule";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Índice 0 = domingo (bate com Date.getDay() e com o painel web).
const DIAS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** GET — perfil atual do estabelecimento logado (o que o cliente vê). Inclui o
 *  `weeklyHours` estruturado (fonte única do horário, igual ao painel web). */
export async function GET(req: Request): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  const e = await prisma.establishment.findUnique({
    where: { id: s.establishmentId! },
    select: {
      name: true, tagline: true, address: true, hours: true, weeklyHours: true,
      whatsapp: true, instagram: true, phone: true, email: true,
    },
  });
  if (!e) return Response.json({ error: "not found" }, { status: 404, headers: CORS });
  return Response.json(
    {
      name: e.name,
      tagline: e.tagline ?? "",
      address: e.address ?? "",
      hours: e.hours ?? "",
      // Sempre length 7 (índice 0 = domingo), cada dia com 0..2 janelas {o,c}.
      weeklyHours: normalizeWeekly(e.weeklyHours),
      whatsapp: e.whatsapp ?? "",
      instagram: e.instagram ?? "",
      phone: e.phone ?? "",
      email: e.email ?? "",
    },
    { headers: CORS },
  );
}

/** POST — salva o perfil. Se vier `weekly` (horário estruturado), ele é a FONTE
 *  ÚNICA: normaliza e deriva o texto `hours` + `dayStartHour` a partir dele —
 *  exatamente como o painel web (savePerfilAction). Sem `weekly`, mantém o
 *  `hours` de texto livre (compatibilidade). */
export async function POST(req: Request): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid" }, { status: 400, headers: CORS });
  }
  const name = str(body.name);
  if (!name) return Response.json({ error: "nameRequired" }, { status: 422, headers: CORS });

  const base = {
    name,
    tagline: str(body.tagline) || null,
    address: str(body.address) || null,
    whatsapp: str(body.whatsapp) || null,
    instagram: str(body.instagram) || null,
    phone: str(body.phone) || null,
    email: str(body.email) || null,
  };

  // `weekly` presente → horário estruturado é a fonte única (deriva o resto).
  const hasWeekly = Array.isArray(body.weekly);
  const data = hasWeekly
    ? (() => {
        const weekly = normalizeWeekly(body.weekly);
        const hoursStr = formatWeekly(weekly, { labels: DIAS_PT, and: "e", allClosed: "Fechado" });
        return {
          ...base,
          weeklyHours: weekly as unknown as Prisma.InputJsonValue,
          hours: hoursStr || null,
          dayStartHour: deriveDayStartHour(weekly),
          dayStartSet: true,
        };
      })()
    : { ...base, hours: str(body.hours) || null };

  await prisma.establishment.update({ where: { id: s.establishmentId! }, data });
  return Response.json({ ok: true }, { headers: CORS });
}
