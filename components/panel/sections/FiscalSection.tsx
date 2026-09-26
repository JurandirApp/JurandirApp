"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import {
  getFiscalDataAction,
  saveFiscalConfigAction,
  emitFiscalManualAction,
} from "@/lib/actions/panel";
import type {
  FiscalConfigForm,
  FiscalDocStatus,
  FiscalNotaRow,
} from "@/lib/data/panel";
import { usePanel } from "../context";

const brl = (v: number) => "R$ " + v.toFixed(2).replace(".", ",");

/** Cor + rótulo (via i18n) de cada estado da nota. */
const STATUS_STYLE: Record<
  FiscalDocStatus | "NONE",
  { bg: string; fg: string; key: string }
> = {
  AUTHORIZED: { bg: "#dcfce7", fg: "#166534", key: "authorized" },
  PROCESSING: { bg: "#fef9c3", fg: "#854d0e", key: "processing" },
  QUEUED: { bg: "#fef9c3", fg: "#854d0e", key: "queued" },
  REJECTED: { bg: "#fee2e2", fg: "#991b1b", key: "rejected" },
  ERROR: { bg: "#fee2e2", fg: "#991b1b", key: "error" },
  NONE: { bg: "#f1f5f9", fg: "#64748b", key: "none" },
};

export function FiscalSection() {
  const { toast } = usePanel();
  const t = useTranslations("panel.fiscal");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [emitting, setEmitting] = useState<string | null>(null);
  const [cfg, setCfg] = useState<FiscalConfigForm | null>(null);
  const [rows, setRows] = useState<FiscalNotaRow[]>([]);

  const load = useCallback(async () => {
    try {
      const d = await getFiscalDataAction();
      setCfg(d.config);
      setRows(d.rows);
    } catch {
      toast(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const set = <K extends keyof FiscalConfigForm>(k: K, v: FiscalConfigForm[K]) =>
    setCfg((c) => (c ? { ...c, [k]: v } : c));

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const r = await saveFiscalConfigAction(cfg);
      if (r.ok) {
        toast(t("saved"));
        await load();
      } else {
        toast(t("saveError"));
      }
    } catch {
      toast(t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  const emit = async (orderId: string) => {
    setEmitting(orderId);
    try {
      const r = await emitFiscalManualAction(orderId);
      toast(r.ok ? t("emitQueued") : r.error || t("emitError"));
      await load();
    } catch {
      toast(t("emitError"));
    } finally {
      setEmitting(null);
    }
  };

  if (loading || !cfg) {
    return <p className="text-sm text-ink/50">{t("loading")}</p>;
  }

  const off = cfg.fiscalMode === "OFF";

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {/* Config */}
      <Card>
        <SectionLabel icon="receipt_long">{t("configTitle")}</SectionLabel>
        <p className="m-0 mb-4 text-[11px] leading-snug text-ink/45">{t("configHint")}</p>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldSelect
              label={t("mode")}
              value={cfg.fiscalMode}
              onChange={(v) => set("fiscalMode", v as FiscalConfigForm["fiscalMode"])}
              options={[
                { value: "OFF", label: t("modeOff") },
                { value: "MANUAL", label: t("modeManual") },
                { value: "AUTO_ON_PRINT", label: t("modeAuto") },
              ]}
            />
            <FieldSelect
              label={t("env")}
              value={cfg.fiscalEnv}
              onChange={(v) => set("fiscalEnv", v as FiscalConfigForm["fiscalEnv"])}
              options={[
                { value: "HOMOLOGACAO", label: t("envHomolog") },
                { value: "PRODUCAO", label: t("envProd") },
              ]}
            />
          </div>

          {cfg.fiscalEnv === "PRODUCAO" && (
            <p className="m-0 flex items-start gap-1.5 rounded-lg bg-[#fef9c3] px-3 py-2 text-[11px] leading-snug text-[#854d0e]">
              <Icon name="warning" size={14} className="mt-px shrink-0" />
              {t("prodWarn")}
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("cnpj")}>
              <Input value={cfg.cnpj} onChange={(e) => set("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
            </Field>
            <Field label={t("ie")}>
              <Input value={cfg.ie} onChange={(e) => set("ie", e.target.value)} placeholder={t("iePlaceholder")} />
            </Field>
            <FieldSelect
              label={t("regime")}
              value={cfg.regimeTributario || "3"}
              onChange={(v) => set("regimeTributario", v)}
              options={[
                { value: "1", label: t("regimeSimples") },
                { value: "3", label: t("regimeNormal") },
              ]}
            />
            <Field label={t("serie")}>
              <Input
                value={cfg.nfceSerie}
                onChange={(e) => set("nfceSerie", e.target.value.replace(/\D/g, ""))}
                placeholder="1"
                inputMode="numeric"
              />
            </Field>
          </div>

          <Divider>{t("addressTitle")}</Divider>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
            <Field label={t("street")}>
              <Input value={cfg.fiscalStreet} onChange={(e) => set("fiscalStreet", e.target.value)} />
            </Field>
            <Field label={t("number")}>
              <Input value={cfg.fiscalNumber} onChange={(e) => set("fiscalNumber", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={t("district")}>
              <Input value={cfg.fiscalDistrict} onChange={(e) => set("fiscalDistrict", e.target.value)} />
            </Field>
            <Field label={t("city")}>
              <Input value={cfg.fiscalCity} onChange={(e) => set("fiscalCity", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("uf")}>
                <Input
                  value={cfg.fiscalUf}
                  onChange={(e) => set("fiscalUf", e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="PR"
                />
              </Field>
              <Field label={t("zip")}>
                <Input value={cfg.fiscalZip} onChange={(e) => set("fiscalZip", e.target.value)} placeholder="00000-000" />
              </Field>
            </div>
          </div>

          <Divider>{t("providerTitle")}</Divider>
          <p className="m-0 -mt-1 text-[11px] leading-snug text-ink/45">{t("providerHint")}</p>
          <Field label={t("focusToken")}>
            <Input
              type="password"
              value={cfg.focusToken}
              onChange={(e) => set("focusToken", e.target.value)}
              placeholder={cfg.hasFocusToken ? t("secretConfigured") : t("focusTokenPlaceholder")}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("csc")}>
              <Input
                type="password"
                value={cfg.fiscalCsc}
                onChange={(e) => set("fiscalCsc", e.target.value)}
                placeholder={cfg.hasCsc ? t("secretConfigured") : t("cscPlaceholder")}
              />
            </Field>
            <Field label={t("cscId")}>
              <Input value={cfg.fiscalCscId} onChange={(e) => set("fiscalCscId", e.target.value)} placeholder="000001" />
            </Field>
          </div>

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="mt-1 w-full rounded-xl bg-coral p-3 text-[15px] font-semibold text-white disabled:opacity-60 sm:w-auto sm:self-end sm:px-6"
          >
            {saving ? t("saving") : t("save")}
          </button>
        </div>
      </Card>

      {/* Notas */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <SectionLabel icon="description">{t("notasTitle")}</SectionLabel>
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-1 rounded-lg bg-dune-50 px-2.5 py-1.5 text-xs font-medium text-ink/70"
          >
            <Icon name="refresh" size={14} />
            {t("refresh")}
          </button>
        </div>

        {off && (
          <p className="m-0 mb-3 flex items-start gap-1.5 rounded-lg bg-[#f1f5f9] px-3 py-2 text-[11px] leading-snug text-ink/55">
            <Icon name="info" size={14} className="mt-px shrink-0" />
            {t("offNotice")}
          </p>
        )}

        {rows.length === 0 ? (
          <p className="m-0 py-6 text-center text-sm text-ink/45">{t("empty")}</p>
        ) : (
          <div className="flex flex-col divide-y divide-ink/5">
            {rows.map((r) => {
              const st = STATUS_STYLE[r.status ?? "NONE"];
              const canEmit = !off && (r.status === null || r.status === "ERROR" || r.status === "REJECTED");
              return (
                <div key={r.orderId} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-[13px] font-semibold text-ink">{r.orderCode}</span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                        style={{ background: st.bg, color: st.fg }}
                      >
                        {t(`status.${st.key}`)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink/50">
                      <span>{brl(r.total)}</span>
                      {r.numero != null && <span>NFC-e nº {r.numero}</span>}
                      {r.rejeicao && <span className="text-[#991b1b]">{r.rejeicao}</span>}
                    </div>
                  </div>
                  {r.danfeUrl && (
                    <a
                      href={r.danfeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 rounded-lg bg-dune-50 px-2.5 py-1.5 text-xs font-medium text-ink/70"
                    >
                      <Icon name="download" size={14} />
                      {t("danfe")}
                    </a>
                  )}
                  {canEmit && (
                    <button
                      type="button"
                      onClick={() => emit(r.orderId)}
                      disabled={emitting === r.orderId}
                      className="rounded-lg bg-coral px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {emitting === r.orderId
                        ? t("emitting")
                        : r.status === null
                          ? t("emit")
                          : t("reemit")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-white p-5 shadow-sm">{children}</div>;
}

function SectionLabel({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <h3 className="m-0 flex items-center gap-2 font-display text-base font-bold text-ink">
      <Icon name={icon} size={18} className="text-coral" />
      {children}
    </h3>
  );
}

function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="mt-1 flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">{children}</span>
      <span className="h-px flex-1 bg-ink/10" />
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink/60">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink/60">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 box-border w-full rounded-xl border-2 border-ink/15 bg-white px-3 py-2.5 text-sm font-medium text-ink outline-none focus:border-coral"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
