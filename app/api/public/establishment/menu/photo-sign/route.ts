import { authEstablishment } from "@/lib/auth/bearer";
import { cloudinaryConfigured, signUpload } from "@/lib/cloudinary";

export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/** GET — assinatura p/ o app enviar a foto do item direto pra Cloudinary.
 *  O api_secret nunca sai do servidor: devolvemos só assinatura + timestamp
 *  (o app faz o POST do arquivo direto pra Cloudinary). */
export async function GET(req: Request): Promise<Response> {
  const s = await authEstablishment(req);
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  if (!cloudinaryConfigured()) {
    return Response.json({ error: "not_configured" }, { status: 503, headers: CORS });
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const signed = signUpload(`jurandir/menu/${s.establishmentId!}`, timestamp);
  return Response.json(signed, { headers: CORS });
}
