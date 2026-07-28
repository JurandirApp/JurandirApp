"use client";

import { useApp } from "./context";

export function ClientToast() {
  const { toast } = useApp();
  if (!toast) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-[18px] py-2.5 text-sm font-semibold text-sand">
      {toast}
    </div>
  );
}
