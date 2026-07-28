import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

type IconProps = {
  /** Material Symbols Outlined glyph name, e.g. "location_on". */
  name: string;
  /** Font size in px. */
  size?: number;
  /** Filled variant (FILL axis). */
  fill?: boolean;
  /** Weight axis (300–600). */
  weight?: number;
  className?: string;
  style?: CSSProperties;
};

/**
 * Material Symbols Outlined icon. No emoji anywhere on the platform —
 * every glyph comes from this font (loaded via <link> in the root layout).
 */
export function Icon({
  name,
  size = 20,
  fill = false,
  weight = 400,
  className,
  style,
}: IconProps) {
  return (
    <span
      aria-hidden="true"
      className={cn("ms", className)}
      style={{
        fontSize: size,
        fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'opsz' 20, 'wght' ${weight}`,
        ...style,
      }}
    >
      {name}
    </span>
  );
}
