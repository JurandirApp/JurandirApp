import { authAdmin } from "@/lib/auth/bearer";
import { listDebitPayout } from "@/lib/db/admin";
import { periodRange } from "@/lib/domain/period";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

type Period = "hoje" | "7d" | "30d" | "tudo";

/**
 * GET /api/public/admin/debit-payout?period=hoje|7d|30d|tudo (ADMIN, Bearer):
 * débito Pagar.me pago a repassar (Pix) por bar. Espelha o server action
 * `listDebitPayoutAction` (mesma janela de datas + mesma agregação) pro app.
 * Resposta: { rows: Row[] }, Row = { establishmentId, nome, qtd, bruto, taxa, aRepassar }.
 */
export async function GET(req: Request): Promise<Response> {
  const s = await authAdmin(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });

  const raw = new URL(req.url).searchParams.get("period");
  const period: Period =
    raw === "7d" || raw === "30d" || raw === "tudo" || raw === "hoje" ? raw : "hoje";

  // Mesma janela de datas do listDebitPayoutAction (Brasília, dayStartHour=0).
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();
  let from: Date;
  let to: Date;
  if (period === "tudo") {
    from = new Date(0);
    to = new Date(now + DAY);
  } else if (period === "hoje") {
    ({ from, to } = periodRange({ kind: "hoje" }, 0, now));
  } else {
    const r = periodRange({ kind: "d7" }, 0, now);
    to = r.to;
    from = period === "7d" ? r.from : new Date(r.from.getTime() - 23 * DAY);
  }

  const rows = await listDebitPayout(from, to);
  return Response.json({ rows }, { headers: CORS });
}
