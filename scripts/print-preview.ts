import { renderTicket } from "@/lib/print/escpos";

/** Remove os comandos ESC/POS, deixando só o texto legível (preview sem impressora). */
function toPreview(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c === 0x1b) {
      i += b[i + 1] === 0x40 ? 1 : 2; // ESC @ = +1; ESC a/E/d n = +2
      continue;
    }
    if (c === 0x1d) {
      i += 2; // GS ! n / GS V n
      continue;
    }
    if (c === 0x0a) {
      s += "\n";
      continue;
    }
    s += String.fromCharCode(c);
  }
  return s;
}

const bytes = renderTicket({
  establishment: "Quiosque do Mar",
  code: "PED-E93F2A10",
  number: 128,
  location: "Guarda-sol nº 14",
  customer: "Rômulo",
  timeLabel: "14:32",
  items: [
    { qty: 2, name: "Água de coco", total: 16 },
    { qty: 1, name: "Porção de camarão", total: 48 },
    { qty: 3, name: "Caipirinha", total: 45 },
  ],
  subtotal: 109,
  platformFee: 8.72,
  serviceFee: 10.9,
  total: 128.62,
  note: "Camarão sem pimenta",
});

console.log(toPreview(bytes));
console.log(`(${bytes.length} bytes ESC/POS)`);
