import { OrderStatus } from "@prisma/client";
import { cents } from "./pagbank";

export type ThreeDsOrderView = {
  status: OrderStatus;
  method: string | null;
  provider: string | null;
  hasGatewayCharge: boolean;
} | null;

/** Decide se o pedido pode abrir uma sessão 3DS (débito PagBank ainda não cobrado). */
export function decideThreeDsSession(
  o: ThreeDsOrderView,
  enabled: boolean,
): "ok" | "disabled" | "notfound" | "notChargeable" {
  if (!enabled) return "disabled";
  if (!o) return "notfound";
  const chargeable =
    o.status === OrderStatus.AWAITING_PAYMENT &&
    o.method === "DEBIT" &&
    o.provider === "PAGBANK" &&
    !o.hasGatewayCharge;
  return chargeable ? "ok" : "notChargeable";
}

/** Valor do 3DS em centavos — o MESMO cálculo da cobrança (o PagBank recusa se diferir). */
export const threeDsAmountCents = (total: number): number => cents(total);
