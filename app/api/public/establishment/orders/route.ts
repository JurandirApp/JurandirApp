import { verifySession, type SessionPayload } from "@/lib/auth/jwt";
import { listPanelOrders } from "@/lib/db/panel";
import { deliverOrder } from "@/lib/db/orders";
import { toPanelOrder } from "@/lib/panel/adapters";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/** Autentica pelo Bearer token do app. Só ESTABLISHMENT com estabelecimento. */
async function auth(req: Request): Promise<SessionPayload | null> {
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  const s = await verifySession(token);
  if (!s || s.role !== "ESTABLISHMENT" || !s.establishmentId) return null;
  return s;
}

/** GET /api/public/establishment/orders — pedidos reais do estabelecimento logado. */
export async function GET(req: Request): Promise<Response> {
  const s = await auth(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  const rows = await listPanelOrders(s.establishmentId!);
  return Response.json({ orders: rows.map(toPanelOrder) }, { headers: CORS });
}

/** POST /api/public/establishment/orders  { orderId } — marca como entregue. */
export async function POST(req: Request): Promise<Response> {
  const s = await auth(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid" }, { status: 400, headers: CORS });
  }
  const orderId = typeof (body as { orderId?: unknown })?.orderId === "string"
    ? (body as { orderId: string }).orderId
    : "";
  if (!orderId) return Response.json({ error: "invalid" }, { status: 422, headers: CORS });

  const o = await prisma.order.findUnique({
    where: { id: orderId },
    select: { establishmentId: true },
  });
  if (!o || o.establishmentId !== s.establishmentId) {
    return Response.json({ error: "forbidden" }, { status: 403, headers: CORS });
  }
  await deliverOrder(orderId);
  return Response.json({ ok: true }, { headers: CORS });
}
