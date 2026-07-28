"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import {
  establishmentUpsertSchema,
  type EstablishmentUpsertInput,
} from "@/lib/validation";
import { randomBytes } from "crypto";
import { createSubaccount } from "@/lib/payments/asaas";
import { getOAuthUrl, signState } from "@/lib/payments/mercadopago";
import { enqueueTestJob } from "@/lib/db/print";
import { cloudinaryConfigured, signUpload, type SignedUpload } from "@/lib/cloudinary";

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function assertAdmin() {
  const s = await getSession();
  if (s?.role !== "ADMIN") throw new Error("unauthorized");
}

export async function updateFeeAction(id: string, pct: number): Promise<void> {
  await assertAdmin();
  const clamped = Math.min(100, Math.max(0, Math.round(pct)));
  await prisma.establishment.update({
    where: { id },
    data: { platformFeePct: clamped },
  });
  revalidatePath("/admin");
}

export async function createEstablishmentAction(
  input: EstablishmentUpsertInput,
): Promise<{ ok: boolean; error?: string }> {
  await assertAdmin();
  const data = establishmentUpsertSchema.parse(input);
  if (!data.password || data.password.length < 6)
    return { ok: false, error: "passwordRequired" };
  const existing = await prisma.user.findUnique({ where: { email: data.user.toLowerCase() } });
  if (existing) return { ok: false, error: "emailTaken" };

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
      serviceFeePct: 0, // modelo comissão: sem taxa de serviço somada ao cliente
      phone: data.phone || null,
      email: data.email || null,
      website: data.website || null,
      whatsapp: data.whatsapp || null,
      instagram: data.instagram || null,
      logoImg: data.logoImg || null,
      // Mercado Pago é o gateway fixo — já nasce pronto pra cobrar de verdade.
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
  revalidatePath("/admin");
  return { ok: true };
}

/** Assinatura para o admin enviar a logo do estabelecimento direto pro Cloudinary.
 *  Retorna null se as chaves do Cloudinary não estiverem configuradas. */
export async function signEstablishmentLogoUploadAction(): Promise<SignedUpload | null> {
  await assertAdmin();
  if (!cloudinaryConfigured()) return null;
  const timestamp = Math.floor(Date.now() / 1000);
  return signUpload("jurandir/logos", timestamp);
}

export async function updateEstablishmentAction(
  input: EstablishmentUpsertInput,
): Promise<{ ok: boolean; error?: string }> {
  await assertAdmin();
  const data = establishmentUpsertSchema.parse(input);
  if (!data.id) return { ok: false, error: "missingId" };
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
  // Update the login's email; only rehash the password if a new one was provided.
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
  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteEstablishmentAction(id: string): Promise<void> {
  await assertAdmin();
  await prisma.establishment.delete({ where: { id } }); // cascades users/menu/orders/stats
  revalidatePath("/admin");
}

/** Cria a subconta Asaas do estabelecimento e marca pagamentos como ativos. */
export async function connectAsaasAction(
  estId: string,
): Promise<{ ok: boolean; error?: string }> {
  await assertAdmin();
  const est = await prisma.establishment.findUnique({ where: { id: estId } });
  if (!est) return { ok: false, error: "notfound" };
  if (!est.ownerCpfCnpj) return { ok: false, error: "cpf" };
  try {
    const { accountId, walletId } = await createSubaccount(est);
    await prisma.establishment.update({
      where: { id: estId },
      data: {
        paymentProvider: "ASAAS",
        asaasAccountId: accountId,
        asaasWalletId: walletId,
        paymentOnboarded: true,
      },
    });
    revalidatePath("/admin");
    return { ok: true };
  } catch {
    return { ok: false, error: "gateway" };
  }
}

/** Devolve a URL de autorização OAuth do Mercado Pago (marketplace connect). */
export async function getMpConnectUrlAction(
  estId: string,
): Promise<{ ok: boolean; url?: string }> {
  await assertAdmin();
  const est = await prisma.establishment.findUnique({
    where: { id: estId },
    select: { id: true },
  });
  if (!est) return { ok: false };
  return { ok: true, url: getOAuthUrl(signState(est.id)) };
}

export async function setPrinterConfigAction(
  estId: string,
  printerIp: string,
  printEnabled: boolean,
): Promise<{ ok: boolean }> {
  await assertAdmin();
  await prisma.establishment.update({
    where: { id: estId },
    data: { printerIp: printerIp.trim() || null, printEnabled },
  });
  revalidatePath("/admin");
  return { ok: true };
}

export async function regeneratePrintTokenAction(
  estId: string,
): Promise<{ ok: boolean; token?: string }> {
  await assertAdmin();
  const token = "jpa_" + randomBytes(24).toString("hex");
  await prisma.establishment.update({ where: { id: estId }, data: { printAgentToken: token } });
  revalidatePath("/admin");
  return { ok: true, token };
}

export async function testPrintAction(estId: string): Promise<{ ok: boolean; error?: string }> {
  await assertAdmin();
  const est = await prisma.establishment.findUnique({
    where: { id: estId },
    select: { printAgentToken: true },
  });
  if (!est?.printAgentToken) return { ok: false, error: "noToken" };
  await enqueueTestJob(estId);
  return { ok: true };
}
