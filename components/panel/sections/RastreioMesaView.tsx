"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { tableDetailAction } from "@/lib/actions/panel";
import type { TableDetail } from "@/lib/db/tracking";

/** "HH:MM" no fuso do Brasil. */
function hhmm(v: Date | string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

/** "R$ 1.234,50". */
function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Detalhe de UMA mesa: clientes (agrupados) e seus pedidos do dia. */
export function RastreioMesaView({ day, label, onBack }: { day: string; label: string; onBack: () => void }) {
  const [detail, setDetail] = useState<TableDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(false);
    tableDetailAction(day, label)
      .then((r) => {
        if (alive) {
          setDetail(r);
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
  }, [day, label]);

  const clients = useMemo(() => {
    const all = detail?.clients ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return all;
    return all.filter(
      (c) => c.name.toLowerCase().includes(term) || c.phone.toLowerCase().includes(term),
    );
  }, [detail, q]);

  return (
    <div className="mx-auto max-w-3xl">
      {/* Cabeçalho */}
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-bold text-ink/55 hover:text-ink"
      >
        <Icon name="chevron_left" size={18} />
        Voltar às mesas
      </button>

      <div className="flex items-center gap-2">
        <Icon name={detail?.registered ? "table_restaurant" : "smartphone"} size={22} className="text-ink/60" />
        <h2 className="text-xl font-display font-bold text-ink">{label}</h2>
      </div>

      {detail && detail.orderCount > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip icon="group">
            {detail.customers} {detail.customers === 1 ? "cliente" : "clientes"}
          </Chip>
          <Chip icon="receipt_long">
            {detail.orderCount} {detail.orderCount === 1 ? "pedido" : "pedidos"}
          </Chip>
          <Chip icon="payments">{brl(detail.total)}</Chip>
        </div>
      )}

      {/* Busca */}
      {detail && detail.clients.length > 1 && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-ink/15 bg-white px-3">
          <Icon name="search" size={18} className="text-ink/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar cliente por nome ou telefone"
            className="h-10 flex-1 bg-transparent text-sm font-semibold text-ink outline-none placeholder:font-medium placeholder:text-ink/40"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Limpar busca">
              <Icon name="close" size={16} className="text-ink/40" />
            </button>
          )}
        </div>
      )}

      {/* Corpo */}
      <div className="mt-4">
        {loading ? (
          <p className="py-10 text-center text-sm text-ink/50">Carregando…</p>
        ) : err ? (
          <button
            type="button"
            onClick={() => setQ((v) => v)}
            className="w-full py-10 text-center text-sm font-semibold text-ink/50"
          >
            Erro ao carregar. Toque para tentar de novo.
          </button>
        ) : !detail || detail.orderCount === 0 ? (
          <p className="py-10 text-center text-sm text-ink/50">Sem pedidos nessa mesa hoje.</p>
        ) : clients.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink/50">Nenhum cliente encontrado.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {clients.map((c) => (
              <ClientBlock key={c.key} c={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ClientBlock({ c }: { c: TableDetail["clients"][number] }) {
  return (
    <details className="group rounded-xl border border-ink/12 bg-white [&[open]]:border-ink/25">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[15px] font-bold text-ink">{c.name || "Cliente"}</div>
          {/* Telefone + nº de pedidos em preto; só o valor pago em verde. */}
          <div className="truncate text-[12.5px] font-bold text-ink">
            {c.phone ? `${c.phone} · ` : ""}
            {c.orderCount} {c.orderCount === 1 ? "pedido" : "pedidos"} ·{" "}
            <span className="text-emerald-600">{brl(c.total)}</span>
          </div>
        </div>
        <Icon name="expand_more" size={20} className="text-ink/40 transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-2 px-4 pb-3">
        {c.orders.map((o) => (
          <div key={o.code} className="rounded-lg bg-[#F3ECDA] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-[13px] font-bold text-ink/70">#{o.number}</span>
              <span className="font-display text-[13px] font-bold text-ink">{brl(o.total)}</span>
            </div>
            <div className="mt-1 text-[12.5px] font-semibold text-ink/75">
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
