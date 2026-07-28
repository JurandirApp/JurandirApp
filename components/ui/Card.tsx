import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** "highlight" uses the deeper 6px offset shadow. */
  variant?: "default" | "highlight";
};

/**
 * Signature card: white, 2px ink border, hard offset shadow.
 * Default radius 16 (rounded-2xl); override via className when a section needs more.
 */
export function Card({ variant = "default", className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border-2 border-ink bg-white",
        variant === "highlight" ? "shadow-hard-lg" : "shadow-hard",
        className,
      )}
      {...props}
    />
  );
}
