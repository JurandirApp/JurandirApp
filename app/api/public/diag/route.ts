export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * GET /api/public/diag?ev=...&... — diagnóstico do app (sem dados pessoais).
 * Usado pela rede de segurança do crash de abertura no iOS 27 (SynchronizeShim no
 * AppDelegate): quando ela dispara, o app manda a classe que chamou `synchronize`
 * + a pilha. Só registra no log da Vercel — buscar por "[diag]" nos Runtime Logs.
 */
export async function GET(req: Request): Promise<Response> {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  // corta valores longos pra não poluir o log
  for (const k of Object.keys(params)) params[k] = String(params[k]).slice(0, 2000);
  console.log("[diag]", JSON.stringify(params));
  return new Response(null, { status: 204, headers: CORS });
}
