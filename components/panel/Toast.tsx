"use client";

export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-[18px] py-2.5 text-sm font-semibold text-sand shadow-[0_18px_40px_-20px_rgba(12,67,71,.5)]">
      {text}
    </div>
  );
}
