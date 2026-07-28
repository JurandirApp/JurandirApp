"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

export type DropdownOption = {
  value: string;
  label: string;
  /** Optional leading Material Symbols glyph (e.g. "location_on"). */
  icon?: string;
};

type DropdownProps = {
  options: DropdownOption[];
  /** Currently selected value ("" = none). */
  value: string;
  onChange: (value: string) => void;
  /** Full trigger element; wire `toggle` to its onClick and use `open` for the chevron. */
  renderTrigger: (args: {
    open: boolean;
    toggle: () => void;
    id: string;
  }) => ReactNode;
  /** Panel horizontal behavior: stretch to trigger width, or left-aligned with min width. */
  align?: "stretch" | "left";
  /** Extra classes for the panel (radius, min/max sizing, etc.). */
  panelClassName?: string;
  className?: string;
};

/**
 * Custom accessible dropdown — never a native <select>.
 * Invisible fixed backdrop closes on outside click; Escape also closes.
 * Selected option gets the sand background + a coral check.
 */
export function Dropdown({
  options,
  value,
  onChange,
  renderTrigger,
  align = "left",
  panelClassName,
  className,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const toggle = () => setOpen((o) => !o);
  const close = () => setOpen(false);

  // Mantém o painel dentro da viewport: se ele passar da borda direita (comum no
  // mobile, quando o gatilho está à direita), desloca pra esquerda o necessário.
  // Roda no commit (ref callback), antes do paint — sem "pulo" visível — e evita
  // overflow horizontal que empurraria o toggle PT/EN fixo.
  const clampIntoView = (el: HTMLDivElement | null) => {
    if (!el) return;
    el.style.transform = "";
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const overRight = rect.right - (window.innerWidth - margin);
    if (overRight > 0) el.style.transform = `translateX(${-overRight}px)`;
  };

  return (
    <div className={cn("relative", className)}>
      {renderTrigger({ open, toggle, id })}
      {open && (
        <>
          <button
            type="button"
            aria-label="Fechar"
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-20 cursor-default"
          />
          <div
            ref={clampIntoView}
            role="listbox"
            id={id}
            className={cn(
              "absolute top-[calc(100%+6px)] z-30 max-w-[calc(100vw-1rem)] rounded-2xl border-2 border-ink/10 bg-white p-1.5 shadow-dropdown",
              align === "stretch" ? "left-0 right-0" : "left-0",
              panelClassName,
            )}
          >
            {options.map((o) => {
              const selected = o.value === value;
              return (
                <button
                  key={o.value || "__none__"}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(o.value);
                    close();
                  }}
                  className={cn(
                    "box-border flex w-full items-center gap-2 whitespace-nowrap rounded-[10px] px-3 py-2.5 text-left text-sm font-semibold text-ink",
                    selected ? "bg-dune-50" : "bg-transparent",
                  )}
                >
                  {o.icon && (
                    <Icon name={o.icon} size={15} className="text-coral" />
                  )}
                  <span className="flex-1">{o.label}</span>
                  {selected && (
                    <Icon name="check" size={16} className="text-coral-emph" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
