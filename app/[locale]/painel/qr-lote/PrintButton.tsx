"use client";

import { Icon } from "@/components/ui/Icon";

/** Abre a caixa de impressão do navegador (dá pra "Salvar como PDF"). */
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex items-center gap-1.5 rounded-xl bg-coral px-4 py-2.5 text-sm font-semibold text-white"
    >
      <Icon name="print" size={16} />
      {label}
    </button>
  );
}
