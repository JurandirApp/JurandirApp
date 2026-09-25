import type { Establishment } from "@prisma/client";
import type { FiscalProvider } from "./types";
import { focusNfeProvider } from "./focusnfe";

/** Provedor fiscal do estabelecimento. Hoje sempre Focus NFe; modular como
 *  getProvider() dos pagamentos, então trocar/rotear por estabelecimento depois
 *  é barato. */
export function getFiscalProvider(_est: Establishment): FiscalProvider {
  return focusNfeProvider;
}

export type {
  FiscalProvider,
  FiscalEmitInput,
  FiscalResult,
  FiscalStatus,
  FiscalStatusValue,
} from "./types";
export { FiscalValidationError, FiscalProviderError } from "./types";
export { buildNfceInput, emissaoISOAgora } from "./build-nfce";
export type { FiscalItemFields } from "./build-nfce";
