import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes, resolving conflicts (later wins). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** pt-BR currency: 1234.5 -> "R$ 1.234,50" */
export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/** pt-BR number with thousands separator: 305932 -> "305.932" */
export function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR");
}
