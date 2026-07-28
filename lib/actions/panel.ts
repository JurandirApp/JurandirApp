"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { deliverOrder } from "@/lib/db/orders";
import { upsertMenuItem, deleteMenuItem } from "@/lib/db/menu";
import { createQrSpot, deleteQrSpot } from "@/lib/db/qr";
import { enqueueOrderReprint, enqueueTestJob } from "@/lib/db/print";
import { listPanelOrders, listPanelPrintJobs } from "@/lib/db/panel";
import { toPanelMenuItem, toPanelOrder, toPanelPrintJob } from "@/lib/panel/adapters";
import { cloudinaryConfigured, signUpload, type SignedUpload } from "@/lib/cloudinary";
import { getOAuthUrl, signState } from "@/lib/payments/mercadopago";
import type { Order, PanelPrintJob } from "@/lib/data/panel";
import {
  menuItemUpsertSchema,
  passwordChangeSchema,
  profileSaveSchema,
  qrSpotCreateSchema,
  type MenuItemUpsertInput,
  type ProfileSaveInput,
} from "@/lib/validation";

async function requireEst() {
  const s = await getSession();
  if (s?.role !== "ESTABLISHMENT" || !s.establishmentId) throw new Error("unauthorized");
  return s;
}

/** Re-fetch the session establishment's orders — the panel polls this to pick up
 *  new orders (created by customers in the app) and status changes. */
export async function refreshOrdersAction(): Promise<Order[]> {
  const s = await requireEst();
  const rows = await listPanelOrders(s.establishmentId!);
  return rows.map(toPanelOrder);
}

/** Status recente das comandas de impressão (para o card no painel). */
export async function refreshPrintJobsAction(): Promise<PanelPrintJob[]> {
  const s = await requireEst();
  const rows = await listPanelPrintJobs(s.establishmentId!);
  return rows.map(toPanelPrintJob);
}

/** Assinatura para o navegador enviar a foto de um item direto pra Cloudinary.
 *  Retorna null se as chaves do Cloudinary não estiverem configuradas. */
export async function signItemPhotoUploadAction(): Promise<SignedUpload | null> {
  const s = await requireEst();
  if (!cloudinaryConfigured()) return null;
  const timestamp = Math.floor(Date.now() / 1000);
  return signUpload(`jurandir/menu/${s.establishmentId}`, timestamp);
}

/** Assinatura para o navegador enviar a capa (cover) ou a logo do estabelecimento
 *  direto pra Cloudinary. Retorna null se o Cloudinary não estiver configurado. */
export async function signEstablishmentImageUploadAction(
  kind: "cover" | "logo",
): Promise<SignedUpload | null> {
  const s = await requireEst();
  if (!cloudinaryConfigured()) return null;
  const timestamp = Math.floor(Date.now() / 1000);
  const dir = kind === "logo" ? "logos" : "covers";
  return signUpload(`jurandir/${dir}/${s.establishmentId}`, timestamp);
}

/** Salva a URL (Cloudinary) da capa ou da logo no estabelecimento da sessão. */
export async function saveEstablishmentImageAction(
  kind: "cover" | "logo",
  url: string,
): Promise<{ ok: boolean }> {
  const s = await requireEst();
  if (typeof url !== "string" || !url.startsWith("https://")) return { ok: false };
  await prisma.establishment.update({
    where: { id: s.establishmentId! },
    data: kind === "logo" ? { logoImg: url } : { coverImg: url },
  });
  revalidatePath("/painel");
  return { ok: true };
}

export async function deliverOrderAction(dbOrderId: string): Promise<void> {
  const s = await requireEst();
  const o = await prisma.order.findUnique({ where: { id: dbOrderId }, select: { establishmentId: true } });
  if (!o || o.establishmentId !== s.establishmentId) throw new Error("forbidden");
  await deliverOrder(dbOrderId);
  revalidatePath("/painel");
}

/** Reimprime a comanda de um pedido (botão "Imprimir" no painel). Enfileira um
 *  job novo; o agente local o envia à impressora. */
export async function printOrderAction(dbOrderId: string): Promise<{ ok: boolean }> {
  const s = await requireEst();
  const ok = await enqueueOrderReprint(dbOrderId, s.establishmentId!);
  return { ok };
}

/** Salva o IP e liga/desliga a impressão automática do estabelecimento. */
export async function savePrinterConfigAction(
  printerIp: string,
  printEnabled: boolean,
): Promise<{ ok: boolean }> {
  const s = await requireEst();
  await prisma.establishment.update({
    where: { id: s.establishmentId! },
    data: { printerIp: printerIp.trim() || null, printEnabled },
  });
  revalidatePath("/painel");
  return { ok: true };
}

/** Enfileira uma comanda de teste. `hasToken` indica se o agente já pode puxá-la. */
export async function testPrintAction(): Promise<{ ok: boolean; hasToken: boolean }> {
  const s = await requireEst();
  const est = await prisma.establishment.findUnique({
    where: { id: s.establishmentId! },
    select: { printAgentToken: true },
  });
  await enqueueTestJob(s.establishmentId!);
  return { ok: true, hasToken: Boolean(est?.printAgentToken) };
}

/** Gera (ou regenera) o token do agente de impressão. Devolvido uma única vez
 *  para exibir ao dono — depois fica só no servidor. */
export async function generatePrintTokenAction(): Promise<{ ok: boolean; token: string }> {
  const s = await requireEst();
  const token = "jpa_" + randomBytes(24).toString("hex");
  await prisma.establishment.update({
    where: { id: s.establishmentId! },
    data: { printAgentToken: token },
  });
  revalidatePath("/painel");
  return { ok: true, token };
}

/** URL de OAuth pro estabelecimento conectar o Mercado Pago DELE (marketplace).
 *  Depois de conectar, os pagamentos caem na conta dele e a plataforma retém a
 *  comissão via application_fee. O retorno volta pro /painel (state assinado). */
export async function getMpConnectUrlForMeAction(): Promise<{ ok: boolean; url?: string }> {
  const s = await requireEst();
  return { ok: true, url: getOAuthUrl(signState(s.establishmentId!, "painel")) };
}

/** Desconecta a conta Mercado Pago do estabelecimento (volta ao modo conta-única). */
export async function disconnectMpAction(): Promise<{ ok: boolean }> {
  const s = await requireEst();
  await prisma.establishment.update({
    where: { id: s.establishmentId! },
    data: { mpAccessToken: null, mpRefreshToken: null, mpUserId: null, mpPublicKey: null },
  });
  revalidatePath("/painel");
  return { ok: true };
}

export async function upsertMenuItemAction(
  input: Omit<MenuItemUpsertInput, "establishmentId">,
): Promise<{ ok: boolean; error?: string; item?: import("@/lib/data/panel").MenuItem }> {
  const s = await requireEst();
  // If editing, verify the item belongs to the session establishment.
  if (input.id) {
    const item = await prisma.menuItem.findUnique({ where: { id: input.id }, select: { establishmentId: true } });
    if (!item || item.establishmentId !== s.establishmentId) return { ok: false, error: "forbidden" };
  }
  const parsed = menuItemUpsertSchema.safeParse({ ...input, establishmentId: s.establishmentId });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const row = await upsertMenuItem(parsed.data);
  if (!row) return { ok: false, error: "forbidden" };
  revalidatePath("/painel");
  return { ok: true, item: toPanelMenuItem(row) };
}

export async function deleteMenuItemAction(dbId: string): Promise<void> {
  const s = await requireEst();
  await deleteMenuItem(dbId, s.establishmentId!); // deleteMany scoped by establishmentId
  revalidatePath("/painel");
}

export async function addQrSpotAction(
  label: string,
): Promise<{ ok: boolean; qr?: { id: string; label: string } }> {
  const s = await requireEst();
  const parsed = qrSpotCreateSchema.safeParse({ establishmentId: s.establishmentId, label });
  if (!parsed.success) return { ok: false };
  const exists = await prisma.qrSpot.findFirst({
    where: { establishmentId: s.establishmentId!, label: parsed.data.label },
  });
  if (exists) return { ok: false };
  const spot = await createQrSpot(s.establishmentId!, parsed.data.label);
  revalidatePath("/painel");
  return { ok: true, qr: { id: spot.id, label: spot.label } };
}

export async function deleteQrSpotAction(dbId: string): Promise<void> {
  const s = await requireEst();
  await deleteQrSpot(dbId, s.establishmentId!); // scoped by establishmentId
  revalidatePath("/painel");
}

export async function saveProfileAction(
  input: ProfileSaveInput,
): Promise<{ ok: boolean; error?: string }> {
  const s = await requireEst();
  const parsed = profileSaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const d = parsed.data;
  await prisma.establishment.update({
    where: { id: s.establishmentId! },
    data: {
      name: d.name,
      tagline: d.tagline || null,
      description: d.desc || null,
      address: d.address || null,
      hours: d.hours || null,
      serviceFeePct: d.serviceFee,
      radiusM: (() => { const n = Number(d.radius); return d.radius && Number.isFinite(n) ? Math.round(n) : null; })(),
      phone: d.phone || null,
      email: d.email || null,
      website: d.website || null,
      whatsapp: d.whatsapp || null,
      instagram: d.instagram || null,
    },
  });
  revalidatePath("/painel");
  return { ok: true };
}

export async function changePasswordAction(
  current: string,
  next: string,
): Promise<{ ok: boolean; error?: string }> {
  const s = await requireEst();
  const parsed = passwordChangeSchema.safeParse({ current, next });
  if (!parsed.success) return { ok: false, error: "pwTooShort" };
  const user = await prisma.user.findUnique({ where: { id: s.sub } });
  if (!user || !(await verifyPassword(parsed.data.current, user.passwordHash))) {
    return { ok: false, error: "pwWrongCurrent" };
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.next) } });
  return { ok: true };
}
