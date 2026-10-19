// Classificação pura dos erros de cobrança (sem Prisma). Só um erro HTTP 4xx do
// gateway (Pagar.me / PagBank) prova que a cobrança NÃO aconteceu; 5xx, rede,
// timeout, parse ou qualquer outro erro é incerto (pode ter cobrado).
import { PagarmeError } from "./pagarme";
import { PagbankError } from "./pagbank";

export function isDefiniteGatewayFailure(e: unknown): boolean {
  if (!(e instanceof PagbankError) && !(e instanceof PagarmeError)) return false;
  return Number.isInteger(e.status) && e.status >= 400 && e.status < 500;
}
