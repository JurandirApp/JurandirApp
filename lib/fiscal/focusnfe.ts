import type { Establishment } from "@prisma/client";
import type {
  FiscalProvider,
  FiscalEmitInput,
  FiscalEmitItem,
  FiscalResult,
  FiscalStatus,
  FiscalStatusValue,
} from "./types";
import { FiscalProviderError } from "./types";

// Focus NFe (BaaS fiscal): a emissão é ASSÍNCRONA. `POST /v2/nfce?ref=<id>`
// devolve normalmente "processando_autorizacao"; o resultado final chega por
// webhook (preferido) ou polling do `GET /v2/nfce/<id>`. Auth = Basic
// base64(token:) — token por empresa (Establishment.focusToken) ou global
// (env FOCUS_NFE_TOKEN). Segredo backend-only.
//
// ⚠️ Os nomes de campo do payload/resposta seguem a doc v2 do Focus e devem ser
// confirmados contra o sandbox de homologação quando o token existir.

function baseUrl(est: Establishment): string {
  const override = process.env.FOCUS_NFE_BASE_URL;
  if (override) return override.replace(/\/$/, "");
  return est.fiscalEnv === "PRODUCAO"
    ? "https://api.focusnfe.com.br"
    : "https://homologacao.focusnfe.com.br";
}

function token(est: Establishment): string {
  return est.focusToken || process.env.FOCUS_NFE_TOKEN || "";
}

function authHeader(est: Establishment): string {
  return "Basic " + Buffer.from(`${token(est)}:`).toString("base64");
}

/** 2 casas, ponto decimal — como a SEFAZ/Focus esperam os valores. */
function money(n: number): string {
  return n.toFixed(2);
}

/** Item da nota no formato Focus v2 (NFC-e). CST (Normal) ou CSOSN (Simples)
 *  conforme o que o contador preencheu. */
function itemToFocus(it: FiscalEmitItem) {
  const base: Record<string, unknown> = {
    numero_item: String(it.numero),
    codigo_produto: it.codigo,
    descricao: it.descricao,
    cfop: it.cfop,
    unidade_comercial: it.unidade,
    quantidade_comercial: money(it.quantidade),
    valor_unitario_comercial: money(it.valorUnitario),
    valor_bruto: money(it.valorBruto),
    unidade_tributavel: it.unidade,
    quantidade_tributavel: money(it.quantidade),
    valor_unitario_tributavel: money(it.valorUnitario),
    codigo_ncm: it.ncm,
    icms_origem: it.origem,
  };
  if (it.cest) base.cest = it.cest;
  if (it.cClassTrib) base.codigo_classificacao_tributaria = it.cClassTrib;
  // Regime Normal usa CST; Simples usa CSOSN. Preenche o que veio.
  if (it.csosn) base.icms_situacao_tributaria = it.csosn;
  else if (it.cst) base.icms_situacao_tributaria = it.cst;
  return base;
}

function buildPayload(input: FiscalEmitInput) {
  const { est } = input;
  return {
    cnpj_emitente: (est.cnpj ?? "").replace(/\D/g, ""),
    data_emissao: input.emissaoISO,
    presenca_comprador: "1", // operação presencial
    modalidade_frete: "9", // sem frete
    local_destino: "1", // operação interna
    natureza_operacao: "Venda ao consumidor",
    ...(input.consumidor?.documento
      ? { cpf_destinatario: input.consumidor.documento.replace(/\D/g, "") }
      : {}),
    itens: input.itens.map(itemToFocus),
    formas_pagamento: [
      { forma_pagamento: input.pagamento.forma, valor_pagamento: money(input.pagamento.valor) },
    ],
  };
}

/** Mapeia o `status` do Focus para o nosso estado normalizado. */
function mapStatus(focusStatus: string | undefined): FiscalStatusValue {
  switch ((focusStatus ?? "").toLowerCase()) {
    case "autorizado":
      return "authorized";
    case "processando_autorizacao":
      return "processing";
    case "erro_autorizacao":
    case "denegado":
      return "rejected";
    default:
      return "processing";
  }
}

async function call(
  est: Establishment,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl(est)}${path}`, {
    method,
    headers: {
      Authorization: authHeader(est),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { _raw: text };
  }
  // 4xx (menos 422, que carrega o motivo da rejeição) = erro de comunicação.
  if (res.status >= 400 && res.status !== 422) {
    throw new FiscalProviderError(res.status, text.slice(0, 500));
  }
  return { status: res.status, json };
}

/** Normaliza a resposta do Focus (do POST ou do GET) para FiscalStatus. */
function toFiscalStatus(json: Record<string, unknown>): FiscalStatus {
  const s = json as Record<string, string | number | undefined>;
  const rejeicao =
    (s.mensagem_sefaz as string) ||
    (s.erros ? JSON.stringify(s.erros) : undefined) ||
    (s.status_sefaz as string);
  return {
    status: mapStatus(s.status as string),
    numero: s.numero != null ? Number(s.numero) : undefined,
    serie: s.serie != null ? Number(s.serie) : undefined,
    chave: (s.chave_nfe as string) || (s.chave as string) || undefined,
    protocolo: (s.numero_protocolo as string) || (s.protocolo as string) || undefined,
    xmlUrl: (s.caminho_xml_nota_fiscal as string) || undefined,
    danfeUrl: (s.caminho_danfe as string) || undefined,
    qrcodeUrl: (s.qrcode as string) || (s.qrcode_url as string) || undefined,
    rejeicao: mapStatus(s.status as string) === "rejected" ? rejeicao : undefined,
    raw: json,
  };
}

export const focusNfeProvider: FiscalProvider = {
  name: "FOCUS_NFE",

  async emitNFCe(input: FiscalEmitInput): Promise<FiscalResult> {
    const { status, json } = await call(
      input.est,
      "POST",
      `/v2/nfce?ref=${encodeURIComponent(input.ref)}`,
      buildPayload(input),
    );
    // 422 = SEFAZ rejeitou de cara; senão fica processando.
    const normalized = toFiscalStatus(json);
    return {
      ref: input.ref,
      status: status === 422 ? "rejected" : normalized.status,
      raw: json,
    };
  },

  async getStatus(est: Establishment, ref: string): Promise<FiscalStatus> {
    const { json } = await call(est, "GET", `/v2/nfce/${encodeURIComponent(ref)}`);
    return toFiscalStatus(json);
  },
};
