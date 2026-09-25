export type TicketData = {
  establishment: string;
  code: string;
  number: number;
  location: string;
  customer?: string;
  timeLabel: string;
  items: { qty: number; name: string; total: number; options?: string[] }[];
  subtotal: number;
  platformFee: number;
  serviceFee: number;
  total: number;
  note?: string;
};

/** Nomes das opções escolhidas a partir do snapshot `OrderItem.options`
 *  ([{group,name,priceDelta}]). Usado nas comandas e nas telas de pedido. */
export function optionLabels(options: unknown): string[] {
  if (!Array.isArray(options)) return [];
  return options
    .map((o) =>
      o && typeof o === "object" && "name" in o
        ? String((o as { name: unknown }).name ?? "").trim()
        : "",
    )
    .filter((s) => s.length > 0);
}

const ESC = 0x1b;
const GS = 0x1d;
const WIDTH = 48; // colunas (impressora 80mm)

/** Normaliza para ASCII puro (remove diacríticos e qualquer não-ASCII) — segurança de code page. */
function ascii(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x00-\x7f]/g, "");
}
function brl(v: number): string {
  return "R$ " + v.toFixed(2).replace(".", ",");
}
function row(left: string, right: string): string {
  const l = ascii(left);
  const r = ascii(right);
  const space = Math.max(1, WIDTH - l.length - r.length);
  return l + " ".repeat(space) + r;
}

class Builder {
  private bytes: number[] = [];
  raw(...b: number[]): this {
    this.bytes.push(...b);
    return this;
  }
  line(s = ""): this {
    for (const ch of ascii(s)) this.bytes.push(ch.charCodeAt(0) & 0xff);
    this.bytes.push(0x0a);
    return this;
  }
  /** QR Code nativo (GS ( k, modelo 2). `data` vai cru (URL da NFC-e) — sem
   *  passar por ascii(), o conteúdo tem que ser exato. */
  qrcode(data: string, moduleSize = 6): this {
    const bytes = Array.from(new TextEncoder().encode(data));
    // modelo 2
    this.raw(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    // tamanho do módulo (1-16)
    this.raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, moduleSize & 0xff);
    // correção de erro nível M
    this.raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);
    // armazena os dados
    const len = bytes.length + 3;
    this.raw(GS, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30, ...bytes);
    // imprime
    this.raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
    return this;
  }
  build(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

export function renderTicket(t: TicketData): Uint8Array {
  const b = new Builder();
  b.raw(ESC, 0x40); // init
  b.raw(ESC, 0x61, 0x01); // center
  b.raw(GS, 0x21, 0x11); // double size
  b.line(t.establishment);
  b.raw(GS, 0x21, 0x00); // normal
  b.line("COMANDA");
  b.raw(ESC, 0x61, 0x00); // left
  b.line("-".repeat(WIDTH));
  b.line("Pedido " + t.code + "  #" + t.number);
  b.line("Local: " + t.location + "   " + t.timeLabel);
  if (t.customer) b.line("Cliente: " + t.customer);
  b.line("-".repeat(WIDTH));
  for (const it of t.items) {
    b.line(row(it.qty + "x " + it.name, brl(it.total)));
    for (const o of it.options ?? []) b.line("   + " + o);
  }
  b.line("-".repeat(WIDTH));
  b.line(row("Subtotal", brl(t.subtotal)));
  b.line(row("Taxa Jurandir", brl(t.platformFee)));
  b.line(row("Taxa servico", brl(t.serviceFee)));
  b.raw(ESC, 0x45, 0x01); // bold on
  b.line(row("TOTAL", brl(t.total)));
  b.raw(ESC, 0x45, 0x00); // bold off
  if (t.note) {
    b.line("-".repeat(WIDTH));
    b.line("Obs: " + t.note);
  }
  b.raw(ESC, 0x64, 0x04); // feed 4
  b.raw(GS, 0x56, 0x00); // full cut
  return b.build();
}

/** Cupom fiscal (DANFE simplificado da NFC-e, 80mm). Impresso só depois da nota
 *  AUTORIZADA — carrega chave de acesso, protocolo e o QR Code de consulta. */
export type DanfeData = {
  establishment: string;
  cnpj?: string;
  address?: string;
  code: string; // pedido de origem
  timeLabel: string;
  items: { name: string; qty: number; unit: string; unitPrice: number; total: number }[];
  total: number;
  numero?: number;
  serie?: number;
  chave: string; // 44 dígitos
  protocolo?: string;
  qrData: string; // conteúdo do QR (URL de consulta da NFC-e)
  homologacao: boolean;
};

/** Chave de acesso em grupos de 4 (leitura humana). */
function chaveGrupos(chave: string): string {
  return (chave.match(/.{1,4}/g) ?? [chave]).join(" ");
}

export function renderDanfe(d: DanfeData): Uint8Array {
  const b = new Builder();
  b.raw(ESC, 0x40); // init
  b.raw(ESC, 0x61, 0x01); // center
  b.raw(GS, 0x21, 0x01); // double height
  b.line(d.establishment);
  b.raw(GS, 0x21, 0x00); // normal
  if (d.cnpj) b.line("CNPJ: " + d.cnpj);
  if (d.address) b.line(d.address);
  b.line("");
  b.line("DANFE NFC-e - Documento Auxiliar da");
  b.line("Nota Fiscal de Consumidor Eletronica");
  b.raw(ESC, 0x61, 0x00); // left
  b.line("-".repeat(WIDTH));
  b.line("Pedido " + d.code + "   " + d.timeLabel);
  b.line("-".repeat(WIDTH));
  b.line("ITEM               QTD x UN.        VALOR");
  for (const it of d.items) {
    b.line(it.name);
    b.line(row("  " + it.qty + " x " + brl(it.unitPrice), brl(it.total)));
  }
  b.line("-".repeat(WIDTH));
  b.line(row("QTD. TOTAL DE ITENS", String(d.items.length)));
  b.raw(ESC, 0x45, 0x01); // bold
  b.line(row("VALOR TOTAL", brl(d.total)));
  b.raw(ESC, 0x45, 0x00); // bold off
  b.line("-".repeat(WIDTH));
  b.raw(ESC, 0x61, 0x01); // center
  if (d.homologacao) {
    b.line("EMITIDA EM AMBIENTE DE HOMOLOGACAO");
    b.line("SEM VALOR FISCAL");
    b.line("");
  }
  b.line("Consulte pela Chave de Acesso em:");
  b.line("Chave de acesso");
  b.line(chaveGrupos(d.chave));
  if (d.protocolo) b.line("Protocolo: " + d.protocolo);
  if (d.numero) b.line("NFC-e no. " + d.numero + "  Serie " + (d.serie ?? ""));
  b.line("");
  b.qrcode(d.qrData);
  b.raw(ESC, 0x64, 0x04); // feed 4
  b.raw(GS, 0x56, 0x00); // full cut
  return b.build();
}

/** Comanda de PRODUÇÃO (cozinha/bar): itens em destaque, SEM nenhum valor.
 *  O cliente já pagou no app — a estação só precisa saber o que preparar. */
export type PrepTicketData = {
  establishment: string;
  station: string; // nome da estação/impressora (ex.: "COZINHA")
  code: string;
  number: number;
  location: string;
  customer?: string;
  timeLabel: string;
  items: { qty: number; name: string; options?: string[] }[];
  note?: string;
};

export function renderPrepTicket(t: PrepTicketData): Uint8Array {
  const b = new Builder();
  b.raw(ESC, 0x40); // init
  b.raw(ESC, 0x61, 0x01); // center
  b.raw(GS, 0x21, 0x11); // double size — nome da estação bem visível
  b.line(t.station);
  b.raw(GS, 0x21, 0x00); // normal
  b.line(t.establishment);
  b.raw(ESC, 0x61, 0x00); // left
  b.line("-".repeat(WIDTH));
  b.line("Pedido " + t.code + "  #" + t.number);
  b.line("Local: " + t.location + "   " + t.timeLabel);
  if (t.customer) b.line("Cliente: " + t.customer);
  b.line("-".repeat(WIDTH));
  // Itens com altura dobrada pra leitura rápida na produção. Sem preço.
  // Adicionais entram em altura normal, indentados sob o item.
  b.raw(GS, 0x21, 0x01); // double height
  for (const it of t.items) {
    b.line(it.qty + "x " + it.name);
    if (it.options && it.options.length) {
      b.raw(GS, 0x21, 0x00); // normal p/ os adicionais
      for (const o of it.options) b.line("   + " + o);
      b.raw(GS, 0x21, 0x01); // volta pra altura dobrada
    }
  }
  b.raw(GS, 0x21, 0x00); // normal
  if (t.note) {
    b.line("-".repeat(WIDTH));
    b.raw(ESC, 0x45, 0x01); // bold on
    b.line("OBS: " + t.note);
    b.raw(ESC, 0x45, 0x00); // bold off
  }
  b.line("-".repeat(WIDTH));
  b.raw(ESC, 0x64, 0x04); // feed 4
  b.raw(GS, 0x56, 0x00); // full cut
  return b.build();
}
