"use client";

import { useState, type ReactNode } from "react";
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
  birthdate: string;
  bank: string;
  branchNumber: string;
  branchCheckDigit: string;
  accountNumber: string;
  accountCheckDigit: string;
  accountType: "checking" | "savings";
  street: string;
  streetNumber: string;
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
  bank: "",
  branchNumber: "",
  branchCheckDigit: "",
  accountNumber: "",
  accountCheckDigit: "",
  accountType: "checking",
  street: "",
  streetNumber: "",
  neighborhood: "",
  city: "",
  state: "",
  zipCode: "",
};

export function PagarmeManager() {
  const {
    gatewayPix,
    setGatewayPix,
    pagarmeReady,
    pagarmeStatus,
    createPagarmeRecipient,
    mpConnected,
    toast,
  } = usePanel();
  const t = useTranslations("panel.config");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setErr(null);
    if (!form.name || !form.document || !form.email || !form.bank || !form.accountNumber) {
      setErr(t("pgFillRequired"));
      return;
    }
    setSaving(true);
    const payload: PagarmeRecipientForm = {
      type: form.type,
      name: form.name,
      email: form.email,
      document: form.document,
      phone: form.phone || undefined,
      birthdate: form.birthdate || undefined,
      bank: form.bank,
      branchNumber: form.branchNumber,
      branchCheckDigit: form.branchCheckDigit || undefined,
      accountNumber: form.accountNumber,
      accountCheckDigit: form.accountCheckDigit,
      accountType: form.accountType,
      street: form.street || undefined,
      streetNumber: form.streetNumber || undefined,
      neighborhood: form.neighborhood || undefined,
      city: form.city || undefined,
      state: form.state || undefined,
      zipCode: form.zipCode || undefined,
    };
    const r = await createPagarmeRecipient(payload);
    setSaving(false);
    if (r.ok) {
      toast(t("pgRecipientCreated"));
      setOpen(false);
      setForm(EMPTY);
    } else {
      setErr(r.error === "invalid" ? t("pgFillRequired") : r.error || t("pgError"));
    }
  };

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
          disabled={!pagarmeReady}
          onClick={() => pagarmeReady && setGatewayPix("PAGARME")}
          label="Pagar.me"
          status={pagarmeReady ? t("pgRecipientReady") : t("pgNeedsRecipient")}
        />
      </div>

      {/* Recebedor Pagar.me — status ou onboarding */}
      <div className="mt-4 border-t border-ink/10 pt-3">
        <SectionLabel>{t("pgSectionTitle")}</SectionLabel>
        {pagarmeReady ? (
          <p className="m-0 flex items-center gap-1.5 text-xs font-medium text-[#059669]">
            <Icon name="check_circle" size={14} />
            {t("pgRecipientActive", { status: pagarmeStatus || "registration" })}
          </p>
        ) : !open ? (
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
        ) : (
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
                <Input value={form.document} onChange={(e) => set("document", e.target.value)} placeholder={form.type === "individual" ? "CPF" : "CNPJ"} />
              </F>
              <F className="col-span-2" label={t("pgName")}>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
              </F>
              <F label={t("pgEmail")}>
                <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
              </F>
              <F label={t("pgPhone")}>
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(47) 99999-9999" />
              </F>
              <F label={form.type === "individual" ? t("pgBirthdate") : t("pgFounding")}>
                <Input value={form.birthdate} onChange={(e) => set("birthdate", e.target.value)} placeholder="AAAA-MM-DD" />
              </F>
            </div>

            <p className="m-0 mt-1 text-[11px] font-bold uppercase tracking-wide text-ink/40">
              {t("pgBankTitle")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <F label={t("pgBank")}>
                <Input value={form.bank} onChange={(e) => set("bank", e.target.value)} placeholder="Ex: 341" />
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
              <F label={t("pgBranch")}>
                <Input value={form.branchNumber} onChange={(e) => set("branchNumber", e.target.value)} placeholder="0001" />
              </F>
              <F label={t("pgBranchDigit")}>
                <Input value={form.branchCheckDigit} onChange={(e) => set("branchCheckDigit", e.target.value)} placeholder="—" />
              </F>
              <F label={t("pgAccount")}>
                <Input value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} placeholder="12345" />
              </F>
              <F label={t("pgAccountDigit")}>
                <Input value={form.accountCheckDigit} onChange={(e) => set("accountCheckDigit", e.target.value)} placeholder="6" />
              </F>
            </div>

            <p className="m-0 mt-1 text-[11px] font-bold uppercase tracking-wide text-ink/40">
              {t("pgAddressTitle")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <F className="col-span-2" label={t("pgStreet")}>
                <Input value={form.street} onChange={(e) => set("street", e.target.value)} />
              </F>
              <F label={t("pgStreetNumber")}>
                <Input value={form.streetNumber} onChange={(e) => set("streetNumber", e.target.value)} />
              </F>
              <F label={t("pgNeighborhood")}>
                <Input value={form.neighborhood} onChange={(e) => set("neighborhood", e.target.value)} />
              </F>
              <F label={t("pgCity")}>
                <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
              </F>
              <F label={t("pgState")}>
                <Input value={form.state} onChange={(e) => set("state", e.target.value)} placeholder="SC" />
              </F>
              <F label={t("pgZip")}>
                <Input value={form.zipCode} onChange={(e) => set("zipCode", e.target.value)} placeholder="88300-000" />
              </F>
            </div>

            {err && <p className="m-0 text-xs font-medium text-[#e11d48]">{err}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submit}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-xs font-bold text-sand disabled:opacity-50"
              >
                {saving ? <Icon name="hourglass_empty" size={14} /> : <Icon name="check" size={14} />}
                {saving ? t("pgSaving") : t("pgSubmit")}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-ink/[0.06] px-3 py-2 text-xs font-bold text-ink/60"
              >
                {t("pgCancel")}
              </button>
            </div>
          </div>
        )}
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
