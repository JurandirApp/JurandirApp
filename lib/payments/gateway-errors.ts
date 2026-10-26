// Classificação pura dos erros de cobrança (sem Prisma). Só um erro HTTP 4xx do
// gateway (Pagar.me / PagBank / Tuna) prova que a cobrança NÃO aconteceu; 5xx, rede,
// timeout, parse ou qualquer outro erro é incerto (pode ter cobrado).
import { PagarmeError } from "./pagarme";
import { PagbankError } from "./pagbank";
import { TunaError } from "./tuna";

export function isDefiniteGatewayFailure(e: unknown): boolean {
  if (!(e instanceof PagbankError) && !(e instanceof PagarmeError) && !(e instanceof TunaError)) return false;
  return Number.isInteger(e.status) && e.status >= 400 && e.status < 500;
}
