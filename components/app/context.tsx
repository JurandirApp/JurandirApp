"use client";

import { createContext, useContext } from "react";
import type { MenuItem } from "@/lib/data/panel";
import type { AppEstablishment, PayId } from "@/lib/data/app";
import type { CartLine, ClientOrder } from "@/lib/app/helpers";

export type Step = "qr" | "menu" | "checkout" | "done" | "myorders";
export type PayMode = "full" | "split";

export interface AppValue {
  // Identity / context
  est: AppEstablishment;
  beach: boolean;
  loc: string;
  setLoc: (v: string) => void;
  /** true quando o guarda-sol/mesa veio de um QR (?local=); false se o cliente
   *  chegou pela landing e precisa escolher onde está. */
  spotFromQr: boolean;
  /** Guarda-sóis/mesas cadastrados pelo estabelecimento (labels dos QrSpots). */
  spots: string[];
  menu: MenuItem[];
  /** Nomes dos itens mais pedidos (ordem = ranking), derivado dos pedidos reais. */
  popularNames: string[];

  // Navigation
  step: Step;
  goQr: () => void;
  goMenu: () => void;
  goCheckout: () => void;
  goMyOrders: () => void;

  // Cart
  cart: CartLine[];
  addItem: (id: number) => void;
  decItem: (id: number) => void;
  removeItem: (id: number) => void;
  cartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;

  // Menu browsing
  cat: string;
  sub: string;
  pickCat: (c: string) => void;
  pickSub: (s: string) => void;
  query: string;
  setQuery: (v: string) => void;

  // Forms
  custName: string;
  setCustName: (v: string) => void;
  note: string;
  setNote: (v: string) => void;

  // Checkout — payment mode
  mode: PayMode;
  setMode: (m: PayMode) => void;

  // Full payment
  selPay: PayId | null;
  pickPay: (id: PayId) => void;
  parc: number;
  setParc: (n: number) => void;

  // Split payment
  people: number;
  pplPlus: () => void;
  pplMinus: () => void;
  paid: (PayId | null)[];
  setShare: (idx: number, id: PayId) => void;
  undoShare: (idx: number) => void;

  // Submission
  paying: boolean;
  finish: (fullyPaidOrShares: null | { m: PayId | null; amount: number }[]) => void;
  /** Cartão (crédito/débito) → abre o Payment Brick (checkout transparente) em vez de redirect. */
  openCardPay: () => void;

  // Post-order
  myOrders: ClientOrder[];
  lastOrder: ClientOrder | null;
  exp: number | null;
  toggleExp: (id: number) => void;
  payShare: (orderId: number, idx: number, id: PayId) => void;
  /** Abre a tela de um pedido (ex.: retomar o Pix aguardando, ver o QR). */
  openOrder: (order: ClientOrder) => void;

  // Toast
  toast: string | null;
  toastMsg: (t: string) => void;
}

export const AppContext = createContext<AppValue | null>(null);

export function useApp(): AppValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within <ClientApp>");
  return ctx;
}
