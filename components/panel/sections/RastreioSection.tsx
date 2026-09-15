"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { tableTrackingAction } from "@/lib/actions/panel";
import type { TrackedTable } from "@/lib/db/tracking";

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

/** "HH:MM" no fuso do Brasil, a partir de um Date/ISO. */
function hhmm(v: Date | string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

export function RastreioSection() {
  const today = brToday();
  const [day, setDay] = useState(today);
  const [tables, setTables] = useState<TrackedTable[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

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

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="text-xl font-display font-bold text-ink">Rastreio de mesas</h2>
      <p className="mt-0.5 text-[13px] text-ink/55">
        Pedidos pagos de cada mesa no dia — cliente, itens, horários e garçom.
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
          <button type="button" onClick={() => setDay((d) => d)} className="py-10 text-center text-sm font-semibold text-ink/50 w-full">
            Erro ao carregar. Toque para tentar de novo.
          </button>
        ) : !tables || tables.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink/50">Nenhuma mesa cadastrada ainda.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {tables.map((t) => (
              <TableCard key={t.label} t={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TableCard({ t }: { t: TrackedTable }) {
  const empty = t.orderCount === 0;
  const summary = empty
    ? "Sem pedidos"
    : `${t.customers} ${t.customers === 1 ? "cliente" : "clientes"} · ${t.orderCount} ${t.orderCount === 1 ? "pedido" : "pedidos"}`;

  return (
    <details className="group rounded-xl border border-ink/12 bg-white [&[open]]:border-ink/25">
      <summary className={`flex list-none items-center gap-3 px-4 py-3 ${empty ? "cursor-default" : "cursor-pointer"}`}>
        <Icon name={t.registered ? "table_restaurant" : "smartphone"} size={18} className="text-ink/60" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[15px] font-bold text-ink">{t.label}</div>
          <div className={`text-[12.5px] font-bold ${empty ? "text-ink/40" : "text-emerald-600"}`}>{summary}</div>
        </div>
        {!empty && <Icon name="expand_more" size={20} className="text-ink/40 transition-transform group-open:rotate-180" />}
      </summary>
      {!empty && (
        <div className="flex flex-col gap-2 px-4 pb-3">
          {t.orders.map((o) => (
            <div key={o.code} className="rounded-lg bg-[#F3ECDA] p-3">
              <div className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
                <Icon name="person" size={15} className="text-ink/55" />
                <span className="truncate">
                  {o.customerName || "Cliente"}
                  {o.customerPhone ? `  ·  ${o.customerPhone}` : ""}
                </span>
              </div>
              <div className="mt-1.5 text-[12.5px] font-semibold text-ink/70">
                {o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Chip icon="schedule">Pedido {hhmm(o.placedAt)}</Chip>
                <Chip icon="check_circle">{o.deliveredAt ? `Entregue ${hhmm(o.deliveredAt)}` : "Não entregue"}</Chip>
                {o.waiter ? <Chip icon="room_service">{o.waiter}</Chip> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

function Chip({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] font-bold text-ink/65">
      <Icon name={icon} size={13} className="text-ink/55" />
      {children}
    </span>
  );
}
