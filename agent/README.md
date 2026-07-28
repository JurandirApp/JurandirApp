# Jurandir — Agente de impressão

Roda numa máquina sempre-ligada no estabelecimento. Requer **Node 18+**. Faz só conexões de
saída — nenhuma porta precisa ser aberta no roteador.

Suporta dois transportes (`PRINTER_TRANSPORT`):
- **`windows`** — impressora **USB/serial** instalada e compartilhada no Windows (ex.: **Epson TM-T20X**).
- **`network`** — impressora com **IP** na rede (ESC/POS porta 9100).

## Impressora USB no Windows (Epson TM-T20X) — recomendado pra esse caso

1. **Instale a impressora** no Windows. Para envio raw de ESC/POS, o driver **"Generic / Text Only"**
   apontando para a porta USB da impressora é o mais seguro (passa os bytes sem re-renderizar).
   O driver oficial da Epson também costuma funcionar; se a comanda sair embaralhada, troque para
   "Generic / Text Only".
2. **Compartilhe a impressora:** Painel de Controle → Dispositivos e Impressoras → clique com o botão
   direito na impressora → **Propriedades da impressora** → aba **Compartilhamento** → marque
   *"Compartilhar esta impressora"* → dê um nome simples e **sem espaços**, ex.: `POS`.
3. No `.env`: `PRINTER_TRANSPORT=windows` e `PRINTER_SHARE=POS`.
4. Rode o agente **na mesma máquina** onde a impressora está plugada.

O agente grava os bytes ESC/POS num arquivo temporário e faz `copy /b` para a impressora
compartilhada (`\\localhost\POS`), enviando raw — a comanda sai exatamente como o sistema formatou.

## Impressora de rede (IP)

No `.env`: `PRINTER_TRANSPORT=network`, `PRINTER_IP` e `PRINTER_PORT` (padrão 9100).

## Como rodar

1. Copie `.env.example` para `.env` e preencha:
   - `JURANDIR_API_URL`: URL do sistema (o deploy, ou `http://IP-do-servidor:3000` na rede local).
   - `PRINT_AGENT_TOKEN`: gere no admin (card do estabelecimento → **Gerar token**).
   - o transporte + os campos da impressora (acima).
2. Rode:
   ```
   node --env-file=.env jurandir-print-agent.mjs
   ```
3. No admin, ative **Impressão ativa** e clique **Imprimir teste** para validar.

O agente busca comandas pendentes a cada poucos segundos e imprime. Em caso de falha, o job é
retentado; após 5 falhas fica marcado como `FAILED` para diagnóstico.
