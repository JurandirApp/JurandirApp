"use client";

import { LocalePicker } from "@/components/site/LocalePicker";
import { useApp } from "./context";

/** Seletor de idioma da área do cliente: lembra a tela atual (sessionStorage)
 *  pra voltar nela depois do recarregamento no outro locale. */
export function ClientLocalePicker({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { est, step } = useApp();
  return (
    <LocalePicker
      compact={compact}
      className={className}
      onBeforeSwitch={() => {
        try {
          sessionStorage.setItem(`jur_locale_step_${est.slug}`, step);
        } catch {
          /* sessionStorage indisponível */
        }
      }}
    />
  );
}
