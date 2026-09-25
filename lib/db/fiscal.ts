import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  getFiscalProvider,
  buildNfceInput,
  FiscalValidationError,
  type FiscalItemFields,
  type FiscalStatus,
} from "@/lib/fiscal";
import { renderDanfe, type DanfeData } from "@/lib/print/escpos";

const toB64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");
const timeLabel = (d: Date): string =>
  d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

type DocPatch = { status: "QUEUED" | "ERROR"; rejeicao: string | null };

async function upsertDoc(
  orderId: string,
  est: { id: string; fiscalEnv: "HOMOLOGACAO" | "PRODUCAO"; nfceSerie: number | null },
  ref: string,
  patch: DocPatch,
) {
  return prisma.fiscalDocument.upsert({
    where: { orderId },
    create: {
      establishmentId: est.id,
      orderId,
      ref,
      env: est.fiscalEnv,
      serie: est.nfceSerie ?? undefined,
      ...patch,
    },
    update: { ref, ...patch },
  });
}

/**
 * Emite a NFC-e de um pedido. Assíncrono e idempotente (1 nota por pedido):
 * valida os campos fiscais, dispara no provedor e deixa o doc em PROCESSING —
 * o resultado final chega por webhook/reconciliação. Reemite só se o doc estava
 * em ERROR/REJECTED. NUNCA roda dentro da transação da comanda.
 */
export async function emitFiscalForOrder(
  orderId: string,
  opts: { manual?: boolean } = {},
): Promise<{ ok: boolean; status?: string; error?: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, establishment: true, payment: true },
  });
  if (!order) return { ok: false, error: "Pedido não encontrado" };
  const est = order.establishment;

  if (est.fiscalMode === "OFF") return { ok: false, error: "Emissão fiscal desligada" };
  // Automático só dispara sozinho no modo AUTO_ON_PRINT; MANUAL exige o botão.
  if (!opts.manual && est.fiscalMode !== "AUTO_ON_PRINT") {
    return { ok: false, error: "Modo manual: emitir pelo botão" };
  }

  const existing = await prisma.fiscalDocument.findUnique({ where: { orderId } });
  if (existing && existing.status !== "ERROR" && existing.status !== "REJECTED") {
    return { ok: true, status: existing.status };
  }

  // Campos fiscais dos itens (o contador preenche no cadastro do cardápio).
  const ids = order.items.map((i) => i.menuItemId).filter((x): x is string => Boolean(x));
  const menu = ids.length
    ? await prisma.menuItem.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          ncm: true,
          cfop: true,
          origem: true,
          cstIcms: true,
          csosnIcms: true,
          cest: true,
          cClassTrib: true,
          unidadeComercial: true,
        },
      })
    : [];
  const map = new Map<string, FiscalItemFields>(menu.map((m) => [m.id, m]));

  // ref novo por tentativa (o Focus trata ref como chave de idempotência; reenviar
  // o mesmo ref só devolveria a rejeição anterior).
  const ref = `${order.code}-${Date.now().toString(36)}`;

  let input;
  try {
    input = buildNfceInput({
      est,
      order,
      ref,
      fiscalByMenuItemId: map,
      paymentMethod: order.payment?.method ?? null,
    });
  } catch (e) {
    if (e instanceof FiscalValidationError) {
      await upsertDoc(orderId, est, ref, { status: "ERROR", rejeicao: e.message });
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const doc = await upsertDoc(orderId, est, ref, { status: "QUEUED", rejeicao: null });

  try {
    const res = await getFiscalProvider(est).emitNFCe(input);
    if (res.status === "rejected") {
      const st = await getFiscalProvider(est).getStatus(est, ref);
      await applyFiscalStatus(doc.id, st);
      return { ok: false, status: "REJECTED", error: st.rejeicao };
    }
    await prisma.fiscalDocument.update({
      where: { id: doc.id },
      data: { status: "PROCESSING", providerRaw: (res.raw as Prisma.InputJsonValue) ?? undefined },
    });
    return { ok: true, status: "PROCESSING" };
  } catch (e) {
    await prisma.fiscalDocument.update({
      where: { id: doc.id },
      data: { status: "ERROR", rejeicao: String((e as Error).message ?? e).slice(0, 500) },
    });
    return { ok: false, error: "Provedor fiscal indisponível. Tente reemitir." };
  }
}

/** Dispara a emissão automática sem NUNCA quebrar o fluxo do pedido/comanda.
 *  No-op quando o estabelecimento não está em AUTO_ON_PRINT (o guard está em
 *  emitFiscalForOrder). Erros são só logados. */
export async function autoEmitFiscal(orderId: string): Promise<void> {
  try {
    await emitFiscalForOrder(orderId, { manual: false });
  } catch (e) {
    console.error("[fiscal] auto-emit falhou", orderId, e);
  }
}

/** Reconcilia o estado de uma nota por `ref` (webhook do Focus + polling de
 *  segurança). Nunca sobrescreve uma nota já autorizada. */
export async function reconcileFiscalByRef(ref: string): Promise<void> {
  const doc = await prisma.fiscalDocument.findUnique({
    where: { ref },
    include: { establishment: true },
  });
  if (!doc || doc.status === "AUTHORIZED") return;
  const st = await getFiscalProvider(doc.establishment).getStatus(doc.establishment, ref);
  await applyFiscalStatus(doc.id, st);
}

/** Grava o estado consultado e, se AUTORIZADA, enfileira o cupom DANFE. */
async function applyFiscalStatus(docId: string, st: FiscalStatus): Promise<void> {
  const status =
    st.status === "authorized"
      ? "AUTHORIZED"
      : st.status === "rejected"
        ? "REJECTED"
        : st.status === "error"
          ? "ERROR"
          : "PROCESSING";
  await prisma.fiscalDocument.update({
    where: { id: docId },
    data: {
      status,
      numero: st.numero ?? undefined,
      serie: st.serie ?? undefined,
      chave: st.chave ?? undefined,
      protocolo: st.protocolo ?? undefined,
      xmlUrl: st.xmlUrl ?? undefined,
      danfeUrl: st.danfeUrl ?? undefined,
      qrcodeUrl: st.qrcodeUrl ?? undefined,
      rejeicao: st.rejeicao ?? undefined,
      providerRaw: (st.raw as Prisma.InputJsonValue) ?? undefined,
    },
  });
  if (status === "AUTHORIZED") await enqueueDanfeJob(docId);
}

/** Enfileira o cupom DANFE (PrintJob kind FISCAL). Idempotente por pedido e só
 *  se a impressão estiver ligada e a nota tiver chave. */
async function enqueueDanfeJob(docId: string): Promise<void> {
  const doc = await prisma.fiscalDocument.findUnique({
    where: { id: docId },
    include: { establishment: true, order: { include: { items: true } } },
  });
  if (!doc || !doc.chave) return;
  const est = doc.establishment;
  if (!est.printEnabled) return;
  const already = await prisma.printJob.findFirst({
    where: { orderId: doc.orderId, kind: "FISCAL" },
  });
  if (already) return;

  const printer = await prisma.printer.findFirst({
    where: { establishmentId: est.id, active: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  const address =
    [est.fiscalStreet, est.fiscalNumber, est.fiscalDistrict, est.fiscalCity, est.fiscalUf]
      .filter(Boolean)
      .join(", ") || undefined;

  const data: DanfeData = {
    establishment: est.name,
    cnpj: est.cnpj ?? undefined,
    address,
    code: doc.order.code,
    timeLabel: timeLabel(new Date()),
    items: doc.order.items.map((i) => ({
      name: i.name,
      qty: i.qty,
      unit: "UN",
      unitPrice: Number(i.unitPrice),
      total: Number((Number(i.unitPrice) * i.qty).toFixed(2)),
    })),
    total: Number(
      doc.order.items.reduce((s, i) => s + Number(i.unitPrice) * i.qty, 0).toFixed(2),
    ),
    numero: doc.numero ?? undefined,
    serie: doc.serie ?? undefined,
    chave: doc.chave,
    protocolo: doc.protocolo ?? undefined,
    qrData: doc.qrcodeUrl ?? doc.chave,
    homologacao: doc.env === "HOMOLOGACAO",
  };

  await prisma.printJob.create({
    data: {
      establishmentId: est.id,
      printerId: printer?.id ?? null,
      orderId: doc.orderId,
      kind: "FISCAL",
      payloadB64: toB64(renderDanfe(data)),
    },
  });
}
