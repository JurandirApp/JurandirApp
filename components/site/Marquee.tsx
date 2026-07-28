import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

type MarqueeProps = {
  /** Show the `waves` glyph between words (landing) or not (login). */
  withIcon?: boolean;
  /** Full top+bottom border (landing) or top only (login). */
  border?: "y" | "top";
  /** Word size: lg (landing) or base (login). */
  size?: "lg" | "base";
};

/** Infinite coral marquee. Used at the bottom of the hero and the login screen. */
export function Marquee({
  withIcon = true,
  border = "y",
  size = "lg",
}: MarqueeProps) {
  const t = useTranslations();
  const base = t.raw("marquee") as string[];
  // Duplicated so the -50% translate loops seamlessly.
  const words = [...base, ...base];
  return (
    <div
      className={cn(
        "overflow-hidden bg-coral py-2.5",
        border === "y" ? "border-y-4 border-ink" : "border-t-4 border-ink",
      )}
    >
      <div className="flex w-max animate-marquee">
        {words.map((w, i) => (
          <span key={i} className="flex items-center">
            <span
              className={cn(
                "whitespace-nowrap font-display font-extrabold uppercase tracking-[.05em] text-white",
                size === "lg" ? "px-5 text-lg" : "px-6 text-base",
              )}
            >
              {w}
            </span>
            {withIcon && <Icon name="waves" size={16} className="text-white/70" />}
          </span>
        ))}
      </div>
    </div>
  );
}
