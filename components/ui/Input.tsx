import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full rounded-xl border-2 border-ink/15 bg-white px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink/40 focus:border-ink";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/** Text input. Focus ring is ink (never coral), per design system. */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldBase, className)} {...props} />
  ),
);
Input.displayName = "Input";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(fieldBase, "resize-none", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";
