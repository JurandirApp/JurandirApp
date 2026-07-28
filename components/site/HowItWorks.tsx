import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { stepIcons } from "@/lib/data/landing";
import { Reveal } from "./Reveal";

export function HowItWorks() {
  const t = useTranslations("howItWorks");
  const steps = t.raw("steps") as { title: string; desc: string }[];
  return (
    <section className="mx-auto max-w-[1152px] px-6 py-16">
      <Reveal className="text-center">
        <p className="m-0 font-display text-sm font-bold uppercase tracking-[.2em] text-[#734319]">
          {t("eyebrow")}
        </p>
        <h2 className="mt-2 font-display text-5xl font-extrabold uppercase tracking-[-0.02em]">
          {t("heading")}
        </h2>
      </Reveal>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {steps.map((s, i) => (
          <Reveal key={s.title} delay={i * 0.08} className="h-full">
            <div className="relative h-full rounded-3xl bg-ink p-7 text-sand">
              <span className="absolute right-6 top-5 font-display text-6xl font-extrabold text-white/10">
                {i + 1}
              </span>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sun text-ink">
                <Icon name={stepIcons[i] ?? "check"} size={26} />
              </div>
              <h3 className="mt-5 font-display text-2xl font-bold text-white">
                {s.title}
              </h3>
              <p className="mt-2 leading-[1.6] text-sand/70">{s.desc}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
