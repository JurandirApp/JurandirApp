"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import type { Waiter } from "@/lib/data/panel";

type Form = {
  name: string;
  user: string;
  password: string;
};

export function WaiterEditorModal({
  waiter,
  onSave,
  onClose,
  onToast,
}: {
  waiter: Waiter | null;
  onSave: (data: { id?: string; name: string; user: string; password?: string }) => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const t = useTranslations("panel.waiterEditor");
  const [form, setForm] = useState<Form>(() => ({
    name: waiter?.name ?? "",
    user: waiter?.user ?? "",
    password: "",
  }));

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

  const save = () => {
    const name = form.name.trim();
    const user = form.user.trim();
    const password = form.password.trim();
    // Validação no cliente — `upsertWaiter` usa `.parse` (não `safeParse`) e
    // lança em input inválido, então evitamos chamar a action com dados ruins.
    if (!name) return onToast(t("nameRequired"));
    if (!user) return onToast(t("userRequired"));
    if (!waiter && !password) return onToast(t("passwordRequired"));
    if (password && password.length < 4) return onToast(t("passwordTooShort"));

    onSave({
      id: waiter?.id,
      name,
      user,
      ...(password ? { password } : {}),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4">
      <div className="box-border max-h-[88vh] w-full max-w-[440px] overflow-y-auto rounded-2xl bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="m-0 font-display text-lg font-bold">
            {waiter ? t("titleEdit") : t("titleNew")}
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
          <Field label={t("user")}>
            <Input
              value={form.user}
              onChange={(e) => set("user", e.target.value)}
              placeholder={t("userPlaceholder")}
            />
          </Field>
          <Field label={t("password")} hint={waiter ? t("passwordEditHint") : undefined}>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              placeholder={waiter ? t("passwordEditPlaceholder") : t("passwordPlaceholder")}
              autoComplete="new-password"
            />
          </Field>

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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink/60">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <p className="m-0 mt-1 text-[11px] leading-snug text-ink/40">{hint}</p>}
    </label>
  );
}
