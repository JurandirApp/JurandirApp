import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { buildZip } from "@/lib/print/zip";
import {
  AGENT_PS1,
  INICIAR_BAT,
  INSTALAR_BAT,
  DESINSTALAR_BAT,
} from "@/lib/print/agent-files";

const appBase = () =>
  (process.env.APP_BASE_URL ?? "https://jurandir.app.br").replace(/\/$/, "");

const LEIAME = `AGENTE DE IMPRESSAO JURANDIR

>>> JEITO FACIL (recomendado) <<<
1. Extraia TODOS os arquivos (botao direito no zip > Extrair Tudo).
2. De 2 cliques em "Instalar.bat".
3. Pronto! A impressora passa a funcionar SOZINHA:
   - inicia junto com o Windows
   - roda em segundo plano (sem janela aberta)
4. No painel, clique em "Imprimir teste" -> deve sair papel.

O token JA ESTA configurado (config.json). Nao precisa digitar nada.
Nao precisa instalar programa nenhum: usa o PowerShell que ja vem no Windows.

--- Outros arquivos ---
Iniciar.bat      : so testar agora, com a janela aberta (nao configura o auto-start).
Desinstalar.bat  : remove o auto-start e para o agente.

--- Se der problema ---
"Impressora nao encontrada": o nome no painel tem que ser IGUAL ao nome da
impressora no Windows (Painel de Controle > Dispositivos e Impressoras).
"Token invalido": baixe o agente de novo pelo painel.
Nada imprime: veja se a "Impressao automatica" esta ligada no painel.
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
    { name: "Instalar.bat", content: INSTALAR_BAT },
    { name: "Iniciar.bat", content: INICIAR_BAT },
    { name: "Desinstalar.bat", content: DESINSTALAR_BAT },
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
