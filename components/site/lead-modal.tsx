"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { createLeadAction } from "@/lib/actions/site";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Icon } from "@/components/ui/Icon";
import { Input, Textarea } from "@/components/ui/Input";

type LeadModalContextValue = { openLead: () => void };

const LeadModalContext = createContext<LeadModalContextValue | null>(null);

export function useLeadModal(): LeadModalContextValue {
  const ctx = useContext(LeadModalContext);
  if (!ctx) throw new Error("useLeadModal must be used within <LeadModalProvider>");
  return ctx;
}

export function LeadModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openLead = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  return (
    <LeadModalContext.Provider value={{ openLead }}>
      {children}
      {open && <LeadModal onClose={close} />}
    </LeadModalContext.Provider>
  );
}

type LeadForm = {
  name: string;
  owner: string;
  city: string;
  whatsapp: string;
  email: string;
  type: string;
  message: string;
};

function LeadModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("leadModal");
  const types = t.raw("types") as string[];
  const [form, setForm] = useState<LeadForm>(() => ({
    name: "",
    owner: "",
    city: "",
    whatsapp: "",
    email: "",
    type: types[0],
    message: "",
  }));
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const [, startTransition] = useTransition();
  const valid = Boolean(form.name && form.owner && form.whatsapp && form.email);

  // Lock body scroll + close on Escape while open.
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

  const set = (k: keyof LeadForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!valid || sending) return;
    setSending(true);
    setError(false);
    startTransition(async () => {
      const r = await createLeadAction(form);
      setSending(false);
      if (r.ok) setSent(true);
      else setError(true);
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm"
    >
      <div className="box-border max-h-[92vh] w-full max-w-[440px] overflow-y-auto rounded-2xl bg-white p-6 text-ink shadow-modal">
        {sent ? (
          <div className="py-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#10b981] text-white">
              <Icon name="check" size={36} className="text-white" />
            </div>
            <h2 className="m-0 font-display text-2xl font-bold">
              {t("successTitle")}
            </h2>
            <p className="mt-2 text-sm text-ink/60">{t("successText")}</p>
            <Button
              variant="ink"
              shape="rounded"
              block
              onClick={onClose}
              className="mt-5 py-3"
            >
              {t("close")}
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="m-0 flex items-center gap-2 font-display text-2xl font-bold">
                <Icon name="storefront" size={20} className="text-coral" />
                {t("title")}
              </h2>
              <button
                type="button"
                aria-label={t("close")}
                onClick={onClose}
                className="p-0 text-ink/40"
              >
                <Icon name="close" size={22} />
              </button>
            </div>
            <p className="mb-4 text-xs text-ink/50">{t("subtitle")}</p>

            <div className="flex flex-col gap-3">
              <Field label={t("name")}>
                <Input
                  value={form.name}
                  onChange={set("name")}
                  placeholder={t("namePlaceholder")}
                />
              </Field>
              <Field label={t("owner")}>
                <Input
                  value={form.owner}
                  onChange={set("owner")}
                  placeholder={t("ownerPlaceholder")}
                />
              </Field>
              <Field label={t("city")}>
                <Input
                  value={form.city}
                  onChange={set("city")}
                  placeholder={t("cityPlaceholder")}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field
                  label={
                    <span className="flex items-center gap-1">
                      <Icon name="chat" size={12} className="text-[#10b981]" />
                      {t("whatsapp")}
                    </span>
                  }
                >
                  <Input
                    value={form.whatsapp}
                    onChange={set("whatsapp")}
                    placeholder={t("whatsappPlaceholder")}
                  />
                </Field>
                <Field
                  label={
                    <span className="flex items-center gap-1">
                      <Icon name="mail" size={12} className="text-ocean-700" />
                      {t("email")}
                    </span>
                  }
                >
                  <Input
                    type="email"
                    value={form.email}
                    onChange={set("email")}
                    placeholder={t("emailPlaceholder")}
                  />
                </Field>
              </div>

              <div>
                <span className="text-xs font-bold text-ink/60">{t("type")}</span>
                <Dropdown
                  className="mt-1"
                  align="stretch"
                  value={form.type}
                  onChange={(v) => setForm((f) => ({ ...f, type: v }))}
                  options={types.map((v) => ({ value: v, label: v }))}
                  renderTrigger={({ open, toggle }) => (
                    <button
                      type="button"
                      onClick={toggle}
                      className="box-border flex w-full items-center justify-between gap-2 rounded-xl border-2 border-ink/15 bg-white px-3 py-2.5 text-left text-sm font-semibold text-ink"
                    >
                      {form.type}
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

              <Field
                label={
                  <>
                    {t("message")}{" "}
                    <span className="font-normal text-ink/40">
                      {t("optional")}
                    </span>
                  </>
                }
              >
                <Textarea
                  rows={2}
                  value={form.message}
                  onChange={set("message")}
                  placeholder={t("messagePlaceholder")}
                />
              </Field>

              <Button
                variant={valid ? "coral" : "ink"}
                shape="rounded"
                block
                onClick={submit}
                disabled={!valid || sending}
                className={valid ? "py-3.5" : "bg-ink/20 py-3.5 text-white"}
              >
                <Icon name="mail" size={18} className="text-white" />
                {t("send")}
              </Button>
              {error && (
                <p className="m-0 text-center text-xs text-[#e11d48]">
                  {t("sendError")}
                </p>
              )}
              <p className="m-0 flex items-center justify-center gap-1 text-center text-[11px] text-ink/40">
                <Icon name="schedule" size={11} />
                {t("note")}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-ink/60">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
