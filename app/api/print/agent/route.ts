import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { buildZip } from "@/lib/print/zip";
import { AGENT_PS1, INICIAR_BAT } from "@/lib/print/agent-files";

const appBase = () =>
  (process.env.APP_BASE_URL ?? "https://jurandir.app.br").replace(/\/$/, "");

const LEIAME = `AGENTE DE IMPRESSAO JURANDIR

1. Extraia TODOS os arquivos (botao direito no zip > Extrair Tudo).
2. De 2 cliques em "Iniciar.bat".
3. Abre uma janela preta escrito "Agente iniciado". Deixe aberta.
4. No painel, clique em "Imprimir teste" na impressora -> deve sair papel.

O token JA ESTA configurado (config.json). Nao precisa digitar nada.
Nao precisa instalar nada: usa o PowerShell que ja vem no Windows.

Pra subir sozinho quando o PC ligar: aperte Windows+R, digite  shell:startup
e arraste o Iniciar.bat pra dentro (botao direito > Criar atalhos aqui).

Se aparecer "Impressora nao encontrada": confira se o nome no painel e igual
ao nome da impressora no Windows (Painel de Controle > Dispositivos e Impressoras).
`;

/** Baixa o agente de impressão pronto (zip) com o token do estabelecimento já
 *  embutido no config.json — a pessoa só extrai e dá 2 cliques no Iniciar.bat. */
export async function GET(): Promise<Response> {
  const s = await getSession();
  if (s?.role !== "ESTABLISHMENT" || !s.establishmentId) {
    return new Response("unauthorized", { status: 401 });
  }
  const est = await prisma.establishment.findUnique({
    where: { id: s.establishmentId },
    select: { printAgentToken: true },
  });
  if (!est) return new Response("not found", { status: 404 });

  // Gera o token na hora se ainda não existir — o download sempre sai funcional.
  let token = est.printAgentToken;
  if (!token) {
    token = "jpa_" + randomBytes(24).toString("hex");
    await prisma.establishment.update({
      where: { id: s.establishmentId },
      data: { printAgentToken: token },
    });
  }

  const config = JSON.stringify({ url: appBase(), token, pollMs: 4000 }, null, 2) + "\n";
  const zip = buildZip([
    { name: "Iniciar.bat", content: INICIAR_BAT },
    { name: "agent.ps1", content: AGENT_PS1 },
    { name: "config.json", content: config },
    { name: "LEIA-ME.txt", content: LEIAME },
  ]);

  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="jurandir-impressora.zip"',
      "Cache-Control": "no-store",
    },
  });
}
