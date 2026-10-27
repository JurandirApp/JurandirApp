"use client";

import type { ReactNode } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import { Icon } from "@/components/ui/Icon";

// Peças compartilhadas dos formulários de cadastro de pagamento do painel
// (recebedor Pagar.me, cadastro na Tuna): campo rotulado, dropdown compacto e
// máscaras de CPF/CNPJ/telefone.

export const onlyDigits = (v: string) => v.replace(/\D/g, "");

export function formatDoc(v: string, type: "individual" | "corporation"): string {
  const d = onlyDigits(v).slice(0, type === "individual" ? 11 : 14);
  if (type === "individual") {
    return d
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

export function formatPhone(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d.replace(/(\d*)/, "($1");
  if (d.length <= 6) return d.replace(/(\d{2})(\d*)/, "($1) $2");
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d*)/, "($1) $2-$3");
  return d.replace(/(\d{2})(\d{5})(\d*)/, "($1) $2-$3");
}

/** Máscara que alterna CPF/CNPJ pelo tamanho (≤11 = CPF). */
export const maskDoc = (v: string) =>
  formatDoc(v, onlyDigits(v).length > 11 ? "corporation" : "individual");

export function F({
  label,
  req,
  children,
  className,
}: {
  label: string;
  req?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-[11px] font-medium text-ink/55">
        {label}
        {req && <span className="text-coral"> *</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function MiniDd({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const cur = options.find((o) => o.value === value)?.label ?? value;
  return (
    <Dropdown
      align="stretch"
      value={value}
      onChange={onChange}
      options={options}
      panelClassName="max-h-48"
      renderTrigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="box-border flex w-full items-center justify-between gap-1 rounded-xl border-2 border-ink/15 bg-white px-3 py-2 text-left text-sm font-medium text-ink"
        >
          <span className="truncate">{cur}</span>
          <Icon name="expand_more" size={15} className="text-ink/40 transition-transform duration-150" style={{ transform: open ? "rotate(180deg)" : "none" }} />
        </button>
      )}
    />
  );
}
