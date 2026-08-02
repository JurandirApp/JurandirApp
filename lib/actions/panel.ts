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
import { reconcileOrder } from "@/lib/db/payments";
import { listPanelOrders, listPanelPrintJobs } from "@/lib/db/panel";
import { toPanelMenuItem, toPanelOrder, toPanelPrintJob } from "@/lib/panel/adapters";
import { cloudinaryConfigured, signUpload, type SignedUpload } from "@/lib/cloudinary";
import { getOAuthUrl, signState, probePixReady } from "@/lib/payments/mercadopago";
import { createPagarmeRecipient, getPagarmeKycLink } from "@/lib/payments/pagarme";
import { createSubaccount } from "@/lib/payments/asaas";
import { periodRange, type OrdersPeriod } from "@/lib/domain/period";
import {
  normalizeWeekly,
  formatWeekly,
  deriveDayStartHour,
} from "@/lib/domain/schedule";
import { Prisma } from "@prisma/client";
import type { Order, PanelPrintJob, PanelPrinter, PrinterInput } from "@/lib/data/panel";

// Rótulos dos dias (índice 0 = domingo) pro texto de exibição do horário.
const DIAS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Roteamento simples: comida vs bebida. (Balcão é o toggle "pedido completo",
// não uma categoria — ver PrintersManager.)
const PRINT_CATEGORIES = ["Alimentos", "Bebidas"];
import {
  menuItemUpsertSchema,
  pagarmeRecipientSchema,
  passwordChangeSchema,
  profileSaveSchema,
  qrSpotCreateSchema,
  type MenuItemUpsertInput,
  type PagarmeRecipientForm,
  type ProfileSaveInput,
} from "@/lib/validation";

async function requireEst() {
  const s = await getSession();
  if (s?.role !== "ESTABLISHMENT" || !s.establishmentId) throw new Error("unauthorized");
  return s;
}

/** Re-fetch the session establishment's orders do período pedido (default: hoje).
 *  O painel usa isto no poll e ao trocar o filtro de período. */
export async function refreshOrdersAction(period?: OrdersPeriod): Promise<Order[]> {
  const s = await requireEst();
  const est = await prisma.establishment.findUnique({
    where: { id: s.establishmentId! },
    select: { dayStartHour: true },
  });
  const p = period ?? { kind: "hoje" };
  const range = periodRange(p, est?.dayStartHour ?? 0, Date.now());
  let rows = await listPanelOrders(s.establishmentId!, range);
  // Auto-reconciliação (só na visão viva "hoje"): confirma pagamentos que já
  // caíram no Mercado Pago mas não foram marcados como pagos — cliente não
  // voltou ao app / webhook ausente ou que não cobre cartão. Idempotente; usa o
  // token do próprio estabelecimento. Teto de 25 (mais recentes) por atualização.
  if (p.kind === "hoje") {
    const awaiting = rows
      .filter((o) => o.status === "AWAITING_PAYMENT" && o.payment)
      .slice(0, 25);
    if (awaiting.length) {
      await Promise.all(awaiting.map((o) => reconcileOrder(o.id).catch(() => {})));
      rows = await listPanelOrders(s.establishmentId!, range);
    }
  }
  return rows.map(toPanelOrder);
}

/** Verifica se a conta MP conectada consegue gerar QR Pix e grava o status.
 *  Chamado no connect do MP e pelo botão "Verificar Pix" no painel. */
export async function checkPixReadyAction(): Promise<{
  ready: boolean;
  reason: string;
  connected: boolean;
}> {
  const s = await requireEst();
  const est = await prisma.establishment.findUnique({ where: { id: s.establishmentId! } });
  if (!est) return { ready: false, reason: "error", connected: false };
  const res = await probePixReady(est);
  await prisma.establishment.update({
    where: { id: est.id },
    // not-connected → null (não avisa; usa a conta da plataforma).
    data: { mpPixReady: res.reason === "not-connected" ? null : res.ready },
  });
  revalidatePath("/painel");
  return { ready: res.ready, reason: res.reason, connected: Boolean(est.mpAccessToken) };
}

// Matriz de capacidade: qual gateway implementa qual método hoje. Escolhas fora
// da matriz (ou de um gateway não pronto) caem no Mercado Pago.
const GATEWAY_CAP: Record<string, { pix: boolean; credit: boolean; debit: boolean }> = {
  MERCADO_PAGO: { pix: true, credit: true, debit: true },
  PAGARME: { pix: true, credit: true, debit: true },
  ASAAS: { pix: true, credit: false, debit: false },
  INFINITEPAY: { pix: false, credit: false, debit: false },
};

/** Salva o gateway escolhido POR MÉTODO (Pix/Crédito/Débito), validando cada um
 *  contra a matriz de capacidade + prontidão. Retorna os valores efetivos. */
export async function savePaymentRoutingAction(routing: {
  pix: string;
  credit: string;
  debit: string;
}): Promise<{ ok: boolean; error?: string; pix: string; credit: string; debit: string }> {
  const s = await requireEst();
  const est = await prisma.establishment.findUnique({
    where: { id: s.establishmentId! },
    select: { pagarmeRecipientId: true, asaasWalletId: true },
  });
  const ready: Record<string, boolean> = {
    PAGARME: Boolean(est?.pagarmeRecipientId),
    ASAAS: Boolean(est?.asaasWalletId),
  };
  const resolve = (
    v: string,
    method: "pix" | "credit" | "debit",
  ): "MERCADO_PAGO" | "PAGARME" | "ASAAS" => {
    // MP faz tudo (fallback). Os demais só se implementam o método E estão prontos.
    if (v !== "PAGARME" && v !== "ASAAS") return "MERCADO_PAGO";
    if (!GATEWAY_CAP[v]?.[method] || !ready[v]) return "MERCADO_PAGO";
    return v;
  };
  const pix = resolve(routing.pix, "pix");
  const credit = resolve(routing.credit, "credit");
  const debit = resolve(routing.debit, "debit");
  await prisma.establishment.update({
    where: { id: s.establishmentId! },
    data: { gatewayPix: pix, gatewayCredit: credit, gatewayDebit: debit },
  });
  revalidatePath("/painel");
  return { ok: true, pix, credit, debit };
}

/** Cria o recebedor Pagar.me do estabelecimento (dados bancários + KYC) e o vincula. */
export async function createPagarmeRecipientAction(
  input: PagarmeRecipientForm,
): Promise<{ ok: boolean; error?: string; status?: string }> {
  const s = await requireEst();
  const parsed = pagarmeRecipientSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const r = await createPagarmeRecipient(parsed.data);
    await prisma.establishment.update({
      where: { id: s.establishmentId! },
      data: { pagarmeRecipientId: r.id, pagarmeRecipientStatus: r.status },
    });
    revalidatePath("/painel");
    return { ok: true, status: r.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "error" };
  }
}

/** Gera o link/QR do webapp hospedado do Pagar.me pra o dono completar conta
 *  bancária + identidade (prova de vida) — esses dados não passam pela gente. */
export async function generatePagarmeKycLinkAction(): Promise<{
  ok: boolean;
  url?: string;
  base64?: string;
  error?: string;
}> {
  const s = await requireEst();
  const est = await prisma.establishment.findUnique({
    where: { id: s.establishmentId! },
    select: { pagarmeRecipientId: true },
  });
  if (!est?.pagarmeRecipientId) return { ok: false, error: "no-recipient" };
  try {
    const link = await getPagarmeKycLink(est.pagarmeRecipientId);
    // Só fica pronto quando o recebedor chega em `affiliation`.
    if (!link.url && !link.base64) return { ok: false, error: "not-ready" };
    return { ok: true, url: link.url, base64: link.base64 };
  } catch {
    return { ok: false, error: "not-ready" };
  }
}

/** Cria a subconta Asaas do estabelecimento (self-serve, split via wallet). Usa
 *  o CPF/CNPJ informado + os dados do Perfil. Libera o Pix por Asaas na matriz. */
export async function connectAsaasAction(
  cpfCnpj: string,
): Promise<{ ok: boolean; error?: string }> {
  const s = await requireEst();
  const doc = (cpfCnpj ?? "").replace(/\D/g, "");
  if (doc.length !== 11 && doc.length !== 14) return { ok: false, error: "cpf" };
  const est = await prisma.establishment.findUnique({ where: { id: s.establishmentId! } });
  if (!est) return { ok: false, error: "error" };
  try {
    const { accountId, walletId } = await createSubaccount({ ...est, ownerCpfCnpj: doc });
    await prisma.establishment.update({
      where: { id: est.id },
      data: { ownerCpfCnpj: doc, asaasAccountId: accountId, asaasWalletId: walletId },
    });
    revalidatePath("/painel");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "error" };
  }
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

/** Enfileira uma comanda de teste numa impressora (ou na padrão/primeira).
 *  `hasToken` indica se o agente já pode puxá-la. */
export async function testPrintAction(
  printerId?: string,
): Promise<{ ok: boolean; hasToken: boolean }> {
  const s = await requireEst();
  const est = await prisma.establishment.findUnique({
    where: { id: s.establishmentId! },
    select: { printAgentToken: true },
  });
  await enqueueTestJob(s.establishmentId!, printerId);
  return { ok: true, hasToken: Boolean(est?.printAgentToken) };
}

// ---- Impressoras (CRUD) — cada estação (Bar, Cozinha…) é uma impressora ------

function cleanPrinterInput(input: PrinterInput) {
  const fullOrder = Boolean(input?.fullOrder);
  return {
    name: String(input?.name ?? "").trim().slice(0, 60),
    connection: input?.connection === "NETWORK" ? "NETWORK" : "USB",
    target: String(input?.target ?? "").trim().slice(0, 200),
    port: Number(input?.port) || 9100,
    // Balcão (pedido completo) não roteia por categoria nem é o "padrão".
    categories: fullOrder
      ? []
      : Array.isArray(input?.categories)
        ? [...new Set(input.categories.filter((c) => typeof c === "string" && c))].slice(0, 50)
        : [],
    isDefault: fullOrder ? false : Boolean(input?.isDefault),
    fullOrder,
    active: input?.active !== false,
  };
}

/** Impressoras do estabelecimento + categorias do cardápio (pro roteamento). */
export async function listPrintersAction(): Promise<{
  printers: PanelPrinter[];
  categories: string[];
}> {
  const s = await requireEst();
  const [printers, cats] = await Promise.all([
    prisma.printer.findMany({
      where: { establishmentId: s.establishmentId! },
      orderBy: { createdAt: "asc" },
    }),
    prisma.menuItem.findMany({
      where: { establishmentId: s.establishmentId!, active: true },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    }),
  ]);
  return {
    printers: printers.map((p) => ({
      id: p.id,
      name: p.name,
      connection: p.connection,
      target: p.target,
      port: p.port,
      categories: p.categories,
      isDefault: p.isDefault,
      fullOrder: p.fullOrder,
      active: p.active,
    })),
    // Alimentos + Bebidas sempre aparecem; junta com o que o cardápio já usa
    // (dedup) pra nenhum item ficar sem impressora.
    categories: [...new Set([...PRINT_CATEGORIES, ...cats.map((c) => c.category)])],
  };
}

export async function createPrinterAction(input: PrinterInput): Promise<{ ok: boolean }> {
  const s = await requireEst();
  const data = cleanPrinterInput(input);
  if (!data.name || !data.target) return { ok: false };
  const created = await prisma.printer.create({
    data: { ...data, establishmentId: s.establishmentId! },
  });
  // Só uma padrão por estabelecimento.
  if (data.isDefault) {
    await prisma.printer.updateMany({
      where: { establishmentId: s.establishmentId!, id: { not: created.id } },
      data: { isDefault: false },
    });
  }
  revalidatePath("/painel");
  return { ok: true };
}

export async function updatePrinterAction(
  id: string,
  input: PrinterInput,
): Promise<{ ok: boolean }> {
  const s = await requireEst();
  const existing = await prisma.printer.findFirst({
    where: { id, establishmentId: s.establishmentId! },
    select: { id: true },
  });
  if (!existing) return { ok: false };
  const data = cleanPrinterInput(input);
  if (!data.name || !data.target) return { ok: false };
  await prisma.printer.update({ where: { id }, data });
  if (data.isDefault) {
    await prisma.printer.updateMany({
      where: { establishmentId: s.establishmentId!, id: { not: id } },
      data: { isDefault: false },
    });
  }
  revalidatePath("/painel");
  return { ok: true };
}

export async function deletePrinterAction(id: string): Promise<{ ok: boolean }> {
  const s = await requireEst();
  const existing = await prisma.printer.findFirst({
    where: { id, establishmentId: s.establishmentId! },
    select: { id: true },
  });
  if (!existing) return { ok: false };
  await prisma.printer.delete({ where: { id } });
  revalidatePath("/painel");
  return { ok: true };
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
): Promise<{ ok: boolean; error?: string; dayStartHour?: number; dayStartSet?: boolean }> {
  const s = await requireEst();
  const parsed = profileSaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const d = parsed.data;
  // weeklyHours é a fonte única; os derivados (texto, fronteira do dia) saem dele.
  const weekly = normalizeWeekly(d.weekly ?? []);
  const hoursStr = formatWeekly(weekly, { labels: DIAS_PT, and: "e", allClosed: "Fechado" });
  const dayStartHour = deriveDayStartHour(weekly);
  await prisma.establishment.update({
    where: { id: s.establishmentId! },
    data: {
      name: d.name,
      tagline: d.tagline || null,
      description: d.desc || null,
      address: d.address || null,
      weeklyHours: weekly as unknown as Prisma.InputJsonValue,
      hours: hoursStr || null,
      dayStartHour,
      dayStartSet: true,
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
  return { ok: true, dayStartHour, dayStartSet: true };
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
