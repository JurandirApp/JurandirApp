// Formulário de cartão do site (Tuna): máscara e validação no navegador. Módulo
// puro — o número/CVV nunca saem daqui pro nosso servidor (vão direto pra Tuna).

export const onlyDigits = (v: string): string => v.replace(/\D/g, "");

/** Número do cartão em grupos de 4 (Amex: 4-6-5), até 19 dígitos. */
export function formatCardNumber(v: string): string {
  const d = onlyDigits(v).slice(0, 19);
  if (/^3[47]/.test(d)) {
    return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(" ");
  }
  return d.replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** Dígito verificador (Luhn) e tamanho 13–19. */
export function luhnOk(v: string): boolean {
  const d = onlyDigits(v);
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

/** Validade digitada como MM/AA. */
export function formatExpiry(v: string): string {
  const d = onlyDigits(v).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

/** MM/AA → { month "MM", year "AAAA" } se for um mês válido e não vencido
 *  (o cartão vale até o fim do mês); senão null. */
export function parseExpiry(v: string, now: Date = new Date()): { month: string; year: string } | null {
  const d = onlyDigits(v);
  if (d.length !== 4) return null;
  const month = Number(d.slice(0, 2));
  const year = 2000 + Number(d.slice(2));
  if (month < 1 || month > 12) return null;
  const nowKey = now.getFullYear() * 12 + now.getMonth();
  const key = year * 12 + (month - 1);
  if (key < nowKey || year > now.getFullYear() + 20) return null;
  return { month: String(month).padStart(2, "0"), year: String(year) };
}

/** CVV: 3 dígitos (Amex: 4). */
export function cvvOk(cvv: string, cardNumber: string): boolean {
  const d = onlyDigits(cvv);
  return /^3[47]/.test(onlyDigits(cardNumber)) ? d.length === 4 : d.length === 3;
}

/** CPF com máscara 000.000.000-00. */
export function formatCpf(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

/** CPF válido: 11 dígitos, não todos iguais, os 2 dígitos verificadores batem. */
export function isValidCpf(v: string): boolean {
  const d = onlyDigits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const check = (len: number): number => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return check(9) === Number(d[9]) && check(10) === Number(d[10]);
}

/** Nome do titular: ao menos 2 letras, sem dígitos. */
export function holderOk(v: string): boolean {
  const s = v.trim();
  return s.replace(/[^\p{L}]/gu, "").length >= 2 && !/\d/.test(s);
}

export type CardField = "number" | "holder" | "expiry" | "cvv" | "cpf";

/** Erros por campo do formulário (vazio = tudo certo). */
export function cardFormErrors(
  f: { number: string; holder: string; expiry: string; cvv: string; cpf: string },
  now: Date = new Date(),
): Partial<Record<CardField, true>> {
  const e: Partial<Record<CardField, true>> = {};
  if (!luhnOk(f.number)) e.number = true;
  if (!holderOk(f.holder)) e.holder = true;
  if (!parseExpiry(f.expiry, now)) e.expiry = true;
  if (!cvvOk(f.cvv, f.number)) e.cvv = true;
  if (!isValidCpf(f.cpf)) e.cpf = true;
  return e;
}
