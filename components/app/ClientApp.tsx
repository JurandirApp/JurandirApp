"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CATS, type AppEstablishment, type PayId } from "@/lib/data/app";
import type { MenuItem } from "@/lib/data/panel";
import { cartTotal, fees, type CartLine, type ClientOrder, type Share } from "@/lib/app/helpers";
import { PIX_EXPIRES_MIN } from "@/lib/domain/pricing";
import { appToEnum } from "@/lib/app/adapters";
import { createOrderAction, getMyOrdersAction, payCardAction, payShareAction } from "@/lib/actions/app";
import type { OrderCreateInput } from "@/lib/validation";
import { AppContext, type AppValue, type PayMode, type Step } from "./context";
import { QrScreen } from "./screens/QrScreen";
import { MenuScreen } from "./screens/MenuScreen";
import { CheckoutScreen } from "./screens/CheckoutScreen";
import { DoneScreen } from "./screens/DoneScreen";
import { MyOrdersScreen } from "./screens/MyOrdersScreen";
import { CartDrawer } from "./CartDrawer";
import { CardPaymentModal } from "./CardPaymentModal";
import { ClientToast } from "./ClientToast";

const CAT0 = "Combos & Combinações";

export function ClientApp({
  est,
  menu,
  beach,
  loc: loc0,
  spotFromQr = false,
  spots = [],
  popularNames = [],
  paidReturn = false,
}: {
  est: AppEstablishment;
  menu: MenuItem[];
  beach: boolean;
  loc: string;
  spotFromQr?: boolean;
  spots?: string[];
  popularNames?: string[];
  paidReturn?: boolean;
}) {
  const t = useTranslations("app");
  const storageKey = `jur_orders_${est.slug}`;
  const cartKey = `jur_cart_${est.slug}`;
  const pendingKey = `jur_pending_${est.slug}`;
  // Lembra qual pedido está aguardando pagamento nesta aba → um F5/fechar-reabrir
  // volta direto pra tela do Pix (com o QR), em vez de perder tudo.
  const viewKey = `jur_view_${est.slug}`;

  // Voltando do Checkout Pro (?paid=1) → já abre em "Meus pedidos". Vem do
  // servidor (prop) para não quebrar a hidratação.
  const [step, setStep] = useState<Step>(paidReturn ? "myorders" : "qr");
  const [cart, setCart] = useState<CartLine[]>([]);
  // Abre na primeira categoria/sub que TEM item — um cardápio novo pode não ter
  // combos, então não faz sentido abrir numa aba vazia.
  const firstCat =
    Object.keys(CATS).find((c) => menu.some((m) => m.cat === c)) ?? CAT0;
  const [cat, setCat] = useState(firstCat);
  const [sub, setSub] = useState(
    () =>
      (CATS[firstCat] ?? []).find((s) =>
        menu.some((m) => m.cat === firstCat && m.sub === s),
      ) ??
      CATS[firstCat]?.[0] ??
      "",
  );
  const [cartOpen, setCartOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [custName, setCustName] = useState("");
  const [note, setNote] = useState("");
  // Guarda-sol/mesa: se veio de um QR (?local=), usa o valor da URL. Se chegou
  // pela landing, começa vazio — o cliente escolhe no modal antes de pedir.
  const [loc, setLoc] = useState(spotFromQr ? loc0 : "");

  const [mode, setMode] = useState<PayMode>("full");
  const [selPay, setSelPay] = useState<PayId | null>(null);
  const [parc, setParc] = useState(1);

  const [people, setPeople] = useState(2);
  const [paid, setPaid] = useState<(PayId | null)[]>([null, null]);

  const [paying, setPaying] = useState(false);
  const [myOrders, setMyOrders] = useState<ClientOrder[]>([]);
  const [lastOrder, setLastOrder] = useState<ClientOrder | null>(null);
  const [cardPay, setCardPay] = useState<{
    input: OrderCreateInput;
    amount: number;
  } | null>(null);
  const [exp, setExp] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  // Load "my orders" (ids persisted in this browser) from the DB on mount. Se
  // havia um pedido aguardando pagamento (Pix) salvo nesta aba, resume a tela do
  // QR depois do fetch — assim um F5 ou fechar/reabrir não perde o QR nem o pedido.
  useEffect(() => {
    let ids: string[] = [];
    try {
      ids = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    } catch {
      ids = [];
    }
    let resumeId: string | null = null;
    try {
      resumeId =
        (JSON.parse(localStorage.getItem(viewKey) ?? "null") as ClientOrder | null)?.dbId ??
        null;
    } catch {
      resumeId = null;
    }
    if (!ids.length) return;
    getMyOrdersAction(ids)
      .then((orders) => {
        setMyOrders(orders);
        // Confirma/atualiza o pedido resumido com a verdade do servidor (pode ter
        // sido pago/expirado enquanto o app estava fechado). A tela do Pix já
        // apareceu instantânea pelo cache; aqui só corrige o status.
        if (resumeId && !paidReturn) {
          const o = orders.find((x) => x.dbId === resumeId);
          if (o) {
            setLastOrder(o);
            if (o.status === "aguardando" && !o.expired) setStep("done");
          }
          if (!o || o.status !== "aguardando" || o.expired) {
            try {
              localStorage.removeItem(viewKey);
            } catch {
              /* ignore */
            }
          }
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [est.slug]);

  // Mostra a tela do Pix IMEDIATAMENTE a partir do pedido salvo (com o QR) — sem
  // esperar a rede. O fetch acima só confirma/atualiza o status depois. Guarda
  // contra Pix já vencido (fora da janela) — nesse caso deixa o fetch decidir.
  useEffect(() => {
    if (paidReturn) return;
    try {
      const saved = JSON.parse(
        localStorage.getItem(viewKey) ?? "null",
      ) as ClientOrder | null;
      const withinWindow =
        !!saved?.ts && Date.now() - saved.ts < (PIX_EXPIRES_MIN + 1) * 60_000;
      if (saved?.dbId && saved.status === "aguardando" && !saved.expired && withinWindow) {
        queueMicrotask(() => {
          setLastOrder(saved);
          setStep("done");
        });
      }
    } catch {
      /* localStorage unavailable */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [est.slug]);

  // Restaura o carrinho salvo — sobrevive ao redirect do pagamento, refresh ou
  // fechar/reabrir a aba. (via microtask p/ não quebrar a hidratação nem cair na
  // regra de setState-síncrono-no-efeito.)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(cartKey) ?? "[]");
      if (Array.isArray(saved) && saved.length) queueMicrotask(() => setCart(saved));
    } catch {
      /* localStorage unavailable */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [est.slug]);

  // Persiste o carrinho a cada mudança (remove a chave quando esvazia).
  useEffect(() => {
    try {
      if (cart.length) localStorage.setItem(cartKey, JSON.stringify(cart));
      else localStorage.removeItem(cartKey);
    } catch {
      /* localStorage unavailable */
    }
  }, [cart, cartKey]);

  // Enquanto o pedido exibido aguarda pagamento (Pix), lembra dele → o reload
  // resume a tela do QR. Some assim que ele é pago/entregue/expira.
  useEffect(() => {
    if (!lastOrder?.dbId) return;
    try {
      if (lastOrder.status === "aguardando" && !lastOrder.expired) {
        // Guarda o pedido INTEIRO (com o payload/QR do Pix) → no reload a tela
        // aparece na hora, sem esperar a rede.
        localStorage.setItem(viewKey, JSON.stringify(lastOrder));
      } else {
        localStorage.removeItem(viewKey);
      }
    } catch {
      /* localStorage unavailable */
    }
  }, [lastOrder, viewKey]);

  // Retorno do Checkout Pro (?paid=1): limpa a URL e força uma reconciliação
  // imediata para o pedido aparecer já pago / em produção. A troca de tela já
  // veio do estado inicial (paidReturn), então aqui não há setState síncrono.
  useEffect(() => {
    if (!paidReturn) return;
    window.history.replaceState({}, "", window.location.pathname);
    try {
      const ids: string[] = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      const pending = localStorage.getItem(pendingKey);
      if (ids.length)
        getMyOrdersAction(ids)
          .then((orders) => {
            setMyOrders(orders);
            // Pagamento confirmado (pedido saiu de "aguardando") → limpa o
            // carrinho. Se falhou/segue aguardando, mantém os itens selecionados.
            const done = orders.find(
              (o) => o.dbId === pending && o.status !== "aguardando",
            );
            if (done) {
              setCart([]);
              try {
                localStorage.removeItem(pendingKey);
              } catch {
                /* ignore */
              }
            }
          })
          .catch(() => {});
    } catch {
      /* localStorage unavailable */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [est.slug]);

  // Keep a live ref of myOrders so the 5s poller can decide when to stop.
  const myOrdersRef = useRef<ClientOrder[]>([]);
  useEffect(() => {
    myOrdersRef.current = myOrders;
  }, [myOrders]);

  // Poll the DB every 5s so the customer watches the order advance
  // (aguardando → producao → entregue) and split shares getting paid — live,
  // without reloading. Stops hitting the DB once every known order is
  // delivered; a freshly placed order re-opens it (it lands here not-delivered).
  useEffect(() => {
    const poll = async () => {
      let ids: string[] = [];
      try {
        ids = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      } catch {
        ids = [];
      }
      if (!ids.length) return;
      const known = myOrdersRef.current;
      const allDone =
        known.length >= ids.length &&
        known.every((o) => o.status === "entregue" || o.expired);
      if (allDone) return;
      try {
        const fresh = await getMyOrdersAction(ids);
        setMyOrders(fresh);
        // Mantém a tela final (lastOrder) viva: se o pedido exibido nela avançou
        // (ex.: Pix confirmado no gateway), reflete o novo status na hora — senão
        // a tela "Aguardando pagamento" nunca sairia do lugar depois de pagar.
        setLastOrder((prev) =>
          prev?.dbId ? (fresh.find((o) => o.dbId === prev.dbId) ?? prev) : prev,
        );
      } catch {
        /* transient — the next tick retries */
      }
    };
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [est.slug]);

  const value = useMemo<AppValue>(() => {
    const toastMsg = (msg: string) => {
      setToast(msg);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 2400);
    };

    const finish = (sharesArg: Share[] | null) => {
      const items = cart.map((c) => {
        const m = menu.find((x) => x.id === c.id)!;
        return { name: m.name, qty: c.qty, unitPrice: m.price };
      });
      const payment = sharesArg
        ? {
            kind: "split" as const,
            shares: sharesArg.map((s) => ({ method: s.m ? appToEnum(s.m) : null })),
          }
        : {
            kind: "full" as const,
            method: appToEnum(selPay!),
            installments: selPay === "credito" ? parc : 1,
          };
      setPaying(true);
      (async () => {
        const r = await createOrderAction({
          establishmentId: est.id,
          locationLabel: loc,
          posto: beach ? est.posto : undefined,
          customerName: custName.trim() || undefined,
          note: note.trim() || undefined,
          items,
          payment,
        });
        setPaying(false);
        if (!r.ok || !r.order) {
          toastMsg(t("orderError"));
          return;
        }
        const order = r.order;
        try {
          const ids: string[] = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
          if (order.dbId && !ids.includes(order.dbId)) {
            localStorage.setItem(storageKey, JSON.stringify([order.dbId, ...ids]));
          }
        } catch {
          // localStorage unavailable — order is still created server-side.
        }
        // Cartão via Mercado Pago → redireciona pro Checkout Pro. O carrinho fica
        // salvo (localStorage) e guardamos o id do pedido pendente; ao voltar
        // (?paid=1) o carrinho só é limpo se o pagamento foi confirmado — se
        // falhar, os itens continuam lá. Não vai pra tela "done" (sai da página).
        if (r.checkoutUrl) {
          try {
            if (order.dbId) localStorage.setItem(pendingKey, order.dbId);
          } catch {
            /* localStorage unavailable */
          }
          window.location.href = r.checkoutUrl;
          return;
        }
        setMyOrders((prev) => [order, ...prev]);
        setLastOrder(order);
        setCart([]);
        setSelPay(null);
        setParc(1);
        setMode("full");
        setPeople(2);
        setPaid([null, null]);
        setNote("");
        setStep("done");
      })();
    };

    const openCardPay = () => {
      const items = cart.map((c) => {
        const m = menu.find((x) => x.id === c.id)!;
        return { name: m.name, qty: c.qty, unitPrice: m.price };
      });
      const input: OrderCreateInput = {
        establishmentId: est.id,
        locationLabel: loc,
        posto: beach ? est.posto : undefined,
        customerName: custName.trim() || undefined,
        note: note.trim() || undefined,
        items,
        payment: { kind: "full", method: appToEnum(selPay!), installments: 1 },
      };
      const { grand } = fees(cartTotal(cart, menu), est.platformFeePct, est.serviceFeePct);
      setCardPay({ input, amount: grand });
    };

    return {
      est,
      beach,
      loc,
      setLoc,
      spotFromQr,
      spots,
      popularNames,
      menu,

      step,
      goQr: () => setStep("qr"),
      goMenu: () => {
        setStep("menu");
        setCartOpen(false);
      },
      goCheckout: () => {
        setStep("checkout");
        setCartOpen(false);
      },
      goMyOrders: () => setStep("myorders"),

      cart,
      addItem: (id) =>
        setCart((s) => {
          const ex = s.find((c) => c.id === id);
          return ex
            ? s.map((c) => (c.id === id ? { ...c, qty: c.qty + 1 } : c))
            : [...s, { id, qty: 1 }];
        }),
      decItem: (id) =>
        setCart((s) =>
          s.flatMap((c) =>
            c.id === id ? (c.qty > 1 ? [{ ...c, qty: c.qty - 1 }] : []) : [c],
          ),
        ),
      removeItem: (id) =>
        setCart((s) => {
          const next = s.filter((c) => c.id !== id);
          if (next.length === 0 && step === "checkout") setStep("menu");
          return next;
        }),
      cartOpen,
      openCart: () => setCartOpen(true),
      closeCart: () => setCartOpen(false),

      cat,
      sub,
      pickCat: (c) => {
        setCat(c);
        setSub(
          (CATS[c] ?? []).find((s) =>
            menu.some((m) => m.cat === c && m.sub === s),
          ) ??
            CATS[c]?.[0] ??
            "",
        );
      },
      pickSub: setSub,
      query,
      setQuery,

      custName,
      setCustName,
      note,
      setNote,

      mode,
      setMode,

      selPay,
      pickPay: (id) => {
        setSelPay(id);
        if (id !== "credito") setParc(1);
      },
      parc,
      setParc,

      people,
      // `paid.length` mirrors `people`; both stay in [2, 8]. Changing the head
      // count resets everyone's payment (matches the prototype).
      pplPlus: () => {
        setPeople((p) => (p >= 8 ? p : p + 1));
        setPaid((arr) => (arr.length >= 8 ? arr : Array(arr.length + 1).fill(null)));
      },
      pplMinus: () => {
        setPeople((p) => (p <= 2 ? p : p - 1));
        setPaid((arr) => (arr.length <= 2 ? arr : Array(arr.length - 1).fill(null)));
      },
      paid,
      setShare: (idx, id) =>
        setPaid((s) => s.map((x, i) => (i === idx ? id : x))),
      undoShare: (idx) =>
        setPaid((s) => s.map((x, i) => (i === idx ? null : x))),

      paying,
      finish,
      openCardPay,

      myOrders,
      lastOrder,
      exp,
      toggleExp: (id) => setExp((e) => (e === id ? null : id)),
      payShare: (orderId, idx, id) => {
        const o = myOrders.find((x) => x.id === orderId);
        if (!o?.dbId) return;
        (async () => {
          const r = await payShareAction(o.dbId!, idx, appToEnum(id));
          if (r.ok) {
            let ids: string[] = [];
            try {
              ids = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
            } catch {
              ids = [];
            }
            const fresh = await getMyOrdersAction(ids);
            setMyOrders(fresh);
          } else {
            toastMsg(t("payError"));
          }
        })();
      },

      toast,
      toastMsg,
    };
  }, [
    est, beach, loc, spotFromQr, spots, popularNames, menu, step, cart, cartOpen, cat, sub, query, custName, note,
    mode, selPay, parc, people, paid, paying, myOrders, lastOrder, exp, toast,
    storageKey, pendingKey, t,
  ]);

  return (
    <AppContext.Provider value={value}>
      <div className="flex min-h-screen justify-center bg-page">
        <div className="relative w-full max-w-[448px] bg-page">
          {step === "qr" && <QrScreen />}
          {step === "menu" && <MenuScreen />}
          {step === "checkout" && <CheckoutScreen />}
          {step === "done" && lastOrder && <DoneScreen />}
          {step === "myorders" && <MyOrdersScreen />}
          {cartOpen && <CartDrawer />}
          {paying && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-6">
              <div className="flex animate-rise-in flex-col items-center gap-3 rounded-2xl bg-white px-8 py-6 shadow-modal">
                <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-ink/15 border-t-coral" />
                <p className="m-0 text-sm font-semibold text-ink/70">
                  {t("payProcessing")}
                </p>
              </div>
            </div>
          )}
          {cardPay && (
            <CardPaymentModal
              amount={cardPay.amount}
              onPay={(brick) => payCardAction(cardPay.input, brick)}
              onApproved={(order) => {
                setMyOrders((prev) => [order, ...prev]);
                setLastOrder(order);
                try {
                  const ids: string[] = JSON.parse(
                    localStorage.getItem(storageKey) ?? "[]",
                  );
                  if (order.dbId && !ids.includes(order.dbId)) {
                    localStorage.setItem(storageKey, JSON.stringify([order.dbId, ...ids]));
                  }
                } catch {
                  /* localStorage unavailable */
                }
                setCart([]);
                setSelPay(null);
                setParc(1);
                setMode("full");
                setPeople(2);
                setPaid([null, null]);
                setNote("");
                setCardPay(null);
                setStep("done");
              }}
              onClose={() => setCardPay(null)}
            />
          )}
          <ClientToast />
        </div>
      </div>
    </AppContext.Provider>
  );
}
