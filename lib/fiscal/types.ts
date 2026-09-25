import type { Establishment } from "@prisma/client";

/** Estado normalizado da emissão (agnóstico de provedor). */
export type FiscalStatusValue =
  | "queued"
  | "processing"
  | "authorized"
  | "rejected"
  | "error";

/** Um item já resolvido para a nota (valores + campos fiscais do MenuItem). */
export type FiscalEmitItem = {
  numero: number; // numero_item (1..n)
  codigo: string; // codigo_produto (menuItemId ou índice)
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  valorBruto: number; // quantidade * valorUnitario
  // Campos fiscais (preenchidos pelo contador no cadastro do cardápio):
  ncm: string;
  cfop: string;
  origem: string; // 0-8
  cst?: string | null; // Regime Normal
  csosn?: string | null; // Simples Nacional
  cest?: string | null;
  cClassTrib?: string | null; // reforma (IBS/CBS)
  unidade: string; // UN, KG...
};

/** Forma de pagamento no código da SEFAZ (tPag): 01 dinheiro, 03 crédito,
 *  04 débito, 17 Pix, 99 outros. */
export type FiscalPagamento = { forma: string; valor: number };

/** Tudo que o provedor precisa para emitir uma NFC-e. Montado por build-nfce. */
export type FiscalEmitInput = {
  est: Establishment;
  ref: string; // FiscalDocument.ref (idempotência no provedor)
  emissaoISO: string; // data_emissao com fuso (-03:00)
  itens: FiscalEmitItem[];
  total: number;
  pagamento: FiscalPagamento;
  consumidor?: { nome?: string; documento?: string }; // CPF/CNPJ opcional
};

/** Retorno imediato da emissão (o Focus é assíncrono → normalmente "processing"). */
export type FiscalResult = {
  ref: string;
  status: FiscalStatusValue;
  raw?: unknown;
};

/** Estado consultado (webhook/polling) já normalizado. */
export type FiscalStatus = {
  status: FiscalStatusValue;
  numero?: number;
  serie?: number;
  chave?: string;
  protocolo?: string;
  xmlUrl?: string;
  danfeUrl?: string;
  qrcodeUrl?: string;
  rejeicao?: string;
  raw?: unknown;
};

/** Provedor fiscal (BaaS). Modular como PaymentProvider — hoje só Focus NFe. */
export interface FiscalProvider {
  readonly name: "FOCUS_NFE";
  /** Dispara a emissão da NFC-e (mod. 65). Retorna o estado inicial. */
  emitNFCe(input: FiscalEmitInput): Promise<FiscalResult>;
  /** Consulta o estado da nota por `ref` (usado por webhook + reconciliação). */
  getStatus(est: Establishment, ref: string): Promise<FiscalStatus>;
}

/** Erro de validação dos campos fiscais (campos do contador faltando). Não é
 *  erro do provedor — a nota nem chega a ser enviada à SEFAZ. */
export class FiscalValidationError extends Error {
  constructor(
    message: string,
    public missing: string[],
  ) {
    super(message);
    this.name = "FiscalValidationError";
  }
}

/** Erro de comunicação com o provedor fiscal. */
export class FiscalProviderError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Fiscal provider error ${status}: ${body}`);
    this.name = "FiscalProviderError";
  }
}
