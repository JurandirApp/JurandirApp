"use client";

import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Dropdown } from "@/components/ui/Dropdown";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { signEstablishmentLogoUploadAction } from "@/lib/actions/admin";
import { BEACH_TYPES, EST_TYPES, PLANS, type AdminEst } from "@/lib/data/admin";

const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5 MB

export type RegPayload = {
  name: string;
  owner: string;
  tipo: string;
  city: string;
  neigh: string;
  posto: string;
  radius: string;
  plan: string;
  fee: string;
  user: string;
  password: string;
  phone: string;
  email: string;
  website: string;
  whatsapp: string;
  instagram: string;
  logoImg: string;
};

type Form = Omit<RegPayload, "neigh"> & { neighborhood: string };

export function RegEditorModal({
  est,
  onSave,
  onClose,
  error,
}: {
  est: AdminEst | null;
  onSave: (payload: RegPayload, id: string | null) => void;
  onClose: () => void;
  error?: string | null;
}) {
  const t = useTranslations("admin.editor");
  const tTipo = useTranslations("admin.tipo");
  const tPlan = useTranslations("admin.plan");
  const [form, setForm] = useState<Form>(() =>
    est
      ? {
          name: est.name,
          owner: est.owner,
          tipo: est.tipo,
          city: est.city,
          neighborhood: est.neigh,
          posto: est.posto,
          radius: est.radius,
          plan: est.plan,
          fee: String(est.fee),
          user: est.user,
          password: est.password,
          phone: est.phone,
          email: est.email,
          website: est.website,
          whatsapp: est.whatsapp,
          instagram: est.instagram,
          logoImg: est.logoImg ?? "",
        }
      : {
          name: "", owner: "", tipo: "Restaurante", city: "", neighborhood: "",
          posto: "", radius: "", plan: "Básico", fee: "5", user: "", password: "",
          phone: "", email: "", website: "", whatsapp: "", instagram: "", logoImg: "",
        },
  );
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoErr, setLogoErr] = useState<string | null>(null);

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

  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onPickLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setLogoErr(t("logoInvalid"));
    if (file.size > MAX_LOGO_BYTES) return setLogoErr(t("logoTooLarge"));
    setLogoErr(null);
    setLogoUploading(true);
    try {
      const signed = await signEstablishmentLogoUploadAction();
      if (!signed) return setLogoErr(t("logoNotConfigured"));
      const body = new FormData();
      body.append("file", file);
      body.append("api_key", signed.apiKey);
      body.append("timestamp", String(signed.timestamp));
      body.append("folder", signed.folder);
      body.append("signature", signed.signature);
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`,
        { method: "POST", body },
      );
      if (!res.ok) throw new Error("upload-failed");
      const data = (await res.json()) as { secure_url?: string };
      if (!data.secure_url) throw new Error("no-url");
      set("logoImg", data.secure_url);
    } catch {
      setLogoErr(t("logoUploadFailed"));
    } finally {
      setLogoUploading(false);
    }
  };

  const beach = BEACH_TYPES.includes(form.tipo);
  const pwShort = form.password.length > 0 && form.password.length < 6;
  const valid = Boolean(
    form.name && form.owner && form.user && !pwShort && (est || form.password.length >= 6),
  );

  const save = () => {
    if (!valid) return;
    onSave(
      {
        name: form.name,
        owner: form.owner,
        tipo: form.tipo,
        city: form.city || "—",
        neigh: form.neighborhood,
        posto: form.posto,
        radius: form.radius,
        plan: form.plan,
        fee: form.fee,
        user: form.user,
        password: form.password,
        phone: form.phone,
        email: form.email,
        website: form.website,
        whatsapp: form.whatsapp,
        instagram: form.instagram,
        logoImg: form.logoImg,
      },
      est?.id ?? null,
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="box-border max-h-[92vh] w-full max-w-[440px] overflow-y-auto rounded-2xl bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="m-0 font-display text-lg font-extrabold">
            {est ? t("titleEdit") : t("titleNew")}
          </h2>
          <button
            type="button"
            aria-label={t("close")}
            onClick={onClose}
            className="bg-transparent p-0 text-ink/40"
          >
            <Icon name="close" size={22} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <Field label={t("name")}>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={t("namePh")} />
          </Field>
          <Field label={t("owner")}>
            <Input value={form.owner} onChange={(e) => set("owner", e.target.value)} placeholder={t("ownerPh")} />
          </Field>

          <Field label={<IconLabel icon="storefront" color="#FF6B4A">{t("logo")}</IconLabel>}>
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-ink/15 p-2.5 text-xs text-ink/50 hover:border-ink/30 ${
                logoUploading ? "pointer-events-none opacity-60" : ""
              }`}
            >
              {form.logoImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.logoImg}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-lg border border-ink/10 object-cover"
                />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-dune-50 text-ink/40">
                  <Icon name={logoUploading ? "hourglass_empty" : "storefront"} size={20} />
                </span>
              )}
              <span className="flex-1">
                {logoUploading
                  ? t("logoUploading")
                  : form.logoImg
                    ? t("logoChange")
                    : t("logoPick")}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPickLogo}
                disabled={logoUploading}
              />
            </label>
            {logoErr && <p className="m-0 mt-1 text-[11px] text-[#e11d48]">{logoErr}</p>}
          </Field>

          <DdField
            label={<IconLabel icon="storefront" color="#FF6B4A">{t("tipo")}</IconLabel>}
            value={form.tipo}
            options={EST_TYPES}
            onChange={(v) => set("tipo", v)}
            labelFor={(v) => tTipo(v)}
          />

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("city")}>
              <Input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder={t("cityPh")} />
            </Field>
            <Field label={t("neighborhood")}>
              <Input value={form.neighborhood} onChange={(e) => set("neighborhood", e.target.value)} placeholder={t("neighborhoodPh")} />
            </Field>
          </div>

          {beach && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={<IconLabel icon="location_on" color="#FF6B4A">{t("posto")}</IconLabel>}>
                <Input value={form.posto} onChange={(e) => set("posto", e.target.value)} placeholder={t("postoPh")} />
              </Field>
              <Field label={<IconLabel icon="near_me" color="#FF6B4A">{t("radius")}</IconLabel>}>
                <Input value={form.radius} onChange={(e) => set("radius", e.target.value)} placeholder={t("radiusPh")} />
              </Field>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <DdField label={t("plan")} value={form.plan} options={PLANS} onChange={(v) => set("plan", v)} labelFor={(v) => tPlan(v)} />
            <Field label={t("fee")}>
              <Input value={form.fee} onChange={(e) => set("fee", e.target.value)} />
            </Field>
          </div>

          <SectionLabel>{t("access")}</SectionLabel>
          <Field label={<IconLabel icon="person" color="#0C6A70">{t("user")}</IconLabel>}>
            <Input value={form.user} onChange={(e) => set("user", e.target.value)} placeholder={t("userPh")} />
          </Field>
          <Field
            label={
              <IconLabel icon="lock" color="#0C6A70">
                {t("password")}
                {est ? <span className="font-normal normal-case text-ink/40"> {t("pwKeep")}</span> : null}
              </IconLabel>
            }
          >
            <Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder={t("passwordPh")} />
          </Field>

          <SectionLabel>{t("contact")}</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <Field label={<IconLabel icon="call" color="#0C6A70">{t("phone")}</IconLabel>}>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder={t("phonePh")} />
            </Field>
            <Field label={<IconLabel icon="chat" color="#059669">{t("whatsapp")}</IconLabel>}>
              <Input value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} placeholder={t("whatsappPh")} />
            </Field>
          </div>
          <Field label={<IconLabel icon="mail" color="#0C6A70">{t("email")}</IconLabel>}>
            <Input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder={t("emailPh")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={<IconLabel icon="language" color="#0C6A70">{t("website")}</IconLabel>}>
              <Input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder={t("websitePh")} />
            </Field>
            <Field label={<IconLabel icon="alternate_email" color="#ec4899">{t("instagram")}</IconLabel>}>
              <Input value={form.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder={t("instagramPh")} />
            </Field>
          </div>

          {pwShort && (
            <p className="m-0 text-[11px] text-[#e11d48]">{t("pwShort")}</p>
          )}
          {error && (
            <p className="m-0 text-xs text-[#e11d48]">{t(error)}</p>
          )}
          <button
            type="button"
            onClick={save}
            disabled={!valid}
            className="w-full rounded-xl p-3 text-[15px] font-bold text-white"
            style={{ background: valid ? "#FF6B4A" : "rgba(20,24,33,.2)" }}
          >
            {est ? t("saveEdit") : t("saveNew")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-ink/60">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 mt-1 text-xs font-bold uppercase tracking-[.05em] text-ink/50">
      {children}
    </p>
  );
}

function IconLabel({
  icon,
  color,
  children,
}: {
  icon: string;
  color: string;
  children: ReactNode;
}) {
  return (
    <span className="flex items-center gap-1">
      <Icon name={icon} size={13} style={{ color }} />
      {children}
    </span>
  );
}

function DdField({
  label,
  value,
  options,
  onChange,
  labelFor = (v) => v,
}: {
  label: ReactNode;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  labelFor?: (v: string) => string;
}) {
  return (
    <div>
      <span className="text-xs font-bold text-ink/60">{label}</span>
      <Dropdown
        className="mt-1"
        align="stretch"
        value={value}
        onChange={onChange}
        options={options.map((o) => ({ value: o, label: labelFor(o) }))}
        panelClassName="max-h-[240px] overflow-y-auto"
        renderTrigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            className="box-border flex w-full items-center justify-between gap-2 rounded-xl border-2 border-ink/15 bg-white px-3 py-2.5 text-left text-sm font-medium text-ink"
          >
            <span className="flex-1 truncate">{labelFor(value)}</span>
            <Icon
              name="expand_more"
              size={16}
              className="text-ink/40 transition-transform duration-150"
              style={{ transform: open ? "rotate(180deg)" : "none" }}
            />
          </button>
        )}
      />
    </div>
  );
}
