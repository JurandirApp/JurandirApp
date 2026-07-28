"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { Input, Textarea } from "@/components/ui/Input";
import { COVER_IMG, type ProfileForm } from "@/lib/data/panel";
import { usePanel } from "../context";

export function PerfilSection() {
  const { profile, setProfile, profSaved, saveProfile, demoPhoto, beach } =
    usePanel();
  const t = useTranslations("panel.perfil");

  const bind = (k: keyof ProfileForm) => ({
    value: profile[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setProfile(k, e.target.value),
  });

  return (
    <div className="flex max-w-[640px] flex-col gap-4">
      {/* Preview */}
      <div className="rounded-2xl border-2 border-ink bg-white p-4 shadow-hard">
        <h2 className="m-0 mb-3 font-display text-[15px] font-semibold text-ink/70">
          {t("previewTitle")}
        </h2>
        <div className="relative h-40 overflow-hidden rounded-2xl bg-gradient-to-br from-ocean to-ocean-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={COVER_IMG}
            alt=""
            className="block h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 text-white">
            <h3 className="m-0 font-display text-xl font-extrabold">
              {profile.name}
            </h3>
            <p className="m-0 mt-0.5 text-xs text-white/90">{profile.tagline}</p>
            <p className="m-0 mt-1.5 flex items-center gap-1 text-[11px] text-white/80">
              <Icon name="location_on" size={12} />
              {profile.address}
            </p>
            <p className="m-0 mt-0.5 flex items-center gap-1 text-[11px] text-white/80">
              <Icon name="schedule" size={12} />
              {profile.hours}
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={demoPhoto}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-dune-50 p-2.5 text-sm font-medium text-ink/70"
          >
            <Icon name="photo_camera" size={16} />
            {t("photo")}
          </button>
          <button
            type="button"
            onClick={demoPhoto}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-dune-50 p-2.5 text-sm font-medium text-ink/70"
          >
            <Icon name="storefront" size={16} />
            {t("logo")}
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="flex flex-col gap-3 rounded-2xl border-2 border-ink bg-white p-4 shadow-hard">
        <Field label={t("name")}>
          <Input {...bind("name")} />
        </Field>
        <Field label={t("tagline")}>
          <Input {...bind("tagline")} />
        </Field>
        <Field label={t("desc")}>
          <Textarea rows={3} {...bind("desc")} />
        </Field>
        <Field label={t("address")}>
          <Input {...bind("address")} />
        </Field>
        <Field label={t("hours")}>
          <Input {...bind("hours")} />
        </Field>

        <Field
          label={
            <span className="flex items-center gap-1">
              <Icon name="percent" size={13} className="text-coral" />
              {t("serviceFee")}
            </span>
          }
          hint={t("serviceFeeHint")}
        >
          <Suffix suffix="%">
            <Input {...bind("serviceFee")} placeholder="10" className="pr-10" />
          </Suffix>
        </Field>

        {beach && (
          <Field
            label={
              <span className="flex items-center gap-1">
                <Icon name="near_me" size={13} className="text-coral" />
                {t("radius")}
              </span>
            }
            hint={t("radiusHint")}
          >
            <Suffix suffix={t("meters")}>
              <Input {...bind("radius")} placeholder="Ex: 500" className="pr-16" />
            </Suffix>
          </Field>
        )}

        <div className="border-t border-ink/10 pt-2">
          <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">
            {t("contact")}
          </p>
          <div className="flex flex-col gap-3">
            <Field
              label={
                <span className="flex items-center gap-1">
                  <Icon name="call" size={13} className="text-ocean-700" />
                  {t("phone")}
                </span>
              }
            >
              <Input {...bind("phone")} />
            </Field>
            <Field
              label={
                <span className="flex items-center gap-1">
                  <Icon name="mail" size={13} className="text-ocean-700" />
                  {t("email")}
                </span>
              }
            >
              <Input {...bind("email")} />
            </Field>
            <Field
              label={
                <span className="flex items-center gap-1">
                  <Icon name="language" size={13} className="text-ocean-700" />
                  {t("website")}
                </span>
              }
            >
              <Input {...bind("website")} />
            </Field>
            <Field
              label={
                <span className="flex items-center gap-1">
                  <Icon name="chat" size={13} className="text-[#059669]" />
                  {t("whatsapp")}
                </span>
              }
            >
              <Input {...bind("whatsapp")} />
            </Field>
            <Field
              label={
                <span className="flex items-center gap-1">
                  <Icon name="alternate_email" size={13} className="text-[#ec4899]" />
                  {t("instagram")}
                </span>
              }
            >
              <Input {...bind("instagram")} />
            </Field>
          </div>
        </div>

        <button
          type="button"
          onClick={saveProfile}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl p-3 text-[15px] font-semibold"
          style={{
            background: profSaved ? "#10b981" : "#141821",
            color: profSaved ? "#fff" : "#EDD8A3",
          }}
        >
          {profSaved ? (
            <>
              <Icon name="check" size={16} />
              {t("saved")}
            </>
          ) : (
            t("save")
          )}
        </button>
        <p className="m-0 text-center text-xs text-ink/40">{t("hint")}</p>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink/60">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <p className="m-0 mt-1 text-[11px] text-ink/40">{hint}</p>}
    </label>
  );
}

function Suffix({ suffix, children }: { suffix: string; children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-ink/40">
        {suffix}
      </span>
    </div>
  );
}
