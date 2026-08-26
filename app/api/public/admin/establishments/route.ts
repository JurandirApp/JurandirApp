import { authAdmin } from "@/lib/auth/bearer";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { establishmentUpsertSchema } from "@/lib/validation";
import { establishmentAddressQuery, geocodeAddress } from "@/lib/geo/geocode";

/** Geocodifica o endereço do bar e grava lat/lng (best-effort; nunca falha o
 *  cadastro se o Google não responder ou não houver chave). */
async function geocodeEstablishment(
  id: string,
  loc: { neighborhood?: string | null; city?: string | null },
): Promise<void> {
  const coords = await geocodeAddress(establishmentAddressQuery(loc));
  if (coords) {
    await prisma.establishment.update({
      where: { id },
      data: { lat: coords.lat, lng: coords.lng },
    });
  }
}

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * POST /api/public/admin/establishments — cria (sem id) ou edita (com id) um
 * estabelecimento + seu usuário de login. Mesma regra do painel web.
 */
export async function POST(req: Request): Promise<Response> {
  const s = await authAdmin(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid" }, { status: 400, headers: CORS });
  }
  const parsed = establishmentUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalid" }, { status: 422, headers: CORS });
  }
  const data = parsed.data;

  if (!data.id) {
    // criar
    if (!data.password || data.password.length < 6) {
      return Response.json({ ok: false, error: "passwordRequired" }, { status: 422, headers: CORS });
    }
    const existing = await prisma.user.findUnique({ where: { email: data.user.toLowerCase() } });
    if (existing) return Response.json({ ok: false, error: "emailTaken" }, { status: 409, headers: CORS });

    const est = await prisma.establishment.create({
      data: {
        slug: `${slugify(data.name)}-${Date.now().toString(36)}`,
        name: data.name,
        owner: data.owner,
        type: data.type,
        city: data.city || "—",
        neighborhood: data.neighborhood || null,
        posto: data.posto || null,
        radiusM: data.radiusM ? Number(data.radiusM) : null,
        plan: data.plan,
        platformFeePct: data.platformFeePct,
        serviceFeePct: 0,
        phone: data.phone || null,
        email: data.email || null,
        website: data.website || null,
        whatsapp: data.whatsapp || null,
        instagram: data.instagram || null,
        logoImg: data.logoImg || null,
        paymentProvider: "MERCADO_PAGO",
        paymentOnboarded: true,
      },
    });
    await prisma.user.create({
      data: {
        email: data.user.toLowerCase(),
        passwordHash: await hashPassword(data.password),
        name: data.name,
        role: "ESTABLISHMENT",
        establishmentId: est.id,
      },
    });
    await geocodeEstablishment(est.id, { neighborhood: data.neighborhood, city: data.city });
    return Response.json({ ok: true, id: est.id }, { status: 201, headers: CORS });
  }

  // editar
  await prisma.establishment.update({
    where: { id: data.id },
    data: {
      name: data.name,
      owner: data.owner,
      type: data.type,
      city: data.city || "—",
      neighborhood: data.neighborhood || null,
      posto: data.posto || null,
      radiusM: data.radiusM ? Number(data.radiusM) : null,
      plan: data.plan,
      platformFeePct: data.platformFeePct,
      phone: data.phone || null,
      email: data.email || null,
      website: data.website || null,
      whatsapp: data.whatsapp || null,
      instagram: data.instagram || null,
      logoImg: data.logoImg || null,
    },
  });
  const est = await prisma.establishment.findUnique({
    where: { id: data.id },
    include: { users: { where: { role: "ESTABLISHMENT" }, take: 1 } },
  });
  const user = est?.users[0];
  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        email: data.user.toLowerCase(),
        name: data.name,
        ...(data.password && data.password.length >= 6
          ? { passwordHash: await hashPassword(data.password) }
          : {}),
      },
    });
  }
  await geocodeEstablishment(data.id, { neighborhood: data.neighborhood, city: data.city });
  return Response.json({ ok: true, id: data.id }, { headers: CORS });
}
