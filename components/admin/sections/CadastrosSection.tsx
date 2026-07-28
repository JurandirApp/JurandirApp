"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { Link } from "@/i18n/navigation";
import type { AdminEst } from "@/lib/data/admin";
import {
  connectAsaasAction,
  getMpConnectUrlAction,
  setPrinterConfigAction,
  regeneratePrintTokenAction,
  testPrintAction,
} from "@/lib/actions/admin";
import { useAdmin } from "../context";

/** Botão de onboarding de pagamentos (Asaas via API / Mercado Pago via OAuth) por estabelecimento. */
function PaymentConnect({ e }: { e: AdminEst }) {
  const t = useTranslations("admin.cadastros");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (e.paymentOnboarded) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
        <Icon name="verified" size={12} />
        {t("payActive", { provider: e.paymentProvider === "MERCADO_PAGO" ? "Mercado Pago" : "Asaas" })}
      </span>
    );
  }

  const connectAsaas = async () => {
    setBusy(true);
    const r = await connectAsaasAction(e.id);
    setBusy(false);
    setMsg(r.ok ? t("payConnected") : r.error === "cpf" ? t("payNeedCpf") : t("payConnectError"));
  };
  const connectMp = async () => {
    setBusy(true);
    const r = await getMpConnectUrlAction(e.id);
    if (r.ok && r.url) window.location.href = r.url;
    else {
      setBusy(false);
      setMsg(t("payConnectError"));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={connectAsaas}
        className="rounded-lg bg-ink px-2.5 py-1 text-[11px] font-bold text-sand disabled:opacity-50"
      >
        {t("payConnectAsaas")}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={connectMp}
        className="rounded-lg bg-[#009ee3] px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-50"
      >
        {t("payConnectMp")}
      </button>
      {msg && <span className="text-[11px] text-ink/60">{msg}</span>}
    </div>
  );
}

/** Config da impressora (IP + token do agente + toggle + teste) por estabelecimento. */
function PrinterConfig({ e }: { e: AdminEst }) {
  const t = useTranslations("admin.cadastros");
  const [ip, setIp] = useState(e.printerIp ?? "");
  const [enabled, setEnabled] = useState(Boolean(e.printEnabled));
  const [token, setToken] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async (next: boolean) => {
    setEnabled(next);
    await setPrinterConfigAction(e.id, ip, next);
    setMsg(t("printSaved"));
  };
  const gen = async () => {
    const r = await regeneratePrintTokenAction(e.id);
    if (r.ok && r.token) setToken(r.token);
  };
  const test = async () => {
    const r = await testPrintAction(e.id);
    setMsg(r.ok ? t("printTestQueued") : t("printNeedToken"));
  };

  return (
    <div className="flex flex-col gap-1.5 text-[11px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          value={ip}
          onChange={(ev) => setIp(ev.target.value)}
          onBlur={() => setPrinterConfigAction(e.id, ip, enabled)}
          placeholder={t("printerIp")}
          className="w-32 rounded border border-ink/20 px-2 py-1"
        />
        <button
          type="button"
          onClick={() => save(!enabled)}
          className="rounded-lg bg-ink px-2.5 py-1 font-bold text-sand"
        >
          {enabled ? t("printOn") : t("printOff")}
        </button>
        <button
          type="button"
          onClick={gen}
          className="rounded-lg bg-ink/10 px-2.5 py-1 font-bold text-ink"
        >
          {e.hasPrintToken ? t("printRegen") : t("printGen")}
        </button>
        <button
          type="button"
          onClick={test}
          className="rounded-lg bg-ink/10 px-2.5 py-1 font-bold text-ink"
        >
          {t("printTest")}
        </button>
      </div>
      {token && <code className="break-all rounded bg-amber-50 px-2 py-1 text-[10px]">{token}</code>}
      {msg && <span className="text-ink/60">{msg}</span>}
    </div>
  );
}

const stColors = (status: string): [string, string] =>
  status === "ativo" ? ["#d1fae5", "#047857"] : ["#fef3c7", "#b45309"];

function chipsFor(e: AdminEst) {
  const chips: { key: string; icon: string; color: string; text: string }[] = [];
  if (e.user) chips.push({ key: "u", icon: "person", color: "rgba(20,24,33,.4)", text: e.user });
  if (e.password)
    chips.push({ key: "l", icon: "lock", color: "rgba(20,24,33,.4)", text: "•".repeat(Math.min(8, e.password.length)) });
  if (e.phone) chips.push({ key: "p", icon: "call", color: "rgba(20,24,33,.4)", text: e.phone });
  if (e.whatsapp) chips.push({ key: "w", icon: "chat", color: "#10b981", text: e.whatsapp });
  if (e.email) chips.push({ key: "m", icon: "mail", color: "rgba(20,24,33,.4)", text: e.email });
  if (e.website) chips.push({ key: "g", icon: "language", color: "rgba(20,24,33,.4)", text: e.website });
  if (e.instagram) chips.push({ key: "i", icon: "alternate_email", color: "#ec4899", text: e.instagram });
  return chips;
}

export function CadastrosSection() {
  const { ests, openReg, askDelete } = useAdmin();
  const t = useTranslations("admin.cadastros");
  const ts = useTranslations("admin.status");
  const tt = useTranslations("admin.tipo");
  const tp = useTranslations("admin.plan");
  const td = useTranslations("admin.dashboard");

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="m-0 font-display text-base font-bold">
          {t("count", { count: ests.length })}
        </h2>
        <button
          type="button"
          onClick={() => openReg(null)}
          className="flex items-center gap-1 rounded-xl bg-coral px-3 py-2 text-sm font-bold text-white"
        >
          <Icon name="add" size={16} />
          {t("register")}
        </button>
      </div>

      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(auto-fill,minmax(440px,1fr))" }}
      >
        {ests.map((e) => {
          const [stBg, stFg] = stColors(e.status);
          const canDel = !e.isLive;
          return (
            <div
              key={e.id}
              className="rounded-xl border-2 border-ink bg-white p-3 shadow-hard"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => openReg(e)}
                    className="flex items-center gap-1.5 bg-transparent p-0 text-left text-sm font-semibold text-ink"
                  >
                    {e.name}
                    <Icon name="edit" size={12} className="text-ink/30" />
                    {e.isLive && (
                      <span className="rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-bold text-sand">
                        {td("live")}
                      </span>
                    )}
                  </button>
                  <div>
                    <span className="mt-1 inline-block rounded-full bg-ocean-900/10 px-2 py-0.5 text-[10px] font-bold text-ocean-900">
                      {tt(e.tipo)}
                    </span>
                  </div>
                  <p className="m-0 mt-0.5 text-xs text-ink/50">
                    {e.owner} · {e.neigh ? `${e.neigh}, ` : ""}
                    {e.city} · {t("plan", { plan: tp(e.plan) })}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <span
                    className="rounded-full px-2 py-1 text-xs font-medium"
                    style={{ background: stBg, color: stFg }}
                  >
                    {ts(e.status)}
                  </span>
                  <Link
                    href="/painel"
                    title={t("viewPanel")}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink/5 text-ink/60"
                  >
                    <Icon name="storefront" size={15} />
                  </Link>
                  {canDel && (
                    <button
                      type="button"
                      onClick={() => askDelete(e)}
                      aria-label={t("delete")}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#fef2f2] text-[#ef4444]"
                    >
                      <Icon name="delete" size={15} />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-ink/10 pt-2 text-[11px] text-ink/60">
                {chipsFor(e).map((c) => (
                  <span key={c.key} className="flex items-center gap-1">
                    <Icon name={c.icon} size={12} style={{ color: c.color }} />
                    {c.text}
                  </span>
                ))}
              </div>

              <div className="mt-2 border-t border-ink/10 pt-2">
                <PaymentConnect e={e} />
              </div>

              <div className="mt-2 border-t border-ink/10 pt-2">
                <PrinterConfig e={e} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
