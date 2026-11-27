"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/ui/Icon";
import { qrImg } from "@/lib/panel/helpers";
import { usePanel } from "../context";
import {
  QR_BATCH_MAX,
  QR_LABEL_MAX,
  parseLabelList,
  planBatch,
  rangeLabels,
} from "@/lib/domain/qr-batch";

export function QrSection() {
  const { qrs, qrLabel, setQrLabel, addQr, openZoom, askDeleteQr, beach, slug } =
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
        <QrBatchForm />
        {/* Folha de impressão com o QR de todas as mesas/guarda-sóis (gerados
            localmente). Abre em nova aba pra imprimir ou salvar em PDF. */}
        {qrs.length > 0 && (
          <Link
            href="/painel/qr-lote"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl border-2 border-ink bg-white px-4 py-2 text-sm font-semibold text-ink no-underline"
          >
            <Icon name="print" size={16} />
            {t("qr.batchButton", { n: qrs.length })}
          </Link>
        )}
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
                style={{ backgroundImage: `url("${qrImg(slug, q.label, 220)}")` }}
              />
            </button>
            <p className="m-0 mt-2 flex items-center gap-1 text-sm font-semibold text-ink/80">
              <Icon name="location_on" size={13} className="text-ocean-700" />
              {q.label}
            </p>
            <div className="mt-2 flex w-full gap-1.5">
              <a
                href={qrImg(slug, q.label, 600)}
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

/** "Adicionar várias": faixa (prefixo + de/até, com zeros opcionais) ou lista
 *  colada (um por linha). Mostra a prévia antes de salvar; repetidos e já
 *  cadastrados são pulados (o servidor confere de novo). */
function QrBatchForm() {
  const { qrs, addQrBatch, beach } = usePanel();
  const t = useTranslations("panel.qr");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"range" | "list">("range");
  const [prefix, setPrefix] = useState(() =>
    beach ? t("batchPrefixBeach") : t("batchPrefixTable"),
  );
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("10");
  const [pad, setPad] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);

  // Rótulos gerados + o que vai ser criado/pulado (comparando com a lista atual).
  let labels: string[] = [];
  let error: string | null = null;
  if (mode === "range") {
    const r = from.trim() && to.trim() ? rangeLabels(prefix, Number(from), Number(to), pad) : null;
    if (!r) error = t("batchRangeInvalid", { max: QR_BATCH_MAX });
    else labels = r;
  } else {
    labels = parseLabelList(text);
    if (labels.length > QR_BATCH_MAX) error = t("batchTooMany", { max: QR_BATCH_MAX });
  }
  if (!error && labels.some((l) => l.length > QR_LABEL_MAX))
    error = t("batchTooLong", { max: QR_LABEL_MAX });
  const plan = planBatch(
    labels,
    qrs.map((q) => q.label),
  );
  const canSave = !error && plan.toCreate.length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const r = await addQrBatch(labels);
    setSaving(false);
    if (!r) return;
    setResult(r);
    setText("");
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setResult(null);
        }}
        className="mt-2 flex items-center gap-1 bg-transparent p-0 text-sm font-semibold text-ocean-700"
      >
        <Icon name="playlist_add" size={16} />
        {t("batchAdd")}
      </button>
    );
  }

  const input = "rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-ink";
  return (
    <div className="mt-3 rounded-xl border border-ink/15 bg-dune-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="m-0 text-sm font-semibold text-ink/80">{t("batchAdd")}</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t("close")}
          className="flex bg-transparent p-0 text-ink/50"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="mb-3 flex gap-1 rounded-lg bg-white p-1">
        {(["range", "list"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setResult(null);
            }}
            className="flex-1 rounded-md py-1.5 text-xs font-semibold"
            style={{
              background: mode === m ? "#141821" : "transparent",
              color: mode === m ? "#fff" : "rgba(20,24,33,.6)",
            }}
          >
            {m === "range" ? t("batchModeRange") : t("batchModeList")}
          </button>
        ))}
      </div>

      {mode === "range" ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[120px] flex-1 flex-col gap-1 text-xs text-ink/60">
            {t("batchPrefix")}
            <input value={prefix} onChange={(e) => setPrefix(e.target.value)} className={input} />
          </label>
          <label className="flex w-20 flex-col gap-1 text-xs text-ink/60">
            {t("batchFrom")}
            <input
              type="number"
              min={0}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={input}
            />
          </label>
          <label className="flex w-20 flex-col gap-1 text-xs text-ink/60">
            {t("batchTo")}
            <input
              type="number"
              min={0}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={input}
            />
          </label>
          <label className="flex items-center gap-1.5 pb-2 text-xs text-ink/70">
            <input type="checkbox" checked={pad} onChange={(e) => setPad(e.target.checked)} />
            {t("batchPad")}
          </label>
        </div>
      ) : (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={t("batchListPlaceholder")}
          className={`${input} w-full resize-y`}
        />
      )}

      {error ? (
        <p className="m-0 mt-2 text-xs text-[#b91c1c]">{error}</p>
      ) : labels.length > 0 ? (
        <div className="mt-2">
          <p className="m-0 mb-1 text-xs text-ink/60">
            {t("batchPreview", { n: plan.toCreate.length, skipped: plan.skipped })}
          </p>
          <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
            {plan.toCreate.map((l) => (
              <span key={l} className="rounded-md bg-white px-2 py-0.5 text-xs text-ink/80">
                {l}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {result && (
        <p className="m-0 mt-2 text-xs font-semibold text-[#047857]">
          {t("batchDone", { created: result.created, skipped: result.skipped })}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={!canSave}
        className="mt-3 flex items-center gap-1 rounded-xl px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed"
        style={{ background: canSave ? "#FF6B4A" : "rgba(20,24,33,.2)" }}
      >
        <Icon name="add" size={16} />
        {saving ? t("batchSaving") : t("batchSave", { n: plan.toCreate.length })}
      </button>
    </div>
  );
}
