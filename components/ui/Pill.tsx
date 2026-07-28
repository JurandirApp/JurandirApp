import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type PillProps = HTMLAttributes<HTMLSpanElement>;

/**
 * Normal-case rounded tag (e.g. cuisine / type chips in the ranking).
 * Colors come from className.
 */
export function Pill({ className, ...props }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        className,
      )}
      {...props}
    />
  );
}
