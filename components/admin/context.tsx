"use client";

import { createContext, useContext } from "react";
import type { AdminEst, AdminOrder, SearchEvent } from "@/lib/data/admin";
import type { ScaledEst } from "@/lib/admin/scale";

export type AdminTabId =
  | "dashboard"
  | "faturamento"
  | "buscas"
  | "cadastros"
  | "taxas"
  | "backlog";

export interface AdminValue {
  now: number;
  tab: AdminTabId;
  setTab: (t: AdminTabId) => void;

  // Global period bar (dashboard + faturamento)
  period: string;
  setPeriod: (p: string) => void;
  month: string;
  setMonth: (m: string) => void;
  estabScope: string;
  setEstabScope: (id: string) => void;

  ests: AdminEst[];
  orders: AdminOrder[];
  events: SearchEvent[];

  /** All establishments scaled by the selected period/month. */
  allScaled: ScaledEst[];
  /** Scaled, filtered by the establishment scope. */
  scopedScaled: ScaledEst[];

  updateFee: (id: string, value: string) => void;
  openReg: (est: AdminEst | null) => void;
  askDelete: (est: AdminEst) => void;
}

export const AdminContext = createContext<AdminValue | null>(null);

export function useAdmin(): AdminValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used within <AdminApp>");
  return ctx;
}

export const ADMIN_TABS: [AdminTabId, string, string][] = [
  ["dashboard", "Dashboard", "space_dashboard"],
  ["faturamento", "Faturamento", "trending_up"],
  ["buscas", "Buscas", "search"],
  ["cadastros", "Cadastros", "storefront"],
  ["taxas", "Taxas", "percent"],
  ["backlog", "Backlog", "receipt_long"],
];
