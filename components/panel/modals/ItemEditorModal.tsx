"use client";

import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Dropdown } from "@/components/ui/Dropdown";
import { Icon } from "@/components/ui/Icon";
import { Input, Textarea } from "@/components/ui/Input";
import { signItemPhotoUploadAction } from "@/lib/actions/panel";
import { CATS, type MenuItem } from "@/lib/data/panel";

const CN = Object.keys(CATS);
const UNITS = ["g", "kg", "ml", "L"];
const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB
const num = (x: string) => parseFloat(String(x).replace(",", ".")) || 0;

type Form = {
  name: string;
  desc: string;
  price: string;
  old: string;
  measure: string;
  unit: string;
  cat: string;
  sub: string;
  photo: string;
};

export function ItemEditorModal({
  item,
  onSave,
  onClose,
  onToast,
}: {
  item: MenuItem | null;
  onSave: (item: MenuItem) => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const tp = useTranslations("panel");
  const t = useTranslations("panel.editor");
  const [form, setForm] = useState<Form>(() => ({
    name: item?.name ?? "",
    desc: item?.desc ?? "",
    price: item ? String(item.price) : "",
    old: item?.old ? String(item.old) : "",
    measure: item?.measure ? String(item.measure) : "",
    unit: item?.unit ?? "g",
    cat: item?.cat ?? "Bebidas",
    sub: item?.sub ?? "Drinks",
    photo: item?.photo ?? "",
  }));
  const [uploading, setUploading] = useState(false);

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
  const pickCat = (c: string) =>
    setForm((f) => ({ ...f, cat: c, sub: CATS[c][0] }));

  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-selecionar o mesmo arquivo
    if (!file) return;
    if (!file.type.startsWith("image/")) return onToast(t("photoInvalid"));
    if (file.size > MAX_PHOTO_BYTES) return onToast(t("photoTooLarge"));

    setUploading(true);
    try {
      const signed = await signItemPhotoUploadAction();
      if (!signed) return onToast(t("photoNotConfigured"));

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
      set("photo", data.secure_url);
    } catch {
      onToast(t("photoUploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  const save = () => {
    if (!form.name.trim()) return onToast(tp("toasts.nameRequired"));
    onSave({
      id: item?.id ?? Date.now(),
      dbId: item?.dbId,
      name: form.name,
      desc: form.desc,
      price: num(form.price),
      old: form.old ? num(form.old) : null,
      photo: form.photo,
      measure: form.measure ? num(form.measure) : null,
      unit: form.unit,
      cat: form.cat,
      sub: form.sub,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4">
      <div className="box-border max-h-[88vh] w-full max-w-[440px] overflow-y-auto rounded-2xl bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="m-0 font-display text-lg font-bold">
            {item ? t("titleEdit") : t("titleNew")}
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
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder={t("namePlaceholder")}
            />
          </Field>
          <Field label={t("desc")}>
            <Textarea
              rows={2}
              value={form.desc}
              onChange={(e) => set("desc", e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("price")}>
              <Input
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
                placeholder="22,00"
              />
            </Field>
            <Field label={t("oldPrice")}>
              <Input
                value={form.old}
                onChange={(e) => set("old", e.target.value)}
                placeholder="28,00"
              />
            </Field>
          </div>

          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label={t("measure")}>
              <Input
                value={form.measure}
                onChange={(e) => set("measure", e.target.value)}
                placeholder="300"
              />
            </Field>
            <FieldDd
              label={t("unit")}
              value={form.unit}
              options={UNITS}
              onChange={(v) => set("unit", v)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FieldDd
              label={t("category")}
              value={form.cat}
              options={CN}
              onChange={pickCat}
              labelFor={(v) => tp(`cat.${v}`)}
            />
            <FieldDd
              label={t("subcategory")}
              value={form.sub}
              options={CATS[form.cat]}
              onChange={(v) => set("sub", v)}
              labelFor={(v) => tp(`sub.${v}`)}
            />
          </div>

          <div>
            <span className="text-xs font-medium text-ink/60">{t("photo")}</span>
            <label
              className={`mt-1 flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-ink/15 p-3 text-xs text-ink/50 hover:border-ink/30 ${
                uploading ? "pointer-events-none opacity-60" : ""
              }`}
            >
              {form.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.photo}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-lg border border-ink/10 object-cover"
                />
              ) : (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-dune-50 text-ink/40">
                  <Icon name={uploading ? "hourglass_empty" : "photo_camera"} size={22} />
                </span>
              )}
              <span className="flex-1">
                {uploading
                  ? t("photoUploading")
                  : form.photo
                    ? t("photoChange")
                    : t("photoPick")}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPickFile}
                disabled={uploading}
              />
            </label>
          </div>

          <button
            type="button"
            onClick={save}
            className="w-full rounded-xl bg-coral p-3 text-[15px] font-semibold text-white"
          >
            {t("save")}
          </button>
        </div>
      </div>
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

function FieldDd({
  label,
  value,
  options,
  onChange,
  labelFor = (v) => v,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  labelFor?: (v: string) => string;
}) {
  return (
    <div>
      <span className="text-xs font-medium text-ink/60">{label}</span>
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
