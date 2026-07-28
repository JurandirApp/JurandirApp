export type TicketData = {
  establishment: string;
  code: string;
  number: number;
  location: string;
  customer?: string;
  timeLabel: string;
  items: { qty: number; name: string; total: number }[];
  subtotal: number;
  platformFee: number;
  serviceFee: number;
  total: number;
  note?: string;
};

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
  for (const it of t.items) b.line(row(it.qty + "x " + it.name, brl(it.total)));
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
