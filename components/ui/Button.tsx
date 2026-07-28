import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "ink" | "coral" | "secondary";
type Shape = "pill" | "rounded";

const variants: Record<Variant, string> = {
  ink: "bg-ink text-sand",
  coral: "bg-coral text-white",
  secondary: "bg-dune-50 text-ink",
};

const shapes: Record<Shape, string> = {
  pill: "rounded-full",
  rounded: "rounded-xl",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  shape?: Shape;
  block?: boolean;
};

/**
 * Base button. Pill by default. No hover states (client decision).
 * Padding/size are set by default and can be overridden via className.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = "ink", shape = "pill", block = false, className, type = "button", ...props },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 px-5 py-3 text-sm font-bold",
        variants[variant],
        shapes[shape],
        block && "w-full",
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
