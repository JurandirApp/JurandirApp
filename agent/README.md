# Agente de Impressão Jurandir (Windows — SEM instalar nada)

Programa que roda **no PC do bar** e faz a ponte entre a nuvem (jurandir.app.br) e
as impressoras. Ele fica perguntando à nuvem se tem comanda nova e, quando tem,
imprime na impressora certa (Bar, Cozinha…). **As comandas de produção não mostram
valor** — o cliente já pagou no app.

> **Não precisa instalar nada.** Usa só o **PowerShell**, que já vem no Windows.
> Nada de Node, nada de download de programa. É só **copiar a pasta e dar 2 cliques**.

Sem ele rodando, **nada imprime**. Deixe-o sempre ligado.

---

## Passo 1 — As impressoras no Windows (uma vez)

Cada impressora térmica precisa estar instalada no Windows:
1. **Painel de Controle → Dispositivos e Impressoras.**
2. Clique com o botão direito em cada impressora → **Propriedades da impressora** →
   **Imprimir página de teste**. Se sair papel, está pronta.
3. **Anote o NOME EXATO** de cada uma (ex.: `POS-80`, `EPSON TM-T20`).

## Passo 2 — Cadastrar no painel (site)

**Painel do estabelecimento → Config → Impressão:**
1. **Gerar token** e copiar.
2. **Cadastrar cada impressora**: nome (ex.: "Cozinha"), conexão **USB**, **alvo** =
   o nome exato da impressora no Windows (passo 1.3), e as **categorias** do cardápio
   que vão pra ela. Marque uma como **padrão**.
3. **Ligar a impressão automática.**

## Passo 3 — Ligar o agente no PC do bar

1. **Copie esta pasta `agent`** pro PC do bar (pen drive, download, do jeito que for).
2. Faça uma cópia do `config.example.json` e renomeie pra **`config.json`**.
3. Abra o `config.json` no Bloco de Notas e **cole o token** que você gerou:
   ```json
   {
     "url": "https://jurandir.app.br",
     "token": "cole-o-token-aqui",
     "pollMs": 4000
   }
   ```
4. **Dê 2 cliques no `Iniciar.bat`.** Vai abrir uma janela preta escrito
   *"Agente de Impressao Jurandir iniciado"*. **Deixe essa janela aberta.**
5. No painel, clique em **Imprimir teste** numa impressora → deve sair papel.

### Ligar sozinho quando o PC liga (recomendado)

Pra não precisar clicar toda vez:
1. Tecla **Windows + R**, digite `shell:startup`, Enter (abre a pasta de Inicializar).
2. Arraste o **`Iniciar.bat`** pra dentro dela com o botão direito → **Criar atalhos aqui**.

Pronto — toda vez que o PC ligar, o agente sobe sozinho.

---

## Impressora de rede (se algum dia usar)

Também imprime em impressora **de rede** (ESC/POS, porta 9100): no painel, cadastre
com conexão **NETWORK** e **alvo = IP** dela. O agente é o mesmo.

## Problemas comuns

| A janela preta mostra… | O que fazer |
|---|---|
| `Token invalido (401)` | O token do `config.json` não bate com o do painel. Gere de novo. |
| `Impressora nao encontrada` | O **alvo** no painel não é o nome exato da impressora no Windows. |
| `sem conexao com a nuvem` | PC sem internet, ou a `url` no config está errada. |
| Nada imprime, sem erro | A **impressão automática** está desligada no painel, ou não há impressora ativa cadastrada. |
| Papel sai com caracteres estranhos | Impressora não é ESC/POS 80mm, ou tente instalá-la com o driver **"Generic / Text Only"**. |

Se `Iniciar.bat` fechar sozinho na hora, é porque falta o `config.json` — refaça o
passo 3.2.
