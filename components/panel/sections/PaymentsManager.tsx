"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Dropdown } from "@/components/ui/Dropdown";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import type { PagarmeRecipientForm } from "@/lib/validation";
import { usePanel } from "../context";

type MethodKey = "pix" | "credit" | "debit";

const GATEWAYS = [
  { id: "MERCADO_PAGO", label: "Mercado Pago" },
  { id: "PAGARME", label: "Pagar.me" },
  { id: "INFINITEPAY", label: "InfinitePay" },
] as const;

// Qual gateway implementa qual método hoje (o resto aparece como "em breve").
const CAP: Record<string, Record<MethodKey, boolean>> = {
  MERCADO_PAGO: { pix: true, credit: true, debit: true },
  PAGARME: { pix: true, credit: false, debit: false },
  INFINITEPAY: { pix: false, credit: false, debit: false },
};

const METHODS: { key: MethodKey; icon: string }[] = [
  { key: "pix", icon: "qr_code_2" },
  { key: "credit", icon: "credit_card" },
  { key: "debit", icon: "account_balance_wallet" },
];

export function PaymentsManager() {
  const {
    gatewayPix,
    gatewayCredit,
    gatewayDebit,
    setGateway,
    mpConnected,
    pagarmeReady,
    createPagarmeRecipient,
    toast,
  } = usePanel();
  const t = useTranslations("panel.config");
  const [modal, setModal] = useState(false);

  const current: Record<MethodKey, string> = {
    pix: gatewayPix,
    credit: gatewayCredit,
    debit: gatewayDebit,
  };
  const isReady = (g: string) =>
    g === "MERCADO_PAGO" ? true : g === "PAGARME" ? pagarmeReady : false;

  return (
    <div>
      {/* Parte 1 — roteamento por método */}
      <SectionLabel>{t("routingTitle")}</SectionLabel>
      <p className="m-0 mb-3 text-[11px] text-ink/45">{t("routingHint")}</p>
      <div className="flex flex-col gap-3">
        {METHODS.map((m) => (
          <div key={m.key}>
            <p className="m-0 mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink/70">
              <Icon name={m.icon} size={14} className="text-ocean-700" />
              {t(`method_${m.key}`)}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {GATEWAYS.map((g) => {
                const impl = CAP[g.id][m.key];
                const ready = isReady(g.id);
                const selectable = impl && ready;
                const selected = current[m.key] === g.id;
                const note = !impl
                  ? t("soon")
                  : g.id === "PAGARME"
                    ? ready
                      ? t("pgRecipientReady")
                      : t("needsSetup")
                    : mpConnected
                      ? t("pgConnected")
                      : t("pgSingleAccount");
                return (
                  <GatewayCell
                    key={g.id}
                    label={g.label}
                    note={note}
                    selected={selected}
                    disabled={!selectable}
                    onClick={() => selectable && setGateway(m.key, g.id)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Parte 2 — conexões / setup de cada gateway */}
      <div className="mt-5 border-t border-ink/10 pt-4">
        <SectionLabel>{t("connectionsTitle")}</SectionLabel>
        <div className="flex flex-col gap-2">
          <MpConnection />
          <PagarmeConnection onOpen={() => setModal(true)} />
          <SoonConnection />
        </div>
      </div>

      {modal && <RecipientModal onClose={() => setModal(false)} onDone={createPagarmeRecipient} toast={toast} />}
    </div>
  );
}

function GatewayCell({
  label,
  note,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  note: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-start gap-0.5 rounded-xl border-2 p-2.5 text-left disabled:cursor-not-allowed"
      style={{
        borderColor: selected ? "#141821" : "rgba(20,24,33,.12)",
        background: selected ? "#141821" : "#fff",
        opacity: disabled && !selected ? 0.5 : 1,
      }}
    >
      <span
        className="flex items-center gap-1 text-[13px] font-bold leading-tight"
        style={{ color: selected ? "#EDD8A3" : "#141821" }}
      >
        {selected && <Icon name="check_circle" size={13} />}
        {label}
      </span>
      <span
        className="text-[10px] font-medium leading-tight"
        style={{ color: selected ? "rgba(237,216,163,.7)" : "rgba(20,24,33,.4)" }}
      >
        {note}
      </span>
    </button>
  );
}

/** Conexão do Mercado Pago (OAuth) + aviso de "sem chave Pix". */
function MpConnection() {
  const { mpConnected, mpResult, connectMp, disconnectMp, mpPixReady } = usePanel();
  const t = useTranslations("panel.config");
  return (
    <div className="rounded-xl border-2 border-ink/10 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink/80">
          <span
            className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
            style={{ background: mpConnected ? "#10b981" : "rgba(20,24,33,.25)" }}
          />
          {mpConnected ? t("mpStatusConnected") : t("mpStatusNot")}
        </span>
        {mpConnected ? (
          <button
            type="button"
            onClick={disconnectMp}
            className="flex-shrink-0 rounded-lg bg-ink/[0.06] px-3 py-2 text-xs font-bold text-ink/70"
          >
            {t("mpDisconnect")}
          </button>
        ) : (
          <button
            type="button"
            onClick={connectMp}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-[#009ee3] px-3.5 py-2 text-xs font-bold text-white"
          >
            <Icon name="link" size={14} />
            {t("mpConnect")}
          </button>
        )}
      </div>
      {mpResult === "ok" && (
        <p className="m-0 mt-2 rounded-lg bg-[#ecfdf5] px-3 py-2 text-xs font-medium text-[#059669]">
          {t("mpConnectedOk")}
        </p>
      )}
      {mpResult === "error" && (
        <p className="m-0 mt-2 rounded-lg bg-[#fef2f2] px-3 py-2 text-xs font-medium text-[#e11d48]">
          {t("mpConnectError")}
        </p>
      )}
      {mpConnected && mpPixReady === false && (
        <div className="mt-2 flex flex-wrap items-start gap-2 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-xs text-[#b91c1c]">
          <Icon name="error" size={15} className="mt-px flex-none" />
          <span className="min-w-0 flex-1 font-medium leading-snug">{t("pixNoKey")}</span>
        </div>
      )}
      <p className="m-0 mt-2 text-[11px] leading-relaxed text-ink/45">{t("mpFeeNote")}</p>
    </div>
  );
}

/** Conexão do Pagar.me — recebedor + finalização de KYC. */
function PagarmeConnection({ onOpen }: { onOpen: () => void }) {
  const { pagarmeReady } = usePanel();
  const t = useTranslations("panel.config");
  return (
    <div className="rounded-xl border-2 border-ink/10 p-3">
      <p className="m-0 mb-2 text-sm font-semibold text-ink/80">Pagar.me</p>
      {pagarmeReady ? (
        <KycFinish />
      ) : (
        <>
          <div className="mb-2 flex items-start gap-2 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-[11px] leading-snug text-[#92400e]">
            <Icon name="info" size={14} className="mt-px flex-none" />
            <span className="min-w-0 flex-1">{t("pgPrereq")}</span>
          </div>
          <p className="m-0 mb-2 text-[11px] leading-relaxed text-ink/45">{t("pgOnboardHint")}</p>
          <button
            type="button"
            onClick={onOpen}
            className="flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-xs font-bold text-sand"
          >
            <Icon name="add_business" size={15} />
            {t("pgCreateRecipient")}
          </button>
        </>
      )}
    </div>
  );
}

/** InfinitePay — placeholder até a integração existir. */
function SoonConnection() {
  const t = useTranslations("panel.config");
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-dashed border-ink/12 p-3 opacity-70">
      <span className="text-sm font-semibold text-ink/60">InfinitePay</span>
      <span className="rounded-full bg-ink/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink/50">
        {t("soon")}
      </span>
    </div>
  );
}

/** Status do recebedor + botão que abre a biometria (prova de vida) no Pagar.me. */
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`data:image/png;base64,${qr}`} alt="QR Pagar.me" className="h-40 w-40 rounded-lg border-2 border-ink/10" />
            </div>
          )}
          {msg && <p className="m-0 mt-2 text-xs font-medium text-[#e11d48]">{msg}</p>}
        </div>
      )}
    </div>
  );
}

// ---- Modal de cadastro do recebedor Pagar.me -------------------------------

type Form = {
  type: "individual" | "corporation";
  name: string;
  document: string;
  email: string;
  phone: string;
  birthdate: string;
  motherName: string;
  professionalOccupation: string;
  monthlyIncome: string;
  bank: string;
  branchNumber: string;
  branchCheckDigit: string;
  accountNumber: string;
  accountCheckDigit: string;
  accountType: "checking" | "savings";
  street: string;
  streetNumber: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
};

const EMPTY: Form = {
  type: "individual",
  name: "",
  document: "",
  email: "",
  phone: "",
  birthdate: "",
  motherName: "",
  professionalOccupation: "",
  monthlyIncome: "",
  bank: "",
  branchNumber: "",
  branchCheckDigit: "",
  accountNumber: "",
  accountCheckDigit: "",
  accountType: "checking",
  street: "",
  streetNumber: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  zipCode: "",
};

// Campos obrigatórios (marcados com "*"). Ficam de fora só os que o Pagar.me
// aceita vazio: Dígito da agência (muitos bancos não têm) e Complemento.
const REQUIRED_FIELDS: (keyof Form)[] = [
  "document",
  "name",
  "email",
  "phone",
  "birthdate",
  "bank",
  "branchNumber",
  "accountNumber",
  "accountCheckDigit",
  "street",
  "streetNumber",
  "neighborhood",
  "city",
  "state",
  "zipCode",
];
const REQUIRED_PF: (keyof Form)[] = ["motherName", "professionalOccupation", "monthlyIncome"];

const onlyDigits = (v: string) => v.replace(/\D/g, "");

function formatDoc(v: string, type: "individual" | "corporation"): string {
  const d = onlyDigits(v).slice(0, type === "individual" ? 11 : 14);
  if (type === "individual") {
    return d
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

function formatPhone(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d.replace(/(\d*)/, "($1");
  if (d.length <= 6) return d.replace(/(\d{2})(\d*)/, "($1) $2");
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d*)/, "($1) $2-$3");
  return d.replace(/(\d{2})(\d{5})(\d*)/, "($1) $2-$3");
}

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
  const isPF = form.type === "individual";

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
    const required = isPF ? [...REQUIRED_FIELDS, ...REQUIRED_PF] : REQUIRED_FIELDS;
    if (required.some((k) => !String(form[k]).trim())) {
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
      birthdate: form.birthdate || undefined,
      motherName: form.motherName || undefined,
      professionalOccupation: form.professionalOccupation || undefined,
      monthlyIncome: form.monthlyIncome ? Number(form.monthlyIncome) : undefined,
      bank: form.bank,
      branchNumber: form.branchNumber,
      branchCheckDigit: form.branchCheckDigit || undefined,
      accountNumber: form.accountNumber,
      accountCheckDigit: form.accountCheckDigit,
      accountType: form.accountType,
      street: form.street || undefined,
      streetNumber: form.streetNumber || undefined,
      complement: form.complement || undefined,
      neighborhood: form.neighborhood || undefined,
      city: form.city || undefined,
      state: form.state || undefined,
      zipCode: form.zipCode || undefined,
    });
    setSaving(false);
    if (r.ok) {
      toast(t("pgRecipientCreated"));
      onClose();
    } else {
      const e = r.error || "";
      setErr(
        e === "invalid"
          ? t("pgFillRequired")
          : /split/i.test(e)
            ? t("pgSplitDisabled")
            : e || t("pgError"),
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/60 md:items-center md:p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-t-2xl bg-white p-5 md:rounded-2xl"
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
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    type: v as Form["type"],
                    document: formatDoc(f.document, v as Form["type"]),
                  }))
                }
                options={[
                  { value: "individual", label: t("pgIndividual") },
                  { value: "corporation", label: t("pgCorporation") },
                ]}
              />
            </F>
            <F req label={t("pgDocument")}>
              <Input
                value={form.document}
                onChange={(e) => set("document", formatDoc(e.target.value, form.type))}
                inputMode="numeric"
                placeholder={isPF ? "000.000.000-00" : "00.000.000/0000-00"}
              />
            </F>
            <F req className="col-span-2" label={t("pgName")}>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
            </F>
            <F req label={t("pgEmail")}>
              <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
            </F>
            <F req label={t("pgPhone")}>
              <Input value={form.phone} onChange={(e) => set("phone", formatPhone(e.target.value))} inputMode="tel" placeholder="(47) 99999-9999" />
            </F>
            <F req label={isPF ? t("pgBirthdate") : t("pgFounding")}>
              <Input type="date" value={form.birthdate} onChange={(e) => set("birthdate", e.target.value)} />
            </F>
            {isPF && (
              <>
                <F req label={t("pgOccupation")}>
                  <Input value={form.professionalOccupation} onChange={(e) => set("professionalOccupation", e.target.value)} />
                </F>
                <F req className="col-span-2" label={t("pgMother")}>
                  <Input value={form.motherName} onChange={(e) => set("motherName", e.target.value)} />
                </F>
                <F req label={t("pgIncome")}>
                  <Input value={form.monthlyIncome} onChange={(e) => set("monthlyIncome", onlyDigits(e.target.value))} inputMode="numeric" placeholder="Ex: 5000" />
                </F>
              </>
            )}
          </div>

          <p className="m-0 mt-1 text-[11px] font-bold uppercase tracking-wide text-ink/40">{t("pgBankTitle")}</p>
          <div className="grid grid-cols-2 gap-2">
            <F req label={t("pgBank")}>
              <Input value={form.bank} onChange={(e) => set("bank", onlyDigits(e.target.value).slice(0, 3))} inputMode="numeric" placeholder="Ex: 341" />
            </F>
            <F label={t("pgAccountType")}>
              <MiniDd
                value={form.accountType}
                onChange={(v) => set("accountType", v)}
                options={[
                  { value: "checking", label: t("pgChecking") },
                  { value: "savings", label: t("pgSavings") },
                ]}
              />
            </F>
            <F req label={t("pgBranch")}>
              <Input value={form.branchNumber} onChange={(e) => set("branchNumber", onlyDigits(e.target.value))} inputMode="numeric" placeholder="0001" />
            </F>
            <F label={t("pgBranchDigit")}>
              <Input value={form.branchCheckDigit} onChange={(e) => set("branchCheckDigit", e.target.value)} placeholder="—" />
            </F>
            <F req label={t("pgAccount")}>
              <Input value={form.accountNumber} onChange={(e) => set("accountNumber", onlyDigits(e.target.value))} inputMode="numeric" placeholder="12345" />
            </F>
            <F req label={t("pgAccountDigit")}>
              <Input value={form.accountCheckDigit} onChange={(e) => set("accountCheckDigit", e.target.value)} placeholder="6" />
            </F>
          </div>

          <p className="m-0 mt-1 text-[11px] font-bold uppercase tracking-wide text-ink/40">{t("pgAddressTitle")}</p>
          <div className="grid grid-cols-2 gap-2">
            <F req className="col-span-2" label={t("pgStreet")}>
              <Input value={form.street} onChange={(e) => set("street", e.target.value)} />
            </F>
            <F req label={t("pgStreetNumber")}>
              <Input value={form.streetNumber} onChange={(e) => set("streetNumber", e.target.value)} />
            </F>
            <F label={t("pgComplement")}>
              <Input value={form.complement} onChange={(e) => set("complement", e.target.value)} placeholder={t("pgComplementPh")} />
            </F>
            <F req label={t("pgNeighborhood")}>
              <Input value={form.neighborhood} onChange={(e) => set("neighborhood", e.target.value)} />
            </F>
            <F req label={t("pgCity")}>
              <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
            </F>
            <F req label={t("pgState")}>
              <Input value={form.state} onChange={(e) => set("state", e.target.value.toUpperCase().slice(0, 2))} placeholder="SC" />
            </F>
            <F req label={t("pgZip")}>
              <Input value={form.zipCode} onChange={(e) => set("zipCode", onlyDigits(e.target.value).slice(0, 8))} inputMode="numeric" placeholder="88300000" />
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

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 mb-2 text-[11px] font-bold uppercase tracking-wide text-ink/45">{children}</p>
  );
}

function F({
  label,
  req,
  children,
  className,
}: {
  label: string;
  req?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-[11px] font-medium text-ink/55">
        {label}
        {req && <span className="text-coral"> *</span>}
      </span>
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
          <Icon name="expand_more" size={15} className="text-ink/40 transition-transform duration-150" style={{ transform: open ? "rotate(180deg)" : "none" }} />
        </button>
      )}
    />
  );
}
