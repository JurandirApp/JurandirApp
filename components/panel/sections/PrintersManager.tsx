"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Dropdown } from "@/components/ui/Dropdown";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import {
  listPrintersAction,
  createPrinterAction,
  updatePrinterAction,
  deletePrinterAction,
  testPrintAction,
} from "@/lib/actions/panel";
import type { PanelPrinter, PrinterInput } from "@/lib/data/panel";

const EMPTY: PrinterInput = {
  name: "",
  connection: "USB",
  target: "",
  port: 9100,
  categories: [],
  isDefault: false,
  fullOrder: false,
  active: true,
};

/** CRUD das impressoras (estações). Autocontido: busca e salva via server actions,
 *  sem passar pelo contexto do painel. O roteamento por categoria é definido aqui. */
export function PrintersManager() {
  const t = useTranslations("panel.config");
  const [printers, setPrinters] = useState<PanelPrinter[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  // null = lista; "new" = criando; id = editando aquela impressora.
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<PrinterInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    listPrintersAction()
      .then((r) => {
        setPrinters(r.printers);
        setCategories(r.categories);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const reload = () =>
    listPrintersAction()
      .then((r) => {
        setPrinters(r.printers);
        setCategories(r.categories);
      })
      .catch(() => {});

  const openNew = () => {
    setForm({ ...EMPTY }); // padrão fica desmarcado — o dono escolhe manual
    setEditing("new");
    setMsg(null);
  };
  const openEdit = (p: PanelPrinter) => {
    setForm({
      name: p.name,
      connection: p.connection,
      target: p.target,
      port: p.port,
      categories: p.categories,
      isDefault: p.isDefault,
      fullOrder: p.fullOrder,
      active: p.active,
    });
    setEditing(p.id);
    setMsg(null);
  };

  const save = () => {
    setBusy(true);
    const req =
      editing === "new" ? createPrinterAction(form) : updatePrinterAction(editing!, form);
    req
      .then((r) => {
        if (r.ok) {
          setEditing(null);
          setMsg(t("printerSaved"));
          return reload();
        }
        setMsg(t("printerInvalid"));
      })
      .catch(() => setMsg(t("printerInvalid")))
      .finally(() => setBusy(false));
  };

  const remove = (p: PanelPrinter) => {
    if (!window.confirm(t("printerDeleteConfirm", { name: p.name }))) return;
    deletePrinterAction(p.id)
      .then(() => reload())
      .catch(() => {});
  };

  const test = (p: PanelPrinter) => {
    setMsg(null);
    testPrintAction(p.id)
      .then((r) =>
        setMsg(r.hasToken ? t("printerTested", { name: p.name }) : t("testQueuedNoToken")),
      )
      .catch(() => {});
  };

  const toggleCat = (c: string) =>
    setForm((f) => ({
      ...f,
      categories: f.categories.includes(c)
        ? f.categories.filter((x) => x !== c)
        : [...f.categories, c],
    }));

  const isNetwork = form.connection === "NETWORK";
  const connLabel = (c: string) => (c === "NETWORK" ? t("connNetworkLabel") : t("connUsbLabel"));

  if (loading) {
    return <p className="py-3 text-xs text-ink/40">{t("printersLoading")}</p>;
  }

  // ---- Formulário (criar/editar) ----
  if (editing) {
    return (
      <div className="mt-1">
        <div className="flex flex-col gap-3">
          <Field label={t("printerName")}>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t("printerNamePlaceholder")}
            />
          </Field>

          <Field label={t("printerConnection")}>
            <Dropdown
              align="stretch"
              value={form.connection}
              onChange={(v) => setForm((f) => ({ ...f, connection: v }))}
              options={[
                { value: "USB", label: t("connUsbLabel") },
                { value: "NETWORK", label: t("connNetworkLabel") },
              ]}
              renderTrigger={({ open, toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  className="box-border flex w-full items-center justify-between gap-2 rounded-xl border-2 border-ink/15 bg-white px-3 py-2.5 text-left text-sm font-medium text-ink"
                >
                  <span className="flex-1 truncate">{connLabel(form.connection)}</span>
                  <Icon
                    name="expand_more"
                    size={16}
                    className="text-ink/40 transition-transform duration-150"
                    style={{ transform: open ? "rotate(180deg)" : "none" }}
                  />
                </button>
              )}
            />
          </Field>

          {isNetwork ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("printerTargetNetwork")}>
                <Input
                  value={form.target}
                  onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
                  placeholder="192.168.0.50"
                />
              </Field>
              <Field label={t("port")}>
                <Input
                  value={String(form.port)}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, port: Number(e.target.value) || 9100 }))
                  }
                  placeholder="9100"
                />
              </Field>
            </div>
          ) : (
            <Field label={t("printerTargetUsb")}>
              <Input
                value={form.target}
                onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
                placeholder={t("printerTargetUsbPlaceholder")}
              />
              <p className="m-0 mt-1 text-[11px] leading-snug text-ink/45">
                {t("printerTargetUsbHint")}
              </p>
            </Field>
          )}

          <ToggleLine
            title={t("printerFullOrder")}
            sub={t("printerFullOrderHint")}
            checked={form.fullOrder}
            onChange={() => setForm((f) => ({ ...f, fullOrder: !f.fullOrder }))}
          />

          {form.fullOrder ? (
            <p className="m-0 rounded-lg bg-dune-50 p-2.5 text-[11px] leading-relaxed text-ink/55">
              {t("printerFullOrderNote")}
            </p>
          ) : (
            <>
              <div>
                <span className="text-xs font-medium text-ink/60">
                  {t("printerCategories")}
                </span>
                <p className="m-0 mb-1.5 mt-0.5 text-[11px] leading-snug text-ink/45">
                  {t("printerCategoriesHint")}
                </p>
                {categories.length === 0 ? (
                  <p className="m-0 text-[11px] text-ink/40">{t("printerNoCategories")}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map((c) => {
                      const on = form.categories.includes(c);
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => toggleCat(c)}
                          className={`rounded-full border-2 px-2.5 py-1 text-xs font-semibold transition-colors ${
                            on
                              ? "border-ocean-700 bg-ocean-700 text-white"
                              : "border-ink/15 bg-white text-ink/60"
                          }`}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <ToggleLine
                title={t("printerDefault")}
                sub={t("printerDefaultHint")}
                checked={form.isDefault}
                onChange={() => setForm((f) => ({ ...f, isDefault: !f.isDefault }))}
              />
            </>
          )}
          <ToggleLine
            title={t("printerActive")}
            sub={t("printerActiveHint")}
            checked={form.active}
            onChange={() => setForm((f) => ({ ...f, active: !f.active }))}
          />
        </div>

        {msg && <p className="m-0 mt-2 text-xs text-[#e11d48]">{msg}</p>}

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="flex-1 rounded-xl bg-dune-50 p-3 text-sm font-medium text-ink/70"
          >
            {t("printerCancel")}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="flex-1 rounded-xl bg-ink p-3 text-sm font-semibold text-sand disabled:opacity-60"
          >
            {busy ? t("printerSaving") : t("printerSave")}
          </button>
        </div>
      </div>
    );
  }

  // ---- Lista ----
  return (
    <div className="mt-1">
      {printers.length === 0 ? (
        <p className="m-0 mb-2 rounded-xl bg-dune-50 p-3 text-xs text-ink/50">
          {t("printersEmpty")}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {printers.map((p) => (
            <li key={p.id} className="rounded-xl border-2 border-ink/10 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-bold text-ink/90">{p.name}</span>
                    {p.fullOrder && (
                      <Badge bg="#ecfdf5" fg="#059669">
                        {t("printerFullOrderBadge")}
                      </Badge>
                    )}
                    {p.isDefault && (
                      <Badge bg="#eef2ff" fg="#4f46e5">
                        {t("printerDefaultBadge")}
                      </Badge>
                    )}
                    {!p.active && (
                      <Badge bg="#f3f4f6" fg="#6b7280">
                        {t("printerInactiveBadge")}
                      </Badge>
                    )}
                  </div>
                  <p className="m-0 mt-0.5 truncate text-[11px] text-ink/50">
                    {connLabel(p.connection)} · {p.target}
                    {p.connection === "NETWORK" ? `:${p.port}` : ""}
                  </p>
                  <p className="m-0 mt-1 text-[11px] text-ink/45">
                    {p.fullOrder
                      ? t("printerFullOrderList")
                      : p.categories.length
                        ? p.categories.join(", ")
                        : t("printerCategoriesFallback")}
                  </p>
                </div>
                <div className="flex flex-shrink-0 gap-1">
                  <IconBtn icon="print" title={t("testPrint")} onClick={() => test(p)} />
                  <IconBtn icon="edit" title={t("printerEdit")} onClick={() => openEdit(p)} />
                  <IconBtn
                    icon="delete"
                    title={t("printerDelete")}
                    danger
                    onClick={() => remove(p)}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {msg && <p className="m-0 mt-2 text-xs text-[#059669]">{msg}</p>}

      <button
        type="button"
        onClick={openNew}
        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-ink/20 p-2.5 text-sm font-semibold text-ink/60"
      >
        <Icon name="add" size={16} />
        {t("printerAdd")}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink/60">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function ToggleLine({
  title,
  sub,
  checked,
  onChange,
}: {
  title: string;
  sub: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="m-0 text-sm font-medium text-ink/80">{title}</p>
        <p className="m-0 text-[11px] leading-snug text-ink/45">{sub}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} aria-label={title} />
    </div>
  );
}

function Badge({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold"
      style={{ backgroundColor: bg, color: fg }}
    >
      {children}
    </span>
  );
}

function IconBtn({
  icon,
  title,
  onClick,
  danger,
}: {
  icon: string;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex h-8 w-8 items-center justify-center rounded-lg bg-dune-50 ${
        danger ? "text-[#e11d48]" : "text-ink/60"
      }`}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}
