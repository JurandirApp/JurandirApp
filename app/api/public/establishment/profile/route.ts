import { authEstablishment } from "@/lib/auth/bearer";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** GET — perfil atual do estabelecimento logado (o que o cliente vê). */
export async function GET(req: Request): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  const e = await prisma.establishment.findUnique({
    where: { id: s.establishmentId! },
    select: { name: true, tagline: true, address: true, hours: true, whatsapp: true, instagram: true, phone: true, email: true },
  });
  if (!e) return Response.json({ error: "not found" }, { status: 404, headers: CORS });
  return Response.json(
    {
      name: e.name,
      tagline: e.tagline ?? "",
      address: e.address ?? "",
      hours: e.hours ?? "",
      whatsapp: e.whatsapp ?? "",
      instagram: e.instagram ?? "",
      phone: e.phone ?? "",
      email: e.email ?? "",
    },
    { headers: CORS },
  );
}

/** POST — salva o perfil (campos que o cliente vê no cardápio). */
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

  await prisma.establishment.update({
    where: { id: s.establishmentId! },
    data: {
      name,
      tagline: str(body.tagline) || null,
      address: str(body.address) || null,
      hours: str(body.hours) || null,
      whatsapp: str(body.whatsapp) || null,
      instagram: str(body.instagram) || null,
      phone: str(body.phone) || null,
      email: str(body.email) || null,
    },
  });
  return Response.json({ ok: true }, { headers: CORS });
}
