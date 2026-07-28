"use client";

import { useEffect, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";

export function ConfirmDialog({
  icon,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  icon: string;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("panel.confirm");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4">
      <div className="w-full max-w-[320px] rounded-2xl bg-white p-5">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#fef2f2] text-[#ef4444]">
          <Icon name={icon} size={22} />
        </div>
        <h2 className="m-0 text-center font-display text-[17px] font-bold">
          {title}
        </h2>
        <p className="m-0 mt-1 text-center text-sm text-ink/60">{body}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl bg-dune-50 p-2.5 text-sm font-semibold text-ink/70"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-[#ef4444] p-2.5 text-sm font-semibold text-white"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
