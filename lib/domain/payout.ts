export type DebitGateway = "PAGARME" | "PAGBANK";

export type DebitPayoutInput = {
  provider: DebitGateway;
  establishmentId: string;
  nome: string;
  total: number;
  platformFee: number;
  splitToEstablishment: number | null;
};

export type DebitPayoutRow = {
  establishmentId: string;
  nome: string;
  gateway: DebitGateway;
  qtd: number;
  bruto: number;
  taxa: number;
  aRepassar: number;
};

/** Agrupa débitos pagos por (bar, gateway): o dinheiro está na conta de cada gateway. */
export function aggregateDebitPayout(rows: DebitPayoutInput[]): DebitPayoutRow[] {
  const map = new Map<string, DebitPayoutRow>();
  for (const r of rows) {
    const key = `${r.establishmentId}|${r.provider}`;
    const cur = map.get(key) ?? {
      establishmentId: r.establishmentId,
      nome: r.nome,
      gateway: r.provider,
      qtd: 0,
      bruto: 0,
      taxa: 0,
      aRepassar: 0,
    };
    cur.qtd += 1;
    cur.bruto += r.total;
    cur.taxa += r.platformFee;
    cur.aRepassar += r.splitToEstablishment ?? r.total - r.platformFee;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.aRepassar - a.aRepassar);
}
