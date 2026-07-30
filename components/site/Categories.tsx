import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { categories } from "@/lib/data/landing";
import { Reveal } from "./Reveal";

// Fase 1 placeholder: menu/app links resolve to the client app (`/{slug}`) in Fase 4.
const MENU_HREF = "#mais-hypados";

// Sombra dura colorida rotativa — coral / oceano / sol (paleta do Jurandir).
const ACCENTS = ["#FF6B4A", "#0F7E84", "#FFC24B"];

export function Categories() {
  const t = useTranslations("categories");

  const circle = (c: (typeof categories)[number], key: string, i: number) => {
    const label = t(`items.${c.key}`);
    const accent = ACCENTS[i % ACCENTS.length];
    return (
      <a
        key={key}
        href={MENU_HREF}
        className="group mr-5 flex w-24 flex-shrink-0 flex-col items-center gap-3 text-ink"
      >
        <span className="relative block h-24 w-24">
          {/* Sombra dura COLORIDA (assinatura do Jurandir, com cor de praia) —
              "descola" um pouco mais no hover, como um sticker sendo levantado. */}
          <span
            aria-hidden
            className="absolute inset-0 translate-x-[5px] translate-y-[5px] rounded-full transition-transform duration-200 ease-out group-hover:translate-x-2 group-hover:translate-y-2"
            style={{ background: accent }}
          />
          {/* Foto com contorno de tinta grosso. */}
          <span
            className="relative block h-24 w-24 rounded-full border-[3px] border-ink bg-[#e2e8f0] bg-cover bg-center transition-transform duration-200 ease-out group-hover:-translate-x-0.5 group-hover:-translate-y-0.5"
            style={{ backgroundImage: `url("${c.img}")` }}
            role="img"
            aria-label={label}
          />
        </span>
        <span className="text-center text-sm font-bold transition-colors group-hover:text-coral-emph">
          {label}
        </span>
      </a>
    );
  };

  return (
    <section className="mx-auto max-w-[1152px] px-6 py-14">
      <Reveal className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full border-2 border-ink bg-sun shadow-hard">
            <Icon name="sunny" size={20} fill className="text-ink" />
          </span>
          <h2 className="m-0 font-display text-4xl font-extrabold uppercase tracking-[-0.02em]">
            {t("heading")}
          </h2>
        </div>
        <a
          href={MENU_HREF}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-full border-2 border-ink bg-white px-4 py-2 text-sm font-bold text-ink shadow-hard transition-transform duration-150 hover:-translate-y-0.5"
        >
          {t("viewMenu")}
          <Icon name="arrow_forward" size={15} className="text-coral-emph" />
        </a>
      </Reveal>

      {/* Mobile: carrossel que passa sozinho (todos os itens levam ao mesmo
          destino, então o movimento não atrapalha o toque). Track duplicado → o
          translate de -50% dá o loop contínuo. `reverse` faz andar pra DIREITA —
          sentido contrário ao marquee do hero. Pausa no hover/toque; respeita
          "reduzir movimento". */}
      <div className="mt-8 overflow-hidden md:hidden">
        <div className="flex w-max animate-marquee pb-2 [animation-direction:reverse] hover:[animation-play-state:paused] active:[animation-play-state:paused] motion-reduce:animate-none">
          {[...categories, ...categories].map((c, i) => circle(c, `${c.key}-${i}`, i))}
        </div>
      </div>

      {/* Desktop: fila estática (os 9 cabem na largura). */}
      <Reveal
        delay={0.06}
        className="no-scrollbar mt-8 hidden overflow-x-auto pb-3 md:flex"
      >
        {categories.map((c, i) => circle(c, c.key, i))}
      </Reveal>
    </section>
  );
}
