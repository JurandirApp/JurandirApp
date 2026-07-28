"use client";

import { createContext, useContext } from "react";
import type { MenuItem, Order, PanelPrintJob, ProfileForm, Qr } from "@/lib/data/panel";
import type { MonthlyStatLite } from "@/lib/admin/scale";

export type TabId =
  | "pedidos"
  | "cardapio"
  | "qrcodes"
  | "kpis"
  | "auditoria"
  | "perfil"
  | "config";

export type AuditFilters = { from: string; to: string; mesa: string; method: string };
export type PwForm = { cur: string; nova: string; conf: string };
export type PrinterForm = { conn: string; ip: string; port: string; model: string };
export type Toggles = { auto: boolean; wa: boolean; em: boolean };

export interface PanelValue {
  beach: boolean;
  restName: string;
  now: number;
  orders: Order[];
  menu: MenuItem[];
  qrs: Qr[];
  stats: MonthlyStatLite[];
  tab: TabId;
  setTab: (t: TabId) => void;
  toast: (msg: string) => void;

  // Pedidos
  orderFilter: string;
  setOrderFilter: (f: string) => void;
  deliverOrder: (id: number) => void;
  printOrder: (id: number) => void;

  // Cardápio
  menuCat: string;
  setMenuCat: (c: string) => void;
  openEditor: (item: MenuItem | null) => void;
  askDeleteItem: (item: MenuItem) => void;
  csvModel: () => void;
  csvImport: () => void;

  // QR
  qrLabel: string;
  setQrLabel: (v: string) => void;
  addQr: () => void;
  openZoom: (q: Qr) => void;
  askDeleteQr: (q: Qr) => void;

  // KPIs
  period: string;
  setPeriod: (p: string) => void;
  openPay: string | null;
  setOpenPay: (p: string | null) => void;
  itemCat: string;
  setItemCat: (c: string) => void;

  // Auditoria
  aud: AuditFilters;
  setAud: (k: keyof AuditFilters, v: string) => void;
  clearAud: () => void;
  audPage: number;
  setAudPage: (n: number) => void;

  // Perfil
  profile: ProfileForm;
  setProfile: (k: keyof ProfileForm, v: string) => void;
  profSaved: boolean;
  saveProfile: () => void;
  /** Capa e logo atuais (Cloudinary) — refletem no preview do cardápio. */
  coverImg: string | null;
  logoImg: string | null;
  /** Qual imagem está subindo agora (para o estado de carregando nos botões). */
  uploadingImg: "cover" | "logo" | null;
  uploadImage: (kind: "cover" | "logo", file: File) => void;

  // Config
  pw: PwForm;
  setPw: (k: keyof PwForm, v: string) => void;
  savePw: () => void;
  pwMsg: { ok: boolean; t: string } | null;
  toggles: Toggles;
  flipToggle: (k: keyof Toggles) => void;
  printer: PrinterForm;
  setPrinter: (k: keyof PrinterForm, v: string) => void;
  savePrinter: () => void;
  testPrint: () => void;
  prMsg: string | null;
  printEnabled: boolean;
  setPrintEnabled: (v: boolean) => void;
  hasPrintToken: boolean;
  printToken: string | null;
  generatePrintToken: () => void;
  // Pagamentos — Mercado Pago (marketplace connect)
  mpConnected: boolean;
  mpResult: "ok" | "error" | null;
  connectMp: () => void;
  disconnectMp: () => void;
  printJobs: PanelPrintJob[];
  refreshPrintJobs: () => void;
}

export const PanelContext = createContext<PanelValue | null>(null);

export function usePanel(): PanelValue {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error("usePanel must be used within <PanelApp>");
  return ctx;
}

// [tab id, Material Symbols icon]. Labels are translated via `panel.sidebar.nav.<id>`.
export const TABS: [TabId, string][] = [
  ["pedidos", "space_dashboard"],
  ["cardapio", "restaurant"],
  ["qrcodes", "qr_code_2"],
  ["kpis", "trending_up"],
  ["auditoria", "receipt_long"],
  ["perfil", "storefront"],
  ["config", "settings"],
];
