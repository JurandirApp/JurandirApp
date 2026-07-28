"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { qrImg } from "@/lib/panel/helpers";
import { usePanel } from "../context";

export function QrSection() {
  const { qrs, qrLabel, setQrLabel, addQr, openZoom, askDeleteQr, beach } =
    usePanel();
  const t = useTranslations("panel");
  const canAdd = qrLabel.trim().length > 0;

  return (
    <div>
      <div className="mb-4 rounded-2xl border-2 border-ink bg-white p-4 shadow-hard">
        <h2 className="m-0 mb-1 flex items-center gap-1.5 font-display text-[15px] font-semibold text-ink/70">
          <Icon name="qr_code_2" size={16} className="text-ocean-700" />
          {beach ? t("qr.titleBeach") : t("qr.titleTable")}
        </h2>
        <p className="m-0 mb-3 text-xs text-ink/50">{t("qr.description")}</p>
        <div className="flex gap-2">
          <input
            value={qrLabel}
            onChange={(e) => setQrLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addQr()}
            placeholder={
              beach ? t("qr.placeholderBeach") : t("qr.placeholderTable")
            }
            className="flex-1 rounded-xl border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-ink"
          />
          <button
            type="button"
            onClick={addQr}
            className="flex flex-shrink-0 items-center gap-1 rounded-xl px-4 py-2.5 text-sm font-medium text-white"
            style={{ background: canAdd ? "#FF6B4A" : "rgba(20,24,33,.2)" }}
          >
            <Icon name="add" size={16} />
            {t("qr.generate")}
          </button>
        </div>
      </div>

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))" }}
      >
        {qrs.map((q) => (
          <div
            key={q.id}
            className="flex flex-col items-center rounded-2xl border-2 border-ink bg-white p-3 text-center shadow-hard"
          >
            <button
              type="button"
              onClick={() => openZoom(q)}
              aria-label="Ampliar QR Code"
              className="w-full overflow-hidden rounded-xl border border-ink/10 bg-white p-0"
            >
              <div
                role="img"
                aria-label={`QR ${q.label}`}
                className="aspect-square w-full bg-cover bg-center"
                style={{ backgroundImage: `url("${qrImg(q.label, 220)}")` }}
              />
            </button>
            <p className="m-0 mt-2 flex items-center gap-1 text-sm font-semibold text-ink/80">
              <Icon name="location_on" size={13} className="text-ocean-700" />
              {q.label}
            </p>
            <div className="mt-2 flex w-full gap-1.5">
              <a
                href={qrImg(q.label, 600)}
                target="_blank"
                rel="noreferrer"
                className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-dune-50 py-2 text-xs font-medium text-ink/70"
              >
                <Icon name="download" size={13} />
                {t("qr.download")}
              </a>
              <button
                type="button"
                onClick={() => openZoom(q)}
                aria-label={t("qr.print")}
                className="flex w-8 flex-shrink-0 items-center justify-center rounded-lg bg-dune-50 text-ink/70"
              >
                <Icon name="print" size={14} />
              </button>
              <button
                type="button"
                onClick={() => askDeleteQr(q)}
                aria-label={t("confirm.delete")}
                className="flex w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#fef2f2] text-[#ef4444]"
              >
                <Icon name="delete" size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
