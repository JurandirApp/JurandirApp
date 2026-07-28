import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "emerald" | "rose" | "amber" | "ink" | "neutral" | "sun";

const tones: Record<Tone, string> = {
  emerald: "bg-status-emerald-bg text-status-emerald-fg",
  rose: "bg-status-rose-bg text-status-rose-fg",
  amber: "bg-status-amber-bg text-status-amber-fg",
  ink: "bg-ink text-sand",
  sun: "bg-sun text-ink",
  neutral: "bg-ink/10 text-ink/50",
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
};

/** Tiny status/label chip. Uppercase, bold. */
export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
