"use client";

import type { PaymentEnv } from "@prisma/client";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { useAdmin } from "../context";

/** Config global de pagamentos: o ambiente (teste/produção) de cada gateway.
 *  Um switch por gateway — virar um pra teste NÃO arrasta o outro (a Pagar.me
 *  está no ar; o PagBank ainda não). Os tokens ficam no backend; aqui só escolhe. */
export function PagamentosSection() {
  const { pagbankMode, setPagbankMode, pagarmeMode, setPagarmeMode } = useAdmin();
  const t = useTranslations("admin.pagamentos");

  return (
    <div>
      <div className="mb-4 rounded-2xl bg-ink p-4 text-sand">
        <h2 className="m-0 mb-1 flex items-center gap-1.5 font-display text-base font-extrabold">
          <Icon name="credit_card" size={16} className="text-sun" />
          {t("title")}
        </h2>
        <p className="m-0 text-sm text-sand/70">{t("desc")}</p>
      </div>

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fill,minmax(440px,1fr))" }}
      >
        <GatewayModeCard
          title="Pagar.me"
          mode={pagarmeMode}
          onChange={setPagarmeMode}
          warn={pagarmeMode === "PRODUCTION" ? t("pagarmeProductionWarn") : t("pagarmeTestWarn")}
          tokenNote={t("pagarmeTokenNote")}
          t={t}
        />
        <GatewayModeCard
          title="PagBank"
          mode={pagbankMode}
          onChange={setPagbankMode}
          warn={pagbankMode === "PRODUCTION" ? t("pagbankProductionWarn") : t("pagbankTestWarn")}
          tokenNote={t("pagbankTokenNote")}
          t={t}
        />
      </div>
    </div>
  );
}

type Tr = ReturnType<typeof useTranslations>;

function GatewayModeCard({
  title,
  mode,
  onChange,
  warn,
  tokenNote,
  t,
}: {
  title: string;
  mode: PaymentEnv;
  onChange: (m: PaymentEnv) => void;
  warn: string;
  tokenNote: string;
  t: Tr;
}) {
  const live = mode === "PRODUCTION";
  return (
    <div className="rounded-xl border-2 border-ink bg-white p-4 shadow-hard">
      <div className="mb-3 flex items-center gap-2">
        <span className="font-display text-sm font-extrabold">{title}</span>
        <StatusChip live={live} liveLabel={t("liveChip")} testLabel={t("testChip")} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ModeButton
          active={!live}
          icon="science"
          label={t("test")}
          hint={t("testHint")}
          onClick={() => live && onChange("TEST")}
        />
        <ModeButton
          active={live}
          icon="rocket_launch"
          label={t("production")}
          hint={t("productionHint")}
          onClick={() => !live && onChange("PRODUCTION")}
        />
      </div>

      {live ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[12px] leading-snug text-[#b91c1c]">
          <Icon name="warning" size={15} className="mt-px flex-none" />
          <span className="min-w-0 flex-1 font-medium">{warn}</span>
        </div>
      ) : (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-[12px] leading-snug text-[#92400e]">
          <Icon name="info" size={15} className="mt-px flex-none" />
          <span className="min-w-0 flex-1 font-medium">{warn}</span>
        </div>
      )}

      <p className="m-0 mt-3 text-[11px] leading-relaxed text-ink/45">{tokenNote}</p>
    </div>
  );
}

function StatusChip({
  live,
  liveLabel,
  testLabel,
}: {
  live: boolean;
  liveLabel: string;
  testLabel: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{
        background: live ? "#10b981" : "rgba(20,24,33,.08)",
        color: live ? "#fff" : "rgba(20,24,33,.55)",
      }}
    >
      <span
        className="h-[6px] w-[6px] rounded-full"
        style={{ background: live ? "#fff" : "rgba(20,24,33,.4)" }}
      />
      {live ? liveLabel : testLabel}
    </span>
  );
}

function ModeButton({
  active,
  icon,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex flex-col items-start gap-0.5 rounded-xl border-2 p-3 text-left transition-colors"
      style={{
        borderColor: active ? "#141821" : "rgba(20,24,33,.12)",
        background: active ? "#141821" : "#fff",
      }}
    >
      <span
        className="flex items-center gap-1.5 text-[13px] font-bold leading-tight"
        style={{ color: active ? "#EDD8A3" : "#141821" }}
      >
        <Icon name={active ? "check_circle" : icon} size={15} />
        {label}
      </span>
      <span
        className="text-[10px] font-medium leading-tight"
        style={{ color: active ? "rgba(237,216,163,.7)" : "rgba(20,24,33,.4)" }}
      >
        {hint}
      </span>
    </button>
  );
}
