"use client";

type ToggleProps = {
  checked: boolean;
  onChange: () => void;
  "aria-label"?: string;
};

/** Pill switch (44×24). Ink when on, muted when off. No hover. */
export function Toggle({ checked, onChange, ...rest }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="relative h-6 w-11 flex-shrink-0 rounded-full p-0 transition-colors"
      style={{ background: checked ? "#141821" : "rgba(20,24,33,.2)" }}
      {...rest}
    >
      <span
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-[left] duration-150"
        style={{ left: checked ? "22px" : "2px" }}
      />
    </button>
  );
}
