"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { tableTrackingAction } from "@/lib/actions/panel";
import type { TrackedTable } from "@/lib/db/tracking";
import { RastreioMesaView } from "./RastreioMesaView";

/** Hoje no fuso do Brasil, "YYYY-MM-DD". */
function brToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Soma dias a uma data "YYYY-MM-DD" (sem passar de hoje). */
function shift(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA");
}

/** "R$ 1.234,50". */
function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function RastreioSection() {
  const today = brToday();
  const [day, setDay] = useState(today);
  const [tables, setTables] = useState<TrackedTable[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  /** Mesa aberta (label). Null = mostrando o grid de mesas. */
  const [openTable, setOpenTable] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(false);
    tableTrackingAction(day)
      .then((r) => {
        if (alive) {
          setTables(r.tables);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setErr(true);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [day]);

  const isToday = day === today;

  // Detalhe de uma mesa (mesma tela, troca a view).
  if (openTable) {
    return <RastreioMesaView day={day} label={openTable} onBack={() => setOpenTable(null)} />;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="text-xl font-display font-bold text-ink">Rastreio de mesas</h2>
      <p className="mt-0.5 text-[13px] text-ink/55">
        Toque numa mesa para ver os pedidos pagos, cliente por cliente.
      </p>

      {/* Seletor de dia */}
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setDay(shift(day, -1))}
          className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-ink bg-white"
          aria-label="Dia anterior"
        >
          <Icon name="chevron_left" size={18} />
        </button>
        <input
          type="date"
          value={day}
          max={today}
          onChange={(e) => e.target.value && setDay(e.target.value)}
          className="h-9 flex-1 rounded-lg border border-ink/15 bg-white px-3 text-sm font-semibold text-ink"
        />
        <button
          type="button"
          disabled={isToday}
          onClick={() => setDay(shift(day, 1))}
          className="flex h-9 w-9 items-center justify-center rounded-lg border-2 bg-white disabled:opacity-30"
          style={{ borderColor: "#141821" }}
          aria-label="Próximo dia"
        >
          <Icon name="chevron_right" size={18} />
        </button>
      </div>

      {/* Corpo */}
      <div className="mt-4">
        {loading ? (
          <p className="py-10 text-center text-sm text-ink/50">Carregando…</p>
        ) : err ? (
          <button type="button" onClick={() => setDay((d) => d)} className="w-full py-10 text-center text-sm font-semibold text-ink/50">
            Erro ao carregar. Toque para tentar de novo.
          </button>
        ) : !tables || tables.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink/50">Nenhuma mesa cadastrada ainda.</p>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {tables.map((t) => (
              <TableCard key={t.label} t={t} onOpen={() => setOpenTable(t.label)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TableCard({ t, onOpen }: { t: TrackedTable; onOpen: () => void }) {
  const empty = t.orderCount === 0;
  return (
    <button
      type="button"
      onClick={empty ? undefined : onOpen}
      disabled={empty}
      className={`flex items-center gap-3 rounded-xl border bg-white px-4 py-3 text-left transition-colors ${
        empty ? "cursor-default border-ink/10" : "border-ink/15 hover:border-ink/40"
      }`}
    >
      <Icon name={t.registered ? "table_restaurant" : "smartphone"} size={18} className="text-ink/60" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-[15px] font-bold text-ink">{t.label}</div>
        <div className={`text-[12.5px] font-bold ${empty ? "text-ink/40" : "text-emerald-600"}`}>
          {empty
            ? "Sem pedidos"
            : `${t.customers} ${t.customers === 1 ? "cliente" : "clientes"} · ${t.orderCount} ${t.orderCount === 1 ? "pedido" : "pedidos"} · ${brl(t.revenue)}`}
        </div>
      </div>
      {!empty && <Icon name="chevron_right" size={20} className="text-ink/40" />}
    </button>
  );
}
