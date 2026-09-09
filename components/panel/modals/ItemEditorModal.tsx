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

// Estado de edição dos adicionais (números como string enquanto se digita).
type OptForm = { key: string; name: string; priceDelta: string };
type GroupForm = {
  key: string;
  name: string;
  required: boolean;
  minSelect: string;
  maxSelect: string;
  options: OptForm[];
};
const rid = () => Math.random().toString(36).slice(2, 9);
const toInt = (x: string) => Math.max(0, parseInt(x, 10) || 0);

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
  const [groups, setGroups] = useState<GroupForm[]>(() =>
    (item?.groups ?? []).map((g) => ({
      key: rid(),
      name: g.name,
      required: g.required,
      minSelect: String(g.minSelect),
      maxSelect: String(g.maxSelect),
      options: g.options.map((o) => ({
        key: rid(),
        name: o.name,
        priceDelta: o.priceDelta ? String(o.priceDelta) : "",
      })),
    })),
  );

  const patchGroup = (key: string, patch: Partial<GroupForm>) =>
    setGroups((gs) => gs.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  const addGroup = () =>
    setGroups((gs) => [
      ...gs,
      { key: rid(), name: "", required: false, minSelect: "0", maxSelect: "1", options: [{ key: rid(), name: "", priceDelta: "" }] },
    ]);
  const removeGroup = (key: string) => setGroups((gs) => gs.filter((g) => g.key !== key));
  const addOption = (gKey: string) =>
    patchGroupOptions(gKey, (os) => [...os, { key: rid(), name: "", priceDelta: "" }]);
  const removeOption = (gKey: string, oKey: string) =>
    patchGroupOptions(gKey, (os) => os.filter((o) => o.key !== oKey));
  const patchOption = (gKey: string, oKey: string, patch: Partial<OptForm>) =>
    patchGroupOptions(gKey, (os) => os.map((o) => (o.key === oKey ? { ...o, ...patch } : o)));
  function patchGroupOptions(gKey: string, fn: (os: OptForm[]) => OptForm[]) {
    setGroups((gs) => gs.map((g) => (g.key === gKey ? { ...g, options: fn(g.options) } : g)));
  }

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
    // Só grupos com nome e ao menos uma opção nomeada vão pro backend.
    const cleanGroups = groups
      .map((g) => {
        const opts = g.options
          .filter((o) => o.name.trim())
          .map((o) => ({ id: o.key, name: o.name.trim(), priceDelta: num(o.priceDelta), active: true }));
        const min = toInt(g.minSelect);
        const max = Math.max(1, toInt(g.maxSelect));
        return {
          id: g.key,
          name: g.name.trim(),
          required: g.required,
          minSelect: Math.min(min, max),
          maxSelect: max,
          options: opts,
        };
      })
      .filter((g) => g.name && g.options.length > 0);
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
      groups: cleanGroups,
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

          <div className="border-t border-ink/10 pt-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-ink/70">{t("addons")}</span>
              <button
                type="button"
                onClick={addGroup}
                className="flex items-center gap-1 rounded-lg bg-dune-50 px-2 py-1 text-xs font-medium text-ink/70"
              >
                <Icon name="add" size={14} />
                {t("addGroup")}
              </button>
            </div>
            <p className="m-0 mb-2 text-[11px] leading-snug text-ink/40">{t("addonsHint")}</p>

            <div className="flex flex-col gap-3">
              {groups.map((g) => (
                <div key={g.key} className="rounded-xl border border-ink/15 bg-dune-50/40 p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      value={g.name}
                      onChange={(e) => patchGroup(g.key, { name: e.target.value })}
                      placeholder={t("groupNamePlaceholder")}
                    />
                    <button
                      type="button"
                      aria-label={t("removeGroup")}
                      onClick={() => removeGroup(g.key)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#fef2f2] text-[#ef4444]"
                    >
                      <Icon name="delete" size={16} />
                    </button>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-ink/70">
                      <input
                        type="checkbox"
                        checked={g.required}
                        onChange={(e) => patchGroup(g.key, { required: e.target.checked })}
                        className="h-4 w-4 accent-coral"
                      />
                      {t("required")}
                    </label>
                    <label className="flex items-center gap-1 text-xs text-ink/60">
                      {t("min")}
                      <input
                        inputMode="numeric"
                        value={g.minSelect}
                        onChange={(e) => patchGroup(g.key, { minSelect: e.target.value.replace(/\D/g, "") })}
                        className="w-12 rounded-lg border-2 border-ink/15 bg-white px-2 py-1 text-center text-sm"
                      />
                    </label>
                    <label className="flex items-center gap-1 text-xs text-ink/60">
                      {t("max")}
                      <input
                        inputMode="numeric"
                        value={g.maxSelect}
                        onChange={(e) => patchGroup(g.key, { maxSelect: e.target.value.replace(/\D/g, "") })}
                        className="w-12 rounded-lg border-2 border-ink/15 bg-white px-2 py-1 text-center text-sm"
                      />
                    </label>
                  </div>

                  <div className="mt-2 flex flex-col gap-2">
                    {g.options.map((o) => (
                      <div key={o.key} className="flex items-center gap-2">
                        <div className="flex-1">
                          <Input
                            value={o.name}
                            onChange={(e) => patchOption(g.key, o.key, { name: e.target.value })}
                            placeholder={t("optionNamePlaceholder")}
                          />
                        </div>
                        <div className="flex w-24 shrink-0 items-center gap-1 rounded-xl border-2 border-ink/15 bg-white px-2">
                          <span className="text-xs text-ink/40">+R$</span>
                          <input
                            inputMode="decimal"
                            value={o.priceDelta}
                            onChange={(e) => patchOption(g.key, o.key, { priceDelta: e.target.value })}
                            placeholder="0"
                            className="w-full bg-transparent py-2 text-sm outline-none"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeOption(g.key, o.key)}
                          aria-label="×"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-ink/40"
                        >
                          <Icon name="close" size={16} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addOption(g.key)}
                      className="flex items-center gap-1 self-start py-1 text-xs font-medium text-coral"
                    >
                      <Icon name="add" size={14} />
                      {t("addOption")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
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
