"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { Icon } from "@/components/ui/Icon";

type Callout = { kind: "tip" | "warn" | "ok"; text: string };
type Step = { title: string; items: string[]; callouts?: Callout[] };
type Trouble = { q: string; a: string };
type Guide = {
  openLabel: string;
  title: string;
  subtitle: string;
  closeLabel: string;
  stepsLabel: string;
  steps: Step[];
  optional: Step;
  optionalTag: string;
  troubleTitle: string;
  troubleHint: string;
  troubles: Trouble[];
  footer: string;
};

const PT: Guide = {
  openLabel: "Ver tutorial de instalação",
  title: "Como ligar a impressora",
  subtitle: "Faça na ordem, sem pressa. Se travar, veja o “Deu ruim?” no final.",
  closeLabel: "Fechar",
  stepsLabel: "Passo",
  steps: [
    {
      title: "Ligar a impressora",
      items: [
        "Coloque a **bobina de papel** e feche a tampa.",
        "Ligue o **cabo de energia** e aperte o botão de **liga/desliga**.",
        "Ligue o **cabo USB** da impressora numa entrada USB do computador.",
      ],
      callouts: [{ kind: "ok", text: "Deu certo quando a luz da impressora acende." }],
    },
    {
      title: "Deixar o Windows reconhecer a impressora",
      items: [
        "Espere uns segundos — o Windows costuma instalar sozinho.",
        "Se veio um CD, pen drive ou site do fabricante com o programa dela (o “driver”), instale.",
        "Clique em **Iniciar** e digite `impressoras`. Abra **Impressoras e scanners**.",
        "Ache a impressora e clique em **Imprimir página de teste**. Saiu papel? Está pronta.",
      ],
      callouts: [
        {
          kind: "warn",
          text: "**Anote o nome EXATO** da impressora, como aparece na lista (ex.: `POS-80`). Vamos usar ele já já — copie certinho.",
        },
      ],
    },
    {
      title: "Cadastrar a impressora no painel",
      items: [
        "Aqui no painel, entre em **Config → Integração com impressora**.",
        "Clique em **Adicionar impressora** e preencha: **Nome** (ex.: Cozinha), **Conexão** = USB (Windows), **Nome da impressora no Windows** (o que você anotou), as **Categorias** que ela imprime, e marque uma como **padrão**. Salve.",
        "Deixe a chavinha **Impressão automática** ligada.",
      ],
      callouts: [{ kind: "tip", text: "Tem Bar e Cozinha? Repita o “Adicionar impressora” pra cada uma." }],
    },
    {
      title: "Baixar o programa da impressora",
      items: [
        "Em **Config → Impressão**, clique no botão **Baixar agente de impressão**.",
        "Vai baixar o arquivo `jurandir-impressora.zip` (fica na pasta **Downloads**).",
      ],
      callouts: [
        {
          kind: "tip",
          text: "Baixe **direto no computador do bar**. O programa já vem com a senha por dentro — você não digita nada.",
        },
      ],
    },
    {
      title: "Abrir o programa no computador do bar",
      items: [
        "Na pasta **Downloads**, clique no zip com o **botão direito** → **Extrair Tudo** → **Extrair**.",
        "Abra a pasta que apareceu e dê **2 cliques** em `Iniciar.bat`.",
        "Abre uma **janelinha preta** escrito **Agente iniciado**. **Deixe ela aberta** (pode minimizar).",
      ],
      callouts: [
        { kind: "warn", text: "**Extraia primeiro** — não dê 2 cliques no arquivo de dentro do zip." },
        {
          kind: "tip",
          text: "Se aparecer **“O Windows protegeu seu computador”**: clique em **Mais informações** → **Executar assim mesmo**. Pode confiar, é o nosso programa.",
        },
      ],
    },
    {
      title: "Testar",
      items: [
        "Volte no painel → **Config → Impressão**.",
        "Na impressora que você cadastrou, clique no **ícone de impressora** (o botão de teste).",
        "Deve **sair um papel de teste** na impressora.",
      ],
      callouts: [
        {
          kind: "ok",
          text: "Saiu papel? **Está funcionando!** A partir de agora, todo pedido pago sai sozinho na impressora certa.",
        },
      ],
    },
  ],
  optional: {
    title: "Fazer o programa abrir sozinho quando liga o PC",
    items: [
      "Aperte as teclas `Windows` + `R` ao mesmo tempo.",
      "Digite `shell:startup` e aperte **Enter** (abre a pasta “Inicializar”).",
      "Arraste o `Iniciar.bat` pra dentro dela com o **botão direito** → **Criar atalhos aqui**.",
    ],
    callouts: [{ kind: "ok", text: "Agora sobe sozinho quando o PC liga. Nunca mais precisa mexer." }],
  },
  optionalTag: "Opcional",
  troubleTitle: "Deu ruim?",
  troubleHint: "Olhe o que apareceu na janelinha preta e ache aqui embaixo.",
  troubles: [
    {
      q: "“Impressora nao encontrada”",
      a: "O nome no painel está diferente do nome no Windows. Confira o nome exato (Passo 2) e corrija no cadastro do painel (Passo 3).",
    },
    { q: "“Token invalido (401)”", a: "Baixe o programa de novo pelo botão do painel (Passo 4) e use a pasta nova." },
    { q: "“sem conexao com a nuvem”", a: "O computador está sem internet. Confira o Wi-Fi ou o cabo de rede." },
    {
      q: "Não sai nada, e não aparece erro",
      a: "Veja se a “Impressão automática” está ligada no painel, e se a janelinha preta está aberta. Se fechou, é só abrir o Iniciar.bat de novo.",
    },
    {
      q: "Sai papel com símbolos estranhos",
      a: "A impressora pode não ser térmica 80mm, ou precisa trocar o driver dela pra “Generic / Text Only” no Windows. Se acontecer, me chame.",
    },
  ],
  footer: "Travou em alguma parte? Tira uma foto da tela e me manda.",
};

const EN: Guide = {
  openLabel: "See setup tutorial",
  title: "Setting up the printer",
  subtitle: "Do it in order, no rush. If you get stuck, check “Something wrong?” at the end.",
  closeLabel: "Close",
  stepsLabel: "Step",
  steps: [
    {
      title: "Turn the printer on",
      items: [
        "Load the **paper roll** and close the lid.",
        "Plug in the **power cable** and press the **power button**.",
        "Plug the printer's **USB cable** into a USB port on the computer.",
      ],
      callouts: [{ kind: "ok", text: "It worked when the printer's light turns on." }],
    },
    {
      title: "Let Windows detect the printer",
      items: [
        "Wait a few seconds — Windows usually installs it automatically.",
        "If it came with a CD, USB stick or a manufacturer's website with its software (the “driver”), install it.",
        "Click **Start** and type `printers`. Open **Printers & scanners**.",
        "Find the printer and click **Print test page**. Paper came out? It's ready.",
      ],
      callouts: [
        {
          kind: "warn",
          text: "**Write down the EXACT name** of the printer as shown in the list (e.g. `POS-80`). We'll use it in a moment — copy it precisely.",
        },
      ],
    },
    {
      title: "Register the printer in the panel",
      items: [
        "Here in the panel, go to **Settings → Printer integration**.",
        "Click **Add printer** and fill in: **Name** (e.g. Kitchen), **Connection** = USB (Windows), **Printer name in Windows** (the one you wrote down), the **Categories** it prints, and mark one as **default**. Save.",
        "Leave the **Automatic printing** switch on.",
      ],
      callouts: [{ kind: "tip", text: "Have a Bar and a Kitchen? Repeat “Add printer” for each one." }],
    },
    {
      title: "Download the printer program",
      items: [
        "In **Settings → Printing**, click the **Download printer agent** button.",
        "It downloads a file called `jurandir-impressora.zip` (in your **Downloads** folder).",
      ],
      callouts: [
        {
          kind: "tip",
          text: "Download it **right on the bar's computer**. The program already has the password inside — you don't type anything.",
        },
      ],
    },
    {
      title: "Open the program on the bar's computer",
      items: [
        "In **Downloads**, right-click the zip → **Extract All** → **Extract**.",
        "Open the folder that appears and **double-click** `Iniciar.bat`.",
        "A **small black window** opens saying **Agente iniciado**. **Leave it open** (you can minimize it).",
      ],
      callouts: [
        { kind: "warn", text: "**Extract first** — don't double-click the file from inside the zip." },
        {
          kind: "tip",
          text: "If Windows shows **“Windows protected your PC”**: click **More info** → **Run anyway**. It's safe, it's our program.",
        },
      ],
    },
    {
      title: "Test it",
      items: [
        "Back in the panel → **Settings → Printing**.",
        "On the printer you registered, click the **printer icon** (the test button).",
        "A **test page should print** on the printer.",
      ],
      callouts: [
        {
          kind: "ok",
          text: "Paper came out? **It's working!** From now on, every paid order prints on its own to the right printer.",
        },
      ],
    },
  ],
  optional: {
    title: "Make the program start on its own when the PC boots",
    items: [
      "Press `Windows` + `R` at the same time.",
      "Type `shell:startup` and press **Enter** (opens the “Startup” folder).",
      "Drag `Iniciar.bat` into it with the **right button** → **Create shortcuts here**.",
    ],
    callouts: [{ kind: "ok", text: "Now it starts on its own when the PC boots. You never touch it again." }],
  },
  optionalTag: "Optional",
  troubleTitle: "Something wrong?",
  troubleHint: "Look at what the small black window shows and find it below.",
  troubles: [
    {
      q: "“Impressora nao encontrada” (printer not found)",
      a: "The name in the panel is different from the name in Windows. Check the exact name (Step 2) and fix it in the panel (Step 3).",
    },
    { q: "“Token invalido (401)”", a: "Download the program again with the panel button (Step 4) and use the new folder." },
    { q: "“sem conexao com a nuvem” (no connection)", a: "The computer has no internet. Check the Wi-Fi or network cable." },
    {
      q: "Nothing prints, and no error shows",
      a: "Check that “Automatic printing” is on in the panel, and that the small black window is open. If it closed, just open Iniciar.bat again.",
    },
    {
      q: "Paper comes out with strange symbols",
      a: "The printer may not be an 80mm thermal one, or its driver needs to be changed to “Generic / Text Only” in Windows. If that happens, call me.",
    },
  ],
  footer: "Stuck somewhere? Take a photo of the screen and send it to me.",
};

/** Renderiza texto com **negrito** e `código` inline. */
function Rich({ text }: { text: string }): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) {
          return (
            <b key={i} className="font-bold text-ink/90">
              {p.slice(2, -2)}
            </b>
          );
        }
        if (p.startsWith("`") && p.endsWith("`")) {
          return (
            <code
              key={i}
              className="rounded border border-ink/10 bg-dune-50 px-1.5 py-0.5 text-[0.85em] font-semibold"
            >
              {p.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

const CALLOUT: Record<Callout["kind"], { icon: string; bg: string; fg: string; border: string }> = {
  tip: { icon: "lightbulb", bg: "#eef7ff", fg: "#0a5b7a", border: "#bfe0f0" },
  warn: { icon: "warning", bg: "#fdf3e0", fg: "#92400e", border: "#f0cf94" },
  ok: { icon: "check_circle", bg: "#ecfdf5", fg: "#059669", border: "#a7f3d0" },
};

function CalloutBox({ c }: { c: Callout }) {
  const s = CALLOUT[c.kind];
  return (
    <div
      className="mt-2 flex gap-2 rounded-xl border p-2.5 text-[13px] leading-relaxed"
      style={{ backgroundColor: s.bg, borderColor: s.border, color: s.fg }}
    >
      <Icon name={s.icon} size={16} className="mt-px flex-none" />
      <span>
        <Rich text={c.text} />
      </span>
    </div>
  );
}

function StepBlock({ n, step, tag }: { n: string; step: Step; tag?: string }) {
  return (
    <div className="grid grid-cols-[28px_1fr] gap-3">
      <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-ocean-700 text-[13px] font-extrabold text-white">
        {n}
      </div>
      <div>
        <h4 className="m-0 flex items-center gap-2 font-display text-[15px] font-bold text-ink">
          {step.title}
          {tag && (
            <span className="rounded-full bg-dune-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink/45">
              {tag}
            </span>
          )}
        </h4>
        <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0 text-[13.5px] leading-relaxed text-ink/75">
          {step.items.map((it, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-coral" />
              <span>
                <Rich text={it} />
              </span>
            </li>
          ))}
        </ul>
        {step.callouts?.map((c, i) => <CalloutBox key={i} c={c} />)}
      </div>
    </div>
  );
}

/** Botão + modal com o tutorial de instalação da impressora (nativo do painel). */
export function PrinterSetupGuide() {
  const locale = useLocale();
  const g = locale === "en" ? EN : PT;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-dune-50 p-2.5 text-xs font-semibold text-ink/70"
      >
        <Icon name="menu_book" size={15} />
        {g.openLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-2xl bg-white sm:max-h-[88vh] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-ink/10 px-5 py-4">
              <div>
                <h3 className="m-0 flex items-center gap-2 font-display text-lg font-extrabold tracking-[-0.01em]">
                  <Icon name="print" size={18} className="text-ocean-700" />
                  {g.title}
                </h3>
                <p className="m-0 mt-0.5 text-[12.5px] text-ink/55">{g.subtitle}</p>
              </div>
              <button
                type="button"
                aria-label={g.closeLabel}
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-transparent text-ink/40"
              >
                <Icon name="close" size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5">
              {g.steps.map((step, i) => (
                <StepBlock key={i} n={String(i + 1)} step={step} />
              ))}
              <StepBlock n="+" step={g.optional} tag={g.optionalTag} />

              <div className="border-t border-ink/10 pt-4">
                <h4 className="m-0 font-display text-base font-extrabold">{g.troubleTitle}</h4>
                <p className="m-0 mb-3 mt-0.5 text-[12.5px] text-ink/55">{g.troubleHint}</p>
                <div className="flex flex-col gap-2">
                  {g.troubles.map((tb, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-ink/10 border-l-[3px] border-l-coral bg-white p-3"
                    >
                      <p className="m-0 text-[13.5px] font-bold text-ink/90">{tb.q}</p>
                      <p className="m-0 mt-1 text-[13px] leading-relaxed text-ink/60">{tb.a}</p>
                    </div>
                  ))}
                </div>
              </div>

              <p className="m-0 rounded-xl bg-dune-50 p-3 text-center text-[13px] font-semibold text-ink/60">
                {g.footer}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
