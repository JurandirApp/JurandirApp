"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { AdminEst, AdminOrder, SearchEvent } from "@/lib/data/admin";
import { scaleFromOrders, type MonthlyStatLite } from "@/lib/admin/scale";
import {
  createEstablishmentAction,
  deleteEstablishmentAction,
  updateEstablishmentAction,
  updateFeeAction,
} from "@/lib/actions/admin";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/ui/Icon";
import { AdminContext, type AdminTabId, type AdminValue } from "./context";
import { AdminSidebar } from "./AdminSidebar";
import { PeriodBar } from "./PeriodBar";
import { DashboardSection } from "./sections/DashboardSection";
import { FaturamentoSection } from "./sections/FaturamentoSection";
import { BuscasSection } from "./sections/BuscasSection";
import { CadastrosSection } from "./sections/CadastrosSection";
import { TaxasSection } from "./sections/TaxasSection";
import { BacklogSection } from "./sections/BacklogSection";
import { RegEditorModal, type RegPayload } from "./modals/RegEditorModal";
import { ConfirmDialog } from "@/components/panel/modals/ConfirmDialog";

function currentMonth(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function AdminApp({
  now,
  ests,
  orders,
  events,
}: {
  now: number;
  ests: AdminEst[];
  /** Rollup mensal — ainda recebido do server; os dashboards agora agregam dos
   *  pedidos reais (`orders`), então não é mais usado aqui. */
  stats?: MonthlyStatLite[];
  orders: AdminOrder[];
  events: SearchEvent[];
}) {
  const t = useTranslations("admin");
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<AdminTabId>("dashboard");
  const [navOpen, setNavOpen] = useState(false); // sidebar mobile (hambúrguer)
  const [period, setPeriod] = useState("mes");
  const [month, setMonth] = useState(() => currentMonth(now));
  const [estabScope, setEstabScope] = useState("");

  const [editing, setEditing] = useState<{ est: AdminEst | null } | null>(null);
  const [del, setDel] = useState<AdminEst | null>(null);
  const [regError, setRegError] = useState<string | null>(null);

  const allScaled = useMemo(
    () => scaleFromOrders(ests, orders, period, month, now),
    [ests, orders, period, month, now],
  );
  const scopedScaled = useMemo(
    () => (estabScope ? allScaled.filter((e) => e.id === estabScope) : allScaled),
    [allScaled, estabScope],
  );

  const value = useMemo<AdminValue>(
    () => ({
      now,
      tab,
      setTab,
      period,
      setPeriod,
      month,
      setMonth,
      estabScope,
      setEstabScope,
      ests,
      orders,
      events,
      allScaled,
      scopedScaled,
      updateFee: (id, v) => {
        const pct = Math.round(parseFloat(v.replace(",", ".")) || 0);
        startTransition(() => updateFeeAction(id, pct));
      },
      openReg: (est) => {
        setRegError(null);
        setEditing({ est });
      },
      askDelete: (est) => setDel(est),
    }),
    [now, tab, period, month, estabScope, ests, orders, events, allScaled, scopedScaled],
  );

  const saveReg = (payload: RegPayload, id: string | null) => {
    const feeParsed = parseFloat(payload.fee.replace(",", "."));
    const input = {
      id: id ?? undefined,
      name: payload.name,
      owner: payload.owner,
      type: payload.tipo,
      city: payload.city,
      neighborhood: payload.neigh,
      posto: payload.posto,
      radiusM: payload.radius,
      plan: payload.plan,
      platformFeePct: Math.round(Number.isFinite(feeParsed) ? feeParsed : 8),
      user: payload.user,
      password: payload.password || undefined,
      phone: payload.phone,
      email: payload.email,
      website: payload.website,
      whatsapp: payload.whatsapp,
      instagram: payload.instagram,
      logoImg: payload.logoImg,
    };
    startTransition(async () => {
      try {
        const res = id
          ? await updateEstablishmentAction(input)
          : await createEstablishmentAction(input);
        if (res.ok) {
          setEditing(null);
          setRegError(null);
          setTab("cadastros");
        } else {
          setRegError(res.error ?? "saveError");
        }
      } catch {
        setRegError("saveError");
      }
    });
  };

  return (
    <AdminContext.Provider value={value}>
      <div className="min-h-screen bg-page">
        <header className="sticky top-0 z-40 flex h-[84px] items-center gap-1 bg-ink pl-2 lg:gap-0 lg:pl-0">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label={t("menuOpen")}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-sand lg:hidden"
          >
            <Icon name="menu" size={26} />
          </button>
          <div className="box-border flex-shrink-0 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/jurandir-logo-horizontal.svg"
              alt="Jurandir"
              className="block h-11 w-auto max-w-full rounded-[10px] lg:h-[52px]"
            />
          </div>
          <Link
            href="/painel"
            className="ml-auto flex items-center gap-1.5 pr-4 text-sm text-sand/80 lg:pr-6"
          >
            <span className="ms text-[17px]">storefront</span>
            <span className="hidden sm:inline">{t("estPanel")}</span>
          </Link>
        </header>

        <div className="flex min-h-[calc(100vh-84px)] items-stretch">
          {navOpen && (
            <button
              type="button"
              aria-label={t("menuClose")}
              onClick={() => setNavOpen(false)}
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            />
          )}
          <AdminSidebar open={navOpen} onClose={() => setNavOpen(false)} />
          <main className="box-border min-w-0 flex-1 p-6 md:px-7 md:py-6">
            {(tab === "dashboard" || tab === "faturamento") && <PeriodBar />}
            {tab === "dashboard" && <DashboardSection />}
            {tab === "faturamento" && <FaturamentoSection />}
            {tab === "buscas" && <BuscasSection />}
            {tab === "cadastros" && <CadastrosSection />}
            {tab === "taxas" && <TaxasSection />}
            {tab === "backlog" && <BacklogSection />}
          </main>
        </div>

        {editing && (
          <RegEditorModal
            est={editing.est}
            onClose={() => {
              setEditing(null);
              setRegError(null);
            }}
            onSave={saveReg}
            error={regError}
          />
        )}
        {del && (
          <ConfirmDialog
            icon="delete"
            title={t("confirm.title")}
            body={t.rich("confirm.body", { name: del.name, b: (c) => <b>{c}</b> })}
            confirmLabel={t("confirm.delete")}
            onCancel={() => setDel(null)}
            onConfirm={() => {
              const id = del.id;
              startTransition(() => deleteEstablishmentAction(id));
              setDel(null);
            }}
          />
        )}
      </div>
    </AdminContext.Provider>
  );
}
