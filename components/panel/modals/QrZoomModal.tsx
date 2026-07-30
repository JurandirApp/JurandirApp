"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import type { Qr } from "@/lib/data/panel";
import { qrImg, qrUrl } from "@/lib/panel/helpers";

export function QrZoomModal({
  qr,
  slug,
  restName,
  onClose,
  onPrint,
}: {
  qr: Qr;
  slug: string;
  restName: string;
  onClose: () => void;
  onPrint: () => void;
}) {
  const t = useTranslations("panel.qr");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4">
      <div className="w-full max-w-[320px] rounded-2xl bg-white p-6 text-center">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-display font-bold">{restName}</span>
          <button
            type="button"
            aria-label={t("close")}
            onClick={onClose}
            className="bg-transparent p-0 text-ink/40"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <div
          role="img"
          aria-label="QR Code"
          className="aspect-square w-full rounded-xl border border-ink/10 bg-cover bg-center"
          style={{ backgroundImage: `url("${qrImg(slug, qr.label, 320)}")` }}
        />
        <p className="m-0 mt-3 flex items-center justify-center gap-1.5 font-display text-lg font-bold">
          <Icon name="location_on" size={16} className="text-ocean-700" />
          {qr.label}
        </p>
        <p className="m-0 mt-1 break-all text-[11px] text-ink/40">
          {qrUrl(slug, qr.label)}
        </p>
        <p className="m-0 mt-3 text-xs text-ink/60">
          {t.rich("zoomHint", { label: qr.label, b: (c) => <b>{c}</b> })}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onPrint}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-dune-50 p-2.5 text-sm font-semibold text-ink/70"
          >
            <Icon name="print" size={15} />
            {t("print")}
          </button>
          <a
            href={qrImg(slug, qr.label, 600)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-xl bg-ink p-2.5 text-sm font-semibold text-sand"
          >
            <Icon name="download" size={15} />
            {t("download")}
          </a>
        </div>
      </div>
    </div>
  );
}
