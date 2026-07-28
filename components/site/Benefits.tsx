import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { Reveal } from "./Reveal";

export function Benefits() {
  const t = useTranslations();
  const items = t.raw("benefits") as { title: string; desc: string }[];
  return (
    <section className="mx-auto max-w-[1152px] px-6 pb-6">
      <div className="grid gap-5 md:grid-cols-3">
        {items.map((b, i) => (
          <Reveal key={b.title} delay={i * 0.08} className="h-full">
            <Card variant="highlight" className="h-full rounded-28 p-6">
              <h3 className="m-0 font-display text-2xl font-bold">{b.title}</h3>
              <p className="mt-2 leading-[1.6] text-ink/65">{b.desc}</p>
            </Card>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
