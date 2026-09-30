// Roteamento de pagamento: cada MÉTODO que o cliente escolhe no app tem o seu
// gateway configurado pelo estabelecimento. Módulo puro (sem Prisma) — é
// importado pelo painel (client), pelas actions e pelo adapter do app.

/** Métodos roteáveis. Apple Pay / Google Pay têm gateway PRÓPRIO (não seguem o crédito). */
export type RouteKey = "pix" | "credit" | "debit" | "applePay" | "googlePay";

export const ROUTE_KEYS: readonly RouteKey[] = ["pix", "credit", "debit", "applePay", "googlePay"];

export type Routing = Record<RouteKey, string>;

// Matriz de capacidade: qual gateway implementa qual método hoje. Escolhas fora
// da matriz (ou de um gateway não pronto) caem no fallback do método.
export const GATEWAY_CAP: Record<string, Record<RouteKey, boolean>> = {
  MERCADO_PAGO: { pix: true, credit: true, debit: true, applePay: false, googlePay: false },
  PAGARME: { pix: true, credit: true, debit: true, applePay: true, googlePay: true },
  ASAAS: { pix: true, credit: false, debit: false, applePay: false, googlePay: false },
  // Appmax não tem débito avulso; carteira ainda não implementada no provider.
  APPMAX: { pix: true, credit: true, debit: false, applePay: false, googlePay: false },
  // PagBank: débito exige 3DS (só SDK JS) e não entra no split → fora por ora.
  PAGBANK: { pix: true, credit: true, debit: false, applePay: true, googlePay: true },
  INFINITEPAY: { pix: false, credit: false, debit: false, applePay: false, googlePay: false },
};

/** Fallback quando a escolha é inválida: MP faz Pix/cartão; carteira só existe no Pagar.me. */
export const ROUTE_FALLBACK: Record<RouteKey, string> = {
  pix: "MERCADO_PAGO",
  credit: "MERCADO_PAGO",
  debit: "MERCADO_PAGO",
  applePay: "PAGARME",
  googlePay: "PAGARME",
};

/** Campos do estabelecimento que dizem se cada gateway está pronto pra cobrar. */
export type GatewayReadiness = {
  pagarmeRecipientId: string | null;
  asaasWalletId?: string | null;
  appmaxRecipientHash?: string | null;
};

/** Gateway pronto pra cobrar por este estabelecimento. MP e PagBank sempre (conta
 *  da plataforma como fallback, sem split); os demais exigem o recebedor do bar. */
export function isGatewayReady(est: GatewayReadiness, gateway: string): boolean {
  switch (gateway) {
    case "MERCADO_PAGO":
    case "PAGBANK":
      return true;
    case "PAGARME":
      return Boolean(est.pagarmeRecipientId);
    case "ASAAS":
      return Boolean(est.asaasWalletId);
    case "APPMAX":
      return Boolean(est.appmaxRecipientHash);
    default:
      return false;
  }
}

/** O gateway escolhido pro método pode de fato cobrar (implementa + está pronto)? */
export function canCharge(est: GatewayReadiness, key: RouteKey, gateway: string): boolean {
  return Boolean(GATEWAY_CAP[gateway]?.[key]) && isGatewayReady(est, gateway);
}
