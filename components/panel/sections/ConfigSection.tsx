"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { usePanel } from "../context";
import { PrintersManager } from "./PrintersManager";
import { PrinterSetupGuide } from "./PrinterSetupGuide";

const PRINT_STATUS_STYLE: Record<
  string,
  { bg: string; fg: string; icon: string }
> = {
  PRINTED: { bg: "#ecfdf5", fg: "#059669", icon: "check_circle" },
  FAILED: { bg: "#fef2f2", fg: "#e11d48", icon: "error" },
  PENDING: { bg: "#fffbeb", fg: "#d97706", icon: "schedule" },
};

export function ConfigSection() {
  const {
    pw,
    setPw,
    savePw,
    pwMsg,
    toggles,
    flipToggle,
    printEnabled,
    setPrintEnabled,
    hasPrintToken,
    printToken,
    generatePrintToken,
    mpConnected,
    mpResult,
    connectMp,
    disconnectMp,
    printJobs,
    refreshPrintJobs,
  } = usePanel();
  const t = useTranslations("panel.config");

  return (
    <div className="max-w-[1000px]">
      <div className="mb-[18px]">
        <h1 className="m-0 font-display text-[22px] font-extrabold tracking-[-0.01em]">
          {t("title")}
        </h1>
        <p className="m-0 mt-0.5 text-[13px] text-ink/50">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        {/* Senha */}
        <Card>
          <CardTitle icon="lock">{t("changePassword")}</CardTitle>
          <div className="flex flex-col gap-3">
            <Field label={t("currentPassword")}>
              <Input
                type="password"
                value={pw.cur}
                onChange={(e) => setPw("cur", e.target.value)}
              />
            </Field>
            <Field label={t("newPassword")}>
              <Input
                type="password"
                value={pw.nova}
                onChange={(e) => setPw("nova", e.target.value)}
                placeholder={t("newPasswordPlaceholder")}
              />
            </Field>
            <Field label={t("confirmPassword")}>
              <Input
                type="password"
                value={pw.conf}
                onChange={(e) => setPw("conf", e.target.value)}
              />
            </Field>
          </div>
          {pwMsg && (
            <p
              className="m-0 mt-2 text-xs"
              style={{ color: pwMsg.ok ? "#059669" : "#e11d48" }}
            >
              {pwMsg.t}
            </p>
          )}
          <button
            type="button"
            onClick={savePw}
            className="mt-3 w-full rounded-xl bg-ink p-3 text-sm font-semibold text-sand"
          >
            {t("savePassword")}
          </button>
        </Card>

        {/* Notificações */}
        <Card>
          <CardTitle icon="notifications">{t("notifications")}</CardTitle>
          <p className="m-0 mb-3 text-xs text-ink/50">
            {t.rich("notificationsHint", { b: (c) => <b>{c}</b> })}
          </p>
          <ToggleRow
            title={t("sendWhatsapp")}
            sub={t("sendWhatsappTo")}
            checked={toggles.wa}
            onChange={() => flipToggle("wa")}
          />
          <div className="border-t border-ink/10">
            <ToggleRow
              title={t("sendEmail")}
              sub={t("sendEmailTo")}
              checked={toggles.em}
              onChange={() => flipToggle("em")}
            />
          </div>
          <p className="m-0 mt-2 text-[11px] text-ink/40">
            {t("notificationsFootnote")}
          </p>
        </Card>

        {/* Pagamentos — Mercado Pago (marketplace connect) */}
        <Card className="md:col-span-2">
          <CardTitle icon="account_balance_wallet">{t("payments")}</CardTitle>
          <p className="m-0 mb-3 text-xs text-ink/50">{t("paymentsHint")}</p>

          {mpResult === "ok" && (
            <p className="m-0 mb-3 rounded-lg bg-[#ecfdf5] px-3 py-2 text-xs font-medium text-[#059669]">
              {t("mpConnectedOk")}
            </p>
          )}
          {mpResult === "error" && (
            <p className="m-0 mb-3 rounded-lg bg-[#fef2f2] px-3 py-2 text-xs font-medium text-[#e11d48]">
              {t("mpConnectError")}
            </p>
          )}

          <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-ink/10 p-3">
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
          <p className="m-0 mt-2 text-[11px] leading-relaxed text-ink/45">
            {t("mpFeeNote")}
          </p>
        </Card>

        {/* Impressão — card largo, 2 colunas: impressoras | agente + comandas */}
        <Card className="md:col-span-2">
          <CardTitle icon="print">{t("printer")}</CardTitle>

          {/* Impressão automática — faixa no topo */}
          <div className="mb-5 flex items-center justify-between gap-3 rounded-xl bg-dune-50 px-3.5 py-2.5">
            <div>
              <p className="m-0 text-sm font-medium text-ink/80">{t("autoPrint")}</p>
              <p className="m-0 text-xs text-ink/50">{t("autoPrintHint")}</p>
            </div>
            <Toggle
              checked={printEnabled}
              onChange={() => setPrintEnabled(!printEnabled)}
              aria-label={t("autoPrint")}
            />
          </div>

          <div className="grid gap-x-7 gap-y-6 md:grid-cols-2">
            {/* Coluna 1 — Impressoras */}
            <div>
              <SectionLabel>{t("printersSection")}</SectionLabel>
              <PrintersManager />
            </div>

            {/* Coluna 2 — Agente + comandas recentes */}
            <div className="flex flex-col gap-5 md:border-l md:border-ink/10 md:pl-7">
              <div>
                <SectionLabel>{t("agentSection")}</SectionLabel>
                {printToken ? (
                  <div className="rounded-xl border border-[#fde68a] bg-[#fffbeb] p-2.5">
                    <code className="block break-all text-[11px] font-medium text-ink/80">
                      {printToken}
                    </code>
                    <p className="m-0 mt-1.5 text-[11px] font-medium text-[#92400e]">
                      {t("printTokenOnce")}
                    </p>
                  </div>
                ) : (
                  <p className="m-0 mb-1 text-[11px] text-ink/45">
                    {hasPrintToken ? t("printTokenSet") : t("printTokenNone")}
                  </p>
                )}
                {/* Download pronto: agente com o token embutido (attachment). */}
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = "/api/print/agent";
                  }}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-ink p-3 text-sm font-semibold text-sand"
                >
                  <Icon name="download" size={16} />
                  {t("agentDownload")}
                </button>

                <PrinterSetupGuide />

                <button
                  type="button"
                  onClick={generatePrintToken}
                  className="mt-2 w-full rounded-lg bg-transparent p-1.5 text-[11px] font-medium text-ink/40"
                >
                  {hasPrintToken ? t("printTokenRegen") : t("printTokenGen")}
                </button>
              </div>

              <div className="border-t border-ink/10 pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <SectionLabel className="mb-0">{t("printJobs")}</SectionLabel>
                  <button
                    type="button"
                    onClick={refreshPrintJobs}
                    className="flex items-center gap-1 text-[11px] font-medium text-ocean-700"
                  >
                    <Icon name="refresh" size={13} />
                    {t("printRefresh")}
                  </button>
                </div>
                {printJobs.length === 0 ? (
                  <p className="m-0 text-[11px] text-ink/40">{t("printJobsEmpty")}</p>
                ) : (
                  <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                    {printJobs.map((j) => (
                      <li key={j.id} className="flex items-center gap-2 text-xs">
                        <PrintStatusBadge
                          status={j.status}
                          label={t(`printStatus${j.status}`)}
                          title={j.status === "FAILED" ? j.error : undefined}
                        />
                        <span className="truncate font-medium text-ink/80">
                          {j.kind === "TEST" ? t("printJobTest") : j.code}
                        </span>
                        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-ink/40">
                          {j.timeLabel}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border-2 border-ink bg-white p-5 shadow-hard ${className}`}
    >
      {children}
    </div>
  );
}

function CardTitle({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <h2 className="m-0 mb-3.5 flex items-center gap-2 font-display text-[15px] font-bold">
      <Icon name={icon} size={18} className="text-ocean-700" />
      {children}
    </h2>
  );
}

function SectionLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`m-0 mb-2 text-[11px] font-bold uppercase tracking-wide text-ink/45 ${className}`}
    >
      {children}
    </p>
  );
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink/60">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function PrintStatusBadge({
  status,
  label,
  title,
}: {
  status: string;
  label: string;
  title?: string;
}) {
  const s = PRINT_STATUS_STYLE[status] ?? PRINT_STATUS_STYLE.PENDING;
  return (
    <span
      title={title}
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      <Icon name={s.icon} size={12} />
      {label}
    </span>
  );
}

function ToggleRow({
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
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="m-0 text-sm font-medium text-ink/80">{title}</p>
        <p className="m-0 text-xs text-ink/50">{sub}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} aria-label={title} />
    </div>
  );
}
