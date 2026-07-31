"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Dropdown } from "@/components/ui/Dropdown";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import type { PagarmeRecipientForm } from "@/lib/validation";
import { usePanel } from "../context";

type Form = {
  type: "individual" | "corporation";
  name: string;
  document: string;
  email: string;
  phone: string;
};

const EMPTY: Form = { type: "individual", name: "", document: "", email: "", phone: "" };

export function PagarmeManager() {
  const { gatewayPix, setGatewayPix, pagarmeReady, createPagarmeRecipient, mpConnected, toast } =
    usePanel();
  const t = useTranslations("panel.config");
  const [open, setOpen] = useState(false);

  return (
    <div>
      {/* Onde cai o Pix — seletor de gateway */}
      <SectionLabel>{t("pixRoutingTitle")}</SectionLabel>
      <p className="m-0 mb-2 text-[11px] text-ink/45">{t("pixRoutingHint")}</p>
      <div className="grid grid-cols-2 gap-2">
        <GatewayOption
          active={gatewayPix !== "PAGARME"}
          onClick={() => setGatewayPix("MERCADO_PAGO")}
          label="Mercado Pago"
          status={mpConnected ? t("pgConnected") : t("pgSingleAccount")}
        />
        <GatewayOption
          active={gatewayPix === "PAGARME"}
          onClick={() => (pagarmeReady ? setGatewayPix("PAGARME") : setOpen(true))}
          label="Pagar.me"
          status={pagarmeReady ? t("pgRecipientReady") : t("pgNeedsRecipient")}
        />
      </div>

      {/* Recebedor Pagar.me — status + finalização no webapp, ou CTA de criação */}
      <div className="mt-4 border-t border-ink/10 pt-3">
        <SectionLabel>{t("pgSectionTitle")}</SectionLabel>
        {pagarmeReady ? (
          <KycFinish />
        ) : (
          <>
            <p className="m-0 mb-2 text-[11px] text-ink/45">{t("pgOnboardHint")}</p>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-xs font-bold text-sand"
            >
              <Icon name="add_business" size={15} />
              {t("pgCreateRecipient")}
            </button>
          </>
        )}
      </div>

      {open && <RecipientModal onClose={() => setOpen(false)} onDone={createPagarmeRecipient} toast={toast} />}
    </div>
  );
}

/** Status do recebedor + botão que abre o cadastro hospedado (conta + identidade). */
function KycFinish() {
  const { generatePagarmeKycLink, pagarmeStatus } = usePanel();
  const t = useTranslations("panel.config");
  const [loading, setLoading] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const active = pagarmeStatus === "active";

  const openKyc = async () => {
    setLoading(true);
    setMsg(null);
    setQr(null);
    const r = await generatePagarmeKycLink();
    setLoading(false);
    if (r.ok && (r.url || r.base64)) {
      if (r.url) window.open(r.url, "_blank", "noopener,noreferrer");
      if (r.base64) setQr(r.base64);
    } else {
      setMsg(r.error === "not-ready" ? t("pgKycNotReady") : t("pgKycError"));
    }
  };

  return (
    <div>
      {active ? (
        <p className="m-0 flex items-center gap-1.5 text-xs font-medium text-[#059669]">
          <Icon name="check_circle" size={14} />
          {t("pgStatusActive")}
        </p>
      ) : (
        <p className="m-0 flex items-center gap-1.5 text-xs font-medium text-[#b45309]">
          <Icon name="schedule" size={14} />
          {t("pgStatusPending", { status: pagarmeStatus || "registration" })}
        </p>
      )}

      {!active && (
        <div className="mt-2">
          <p className="m-0 mb-2 text-[11px] leading-relaxed text-ink/45">{t("pgKycHint")}</p>
          <button
            type="button"
            onClick={openKyc}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-xs font-bold text-sand disabled:opacity-50"
          >
            <Icon name={loading ? "hourglass_empty" : "open_in_new"} size={15} />
            {loading ? t("pgKycGenerating") : t("pgKycOpen")}
          </button>
          {qr && (
            <div className="mt-3">
              <p className="m-0 mb-1.5 text-[11px] text-ink/45">{t("pgKycQrHint")}</p>
              {/* QR base64 do Pagar.me; next/image não otimiza data-URI. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/png;base64,${qr}`}
                alt="QR Pagar.me"
                className="h-40 w-40 rounded-lg border-2 border-ink/10"
              />
            </div>
          )}
          {msg && <p className="m-0 mt-2 text-xs font-medium text-[#e11d48]">{msg}</p>}
        </div>
      )}
    </div>
  );
}

/** Modal de cadastro MÍNIMO do recebedor (nome/documento/contato). */
function RecipientModal({
  onClose,
  onDone,
  toast,
}: {
  onClose: () => void;
  onDone: (form: PagarmeRecipientForm) => Promise<{ ok: boolean; error?: string }>;
  toast: (msg: string) => void;
}) {
  const t = useTranslations("panel.config");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const submit = async () => {
    setErr(null);
    if (!form.name || !form.document || !form.email) {
      setErr(t("pgFillRequired"));
      return;
    }
    setSaving(true);
    const r = await onDone({
      type: form.type,
      name: form.name,
      email: form.email,
      document: form.document,
      phone: form.phone || undefined,
    });
    setSaving(false);
    if (r.ok) {
      toast(t("pgRecipientCreated"));
      onClose();
    } else {
      setErr(r.error === "invalid" ? t("pgFillRequired") : r.error || t("pgError"));
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/60 md:items-center md:p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="max-h-[92vh] w-full max-w-[480px] overflow-y-auto rounded-t-2xl bg-white p-5 md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="m-0 font-display text-lg font-extrabold uppercase tracking-[-0.01em]">
            {t("pgModalTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("pgCancel")}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-transparent text-ink/50"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <p className="m-0 mb-4 text-xs leading-relaxed text-ink/50">{t("pgModalHint")}</p>

        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2">
            <F label={t("pgType")}>
              <MiniDd
                value={form.type}
                onChange={(v) => set("type", v)}
                options={[
                  { value: "individual", label: t("pgIndividual") },
                  { value: "corporation", label: t("pgCorporation") },
                ]}
              />
            </F>
            <F label={t("pgDocument")}>
              <Input
                value={form.document}
                onChange={(e) => set("document", e.target.value)}
                placeholder={form.type === "individual" ? "CPF" : "CNPJ"}
              />
            </F>
            <F className="col-span-2" label={t("pgName")}>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
            </F>
            <F label={t("pgEmail")}>
              <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
            </F>
            <F label={t("pgPhone")}>
              <Input
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="(47) 99999-9999"
              />
            </F>
          </div>

          {err && <p className="m-0 text-xs font-medium text-[#e11d48]">{err}</p>}
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink px-3.5 py-2.5 text-sm font-bold text-sand disabled:opacity-50"
            >
              {saving ? <Icon name="hourglass_empty" size={15} /> : <Icon name="check" size={15} />}
              {saving ? t("pgSaving") : t("pgSubmit")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-ink/[0.06] px-4 py-2.5 text-sm font-bold text-ink/60"
            >
              {t("pgCancel")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GatewayOption({
  active,
  disabled,
  onClick,
  label,
  status,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  status: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-start gap-0.5 rounded-xl border-2 p-3 text-left disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        borderColor: active ? "#141821" : "rgba(20,24,33,.12)",
        background: active ? "#141821" : "#fff",
      }}
    >
      <span
        className="flex items-center gap-1.5 text-sm font-bold"
        style={{ color: active ? "#EDD8A3" : "#141821" }}
      >
        {active && <Icon name="check_circle" size={15} />}
        {label}
      </span>
      <span
        className="text-[11px] font-medium"
        style={{ color: active ? "rgba(237,216,163,.7)" : "rgba(20,24,33,.45)" }}
      >
        {status}
      </span>
    </button>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 mb-2 text-[11px] font-bold uppercase tracking-wide text-ink/45">
      {children}
    </p>
  );
}

function F({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-[11px] font-medium text-ink/55">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function MiniDd({
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
          <Icon
            name="expand_more"
            size={15}
            className="text-ink/40 transition-transform duration-150"
            style={{ transform: open ? "rotate(180deg)" : "none" }}
          />
        </button>
      )}
    />
  );
}
