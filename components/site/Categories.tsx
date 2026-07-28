import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { categories } from "@/lib/data/landing";
import { Reveal } from "./Reveal";

// Fase 1 placeholder: menu/app links resolve to the client app (`/{slug}`) in Fase 4.
const MENU_HREF = "#mais-hypados";

export function Categories() {
  const t = useTranslations("categories");

  const circle = (c: (typeof categories)[number], key: string) => {
    const label = t(`items.${c.key}`);
    return (
      <a
        key={key}
        href={MENU_HREF}
        className="mr-4 flex w-24 flex-shrink-0 flex-col items-center gap-2.5 text-ink"
      >
        <span
          className="block h-24 w-24 rounded-full border-[3px] border-white bg-[#e2e8f0] bg-cover bg-center shadow-float"
          style={{ backgroundImage: `url("${c.img}")` }}
          role="img"
          aria-label={label}
        />
        <span className="text-center text-sm font-semibold">{label}</span>
      </a>
    );
  };

  return (
    <section className="mx-auto max-w-[1152px] px-6 py-14">
      <Reveal className="flex items-end justify-between gap-4">
        <h2 className="m-0 font-display text-4xl font-extrabold uppercase tracking-[-0.02em]">
          {t("heading")}
        </h2>
        <a
          href={MENU_HREF}
          className="flex flex-shrink-0 items-center gap-1 text-sm font-bold text-coral-emph"
        >
          {t("viewMenu")}
          <Icon name="arrow_forward" size={15} />
        </a>
      </Reveal>

      {/* Mobile: carrossel que passa sozinho (todos os itens levam ao mesmo
          destino, então o movimento não atrapalha o toque). Track duplicado → o
          translate de -50% dá o loop contínuo. `reverse` faz andar pra DIREITA —
          sentido contrário ao marquee do hero (que anda pra esquerda), pra
          diferenciar. Pausa no hover/toque; respeita "reduzir movimento". */}
      <div className="mt-6 overflow-hidden md:hidden">
        <div className="flex w-max animate-marquee pb-1 [animation-direction:reverse] hover:[animation-play-state:paused] active:[animation-play-state:paused] motion-reduce:animate-none">
          {[...categories, ...categories].map((c, i) => circle(c, `${c.key}-${i}`))}
        </div>
      </div>

      {/* Desktop: fila estática (os 9 cabem na largura). */}
      <Reveal
        delay={0.06}
        className="no-scrollbar mt-6 hidden overflow-x-auto pb-3 md:flex"
      >
        {categories.map((c) => circle(c, c.key))}
      </Reveal>
    </section>
  );
}
