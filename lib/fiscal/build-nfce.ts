import type { Establishment, MenuItem, Order, OrderItem, PaymentMethod } from "@prisma/client";
import type { FiscalEmitInput, FiscalEmitItem } from "./types";
import { FiscalValidationError } from "./types";

/** Campos fiscais que o contador preenche no MenuItem. */
export type FiscalItemFields = Pick<
  MenuItem,
  "ncm" | "cfop" | "origem" | "cstIcms" | "csosnIcms" | "cest" | "cClassTrib" | "unidadeComercial"
>;

/** Data de emissão AGORA no fuso de Brasília (-03:00, fixo — Brasil sem horário
 *  de verão desde 2019). */
export function emissaoISOAgora(now = new Date()): string {
  return new Date(now.getTime() - 3 * 3600 * 1000).toISOString().replace("Z", "-03:00");
}

/** Forma de pagamento → código tPag da SEFAZ. */
function tPag(method: PaymentMethod | null | undefined): string {
  switch (method) {
    case "CREDIT":
      return "03";
    case "DEBIT":
      return "04";
    case "PIX":
      return "17";
    default:
      return "99"; // USDC / outros
  }
}

/** Regime "1" = Simples Nacional (usa CSOSN); qualquer outro = Normal (usa CST). */
function isSimples(est: Establishment): boolean {
  return (est.regimeTributario ?? "").trim() === "1";
}

/**
 * Monta o input da NFC-e a partir do pedido + campos fiscais do cardápio.
 * Valida ANTES de qualquer chamada ao provedor: se faltar NCM/CFOP/origem ou a
 * situação tributária (CST/CSOSN) do regime, lança FiscalValidationError com a
 * lista dos itens problemáticos — a nota nem chega à SEFAZ.
 *
 * A nota cobre a MERCADORIA (soma dos itens). Se a taxa de serviço deve entrar
 * na nota é decisão do contador (ver perguntas em aberto da spec).
 */
export function buildNfceInput(params: {
  est: Establishment;
  order: Order & { items: OrderItem[] };
  ref: string;
  fiscalByMenuItemId: Map<string, FiscalItemFields>;
  paymentMethod?: PaymentMethod | null;
  now?: Date;
}): FiscalEmitInput {
  const { est, order, ref, fiscalByMenuItemId } = params;
  const simples = isSimples(est);
  const missing: string[] = [];
  const itens: FiscalEmitItem[] = [];

  order.items.forEach((oi, idx) => {
    const fiscal = oi.menuItemId ? fiscalByMenuItemId.get(oi.menuItemId) : undefined;
    const faltando: string[] = [];
    if (!fiscal?.ncm) faltando.push("NCM");
    if (!fiscal?.cfop) faltando.push("CFOP");
    if (!fiscal?.origem) faltando.push("origem");
    if (simples) {
      if (!fiscal?.csosnIcms) faltando.push("CSOSN");
    } else if (!fiscal?.cstIcms) {
      faltando.push("CST");
    }
    if (faltando.length > 0) {
      missing.push(`"${oi.name}" sem ${faltando.join(", ")}`);
      return;
    }

    const quantidade = oi.qty;
    const valorUnitario = Number(oi.unitPrice);
    itens.push({
      numero: idx + 1,
      codigo: oi.menuItemId ?? `item-${idx + 1}`,
      descricao: oi.name,
      quantidade,
      valorUnitario,
      valorBruto: Number((quantidade * valorUnitario).toFixed(2)),
      ncm: fiscal!.ncm!,
      cfop: fiscal!.cfop!,
      origem: fiscal!.origem!,
      cst: fiscal!.cstIcms,
      csosn: fiscal!.csosnIcms,
      cest: fiscal!.cest,
      cClassTrib: fiscal!.cClassTrib,
      unidade: fiscal!.unidadeComercial ?? "UN",
    });
  });

  if (missing.length > 0) {
    throw new FiscalValidationError(
      `Não é possível emitir: ${missing.join("; ")}. Peça ao contador para completar a classificação fiscal do cardápio.`,
      missing,
    );
  }

  const total = Number(itens.reduce((s, it) => s + it.valorBruto, 0).toFixed(2));

  return {
    est,
    ref,
    emissaoISO: emissaoISOAgora(params.now),
    itens,
    total,
    pagamento: { forma: tPag(params.paymentMethod), valor: total },
    consumidor: order.customerName ? { nome: order.customerName } : undefined,
  };
}
