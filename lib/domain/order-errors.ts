/** Erro de negócio na criação do pedido, com código estável pra API/app.
 *  `closed` = bar fechado agora (só quando ele TEM horário configurado).
 *  Fica fora de lib/db/orders pra rotas/testes não dependerem do módulo do banco. */
export class OrderError extends Error {
  constructor(public code: "closed") {
    super(code);
    this.name = "OrderError";
  }
}

export function isClosedError(e: unknown): boolean {
  return e instanceof OrderError && e.code === "closed";
}
