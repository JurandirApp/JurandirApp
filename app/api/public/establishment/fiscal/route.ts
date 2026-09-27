import { authEstablishment } from "@/lib/auth/bearer";
import { prisma } from "@/lib/db/prisma";
import { emitFiscalForOrder } from "@/lib/db/fiscal";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/** GET — estado fiscal do estabelecimento pro app: modo/ambiente + as últimas
 *  notas (pedidos pagos + status da nota). A CONFIG (certificado/CSC/token) fica
 *  só no painel web; aqui o app só opera (ver/emitir). */
export async function GET(req: Request): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });

  const est = await prisma.establishment.findUnique({
    where: { id: s.establishmentId! },
    select: { fiscalMode: true, fiscalEnv: true },
  });
  const orders = await prisma.order.findMany({
    where: {
      establishmentId: s.establishmentId!,
      status: { in: ["IN_PRODUCTION", "DELIVERED"] },
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      id: true,
      code: true,
      total: true,
      createdAt: true,
      fiscalDocument: {
        select: { status: true, numero: true, chave: true, danfeUrl: true, rejeicao: true },
      },
    },
  });

  const rows = orders.map((o) => ({
    orderId: o.id,
    orderCode: o.code,
    total: Number(o.total),
    createdAt: o.createdAt.toISOString(),
    status: o.fiscalDocument?.status ?? null,
    numero: o.fiscalDocument?.numero ?? null,
    chave: o.fiscalDocument?.chave ?? null,
    danfeUrl: o.fiscalDocument?.danfeUrl ?? null,
    rejeicao: o.fiscalDocument?.rejeicao ?? null,
  }));

  return Response.json(
    { mode: est?.fiscalMode ?? "OFF", env: est?.fiscalEnv ?? "HOMOLOGACAO", rows },
    { headers: CORS },
  );
}

/** POST { orderId } — emite/reemite a nota de um pedido manualmente. Escopo pelo
 *  token (o pedido tem que ser do estabelecimento logado). */
export async function POST(req: Request): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });

  let body: { orderId?: string };
  try {
    body = (await req.json()) as { orderId?: string };
  } catch {
    return Response.json({ error: "invalid" }, { status: 400, headers: CORS });
  }
  const orderId = (body.orderId ?? "").trim();
  if (!orderId) return Response.json({ error: "invalid" }, { status: 422, headers: CORS });

  const order = await prisma.order.findFirst({
    where: { id: orderId, establishmentId: s.establishmentId! },
    select: { id: true },
  });
  if (!order) return Response.json({ error: "not found" }, { status: 404, headers: CORS });

  const r = await emitFiscalForOrder(orderId, { manual: true });
  return Response.json(r, { headers: CORS });
}
