"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import {
  type MenuItem,
  type Order,
  type PanelPrintJob,
  type ProfileForm,
  type Qr,
} from "@/lib/data/panel";
import type { MonthlyStatLite } from "@/lib/admin/scale";
import { padId } from "@/lib/panel/helpers";
import {
  addQrSpotAction,
  changePasswordAction,
  checkPixReadyAction,
  createPagarmeRecipientAction,
  generatePagarmeKycLinkAction,
  deleteMenuItemAction,
  deleteQrSpotAction,
  deliverOrderAction,
  disconnectMpAction,
  generatePrintTokenAction,
  getMpConnectUrlForMeAction,
  printOrderAction,
  refreshOrdersAction,
  refreshPrintJobsAction,
  saveEstablishmentImageAction,
  savePaymentRoutingAction,
  savePrinterConfigAction,
  saveProfileAction,
  signEstablishmentImageUploadAction,
  testPrintAction,
  upsertMenuItemAction,
} from "@/lib/actions/panel";
import type { OrdersPeriod } from "@/lib/domain/period";
import type { WeekSchedule } from "@/lib/domain/schedule";
import type { PagarmeRecipientForm } from "@/lib/validation";
import {
  PanelContext,
  type AuditFilters,
  type PanelValue,
  type PrinterForm,
  type PwForm,
  type TabId,
  type Toggles,
} from "./context";
import { Sidebar } from "./Sidebar";
import { NotificationBell } from "./NotificationBell";
import { RealtimeNotif } from "./RealtimeNotif";
import { Toast } from "./Toast";
import { PedidosSection } from "./sections/PedidosSection";
import { CardapioSection } from "./sections/CardapioSection";
import { QrSection } from "./sections/QrSection";
import { KpisSection } from "./sections/KpisSection";
import { AuditoriaSection } from "./sections/AuditoriaSection";
import { PerfilSection } from "./sections/PerfilSection";
import { ConfigSection } from "./sections/ConfigSection";
import { ItemEditorModal } from "./modals/ItemEditorModal";
import { ConfirmDialog } from "./modals/ConfirmDialog";
import { QrZoomModal } from "./modals/QrZoomModal";

const EMPTY_AUD: AuditFilters = { from: "", to: "", mesa: "", method: "" };
const EMPTY_PW: PwForm = { cur: "", nova: "", conf: "" };

export function PanelApp({
  now,
  slug,
  dayStartHour,
  dayStartSet: dayStartSet0,
  weekly: weekly0,
  profile: profile0,
  images,
  orders: orders0,
  menu: menu0,
  qrs: qrs0,
  stats,
  printJobs: printJobs0,
  printer: printer0,
  mpConnected: mpConnected0,
  mpPixReady: mpPixReady0,
  mpResult = null,
  gatewayPix: gatewayPix0,
  gatewayCredit: gatewayCredit0,
  gatewayDebit: gatewayDebit0,
  pagarmeReady: pagarmeReady0,
  pagarmeStatus: pagarmeStatus0,
}: {
  now: number;
  slug: string;
  dayStartHour: number;
  dayStartSet: boolean;
  weekly: WeekSchedule;
  profile: ProfileForm;
  images: { cover: string | null; logo: string | null };
  orders: Order[];
  menu: MenuItem[];
  qrs: Qr[];
  stats: MonthlyStatLite[];
  printJobs: PanelPrintJob[];
  printer: { ip: string; enabled: boolean; hasToken: boolean };
  mpConnected: boolean;
  mpPixReady: boolean | null;
  mpResult?: "ok" | "error" | null;
  gatewayPix: string;
  gatewayCredit: string;
  gatewayDebit: string;
  pagarmeReady: boolean;
  pagarmeStatus: string | null;
}) {
  const t = useTranslations("panel");
  const beach = true; // Quiosque do Mar (mock)
  const [, startTransition] = useTransition();

  const [orders, setOrders] = useState<Order[]>(orders0);
  const [menu, setMenu] = useState<MenuItem[]>(menu0);
  const [qrs, setQrs] = useState<Qr[]>(qrs0);
  const [printJobs, setPrintJobs] = useState<PanelPrintJob[]>(printJobs0);

  const [tab, setTab] = useState<TabId>("pedidos");
  const [navOpen, setNavOpen] = useState(false); // sidebar mobile (hambúrguer)
  const [orderFilter, setOrderFilter] = useState("todos");
  const [ordersPeriod, setOrdersPeriodState] = useState<OrdersPeriod>({ kind: "hoje" });
  const [dayStart, setDayStart] = useState(dayStartHour);
  const [dayStartSet, setDayStartSet] = useState(dayStartSet0);
  const [weekly, setWeeklyState] = useState<WeekSchedule>(weekly0);
  const [period, setPeriod] = useState("hoje");
  const [openPay, setOpenPay] = useState<string | null>(null);
  const [menuCat, setMenuCat] = useState("Todos");
  const [itemCat, setItemCat] = useState("Todos");
  const [qrLabel, setQrLabel] = useState("");
  const [aud, setAudState] = useState<AuditFilters>(EMPTY_AUD);
  const [audPage, setAudPage] = useState(1);

  const [profile, setProfileState] = useState<ProfileForm>(profile0);
  const [profSaved, setProfSaved] = useState(false);
  const [coverImg, setCoverImg] = useState<string | null>(images.cover);
  const [logoImg, setLogoImg] = useState<string | null>(images.logo);
  const [uploadingImg, setUploadingImg] = useState<"cover" | "logo" | null>(null);
  const [pw, setPwState] = useState<PwForm>(EMPTY_PW);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [printer, setPrinterState] = useState<PrinterForm>({
    conn: "rede",
    ip: printer0.ip,
    port: "9100",
    model: "Epson TM-T20",
  });
  const [printEnabled, setPrintEnabledState] = useState(printer0.enabled);
  const [hasPrintToken, setHasPrintToken] = useState(printer0.hasToken);
  const [printToken, setPrintToken] = useState<string | null>(null);
  const [mpConnected, setMpConnected] = useState(mpConnected0);
  const [mpPixReady, setMpPixReady] = useState<boolean | null>(mpPixReady0);
  const [gatewayPix, setGatewayPixState] = useState(gatewayPix0);
  const [gatewayCredit, setGatewayCreditState] = useState(gatewayCredit0);
  const [gatewayDebit, setGatewayDebitState] = useState(gatewayDebit0);
  const [pagarmeReady, setPagarmeReady] = useState(pagarmeReady0);
  const [pagarmeStatus, setPagarmeStatus] = useState<string | null>(pagarmeStatus0);
  const [prMsg, setPrMsg] = useState<string | null>(null);
  const [toggles, setToggles] = useState<Toggles>({ auto: true, wa: true, em: true });

  const [toastText, setToastText] = useState<string | null>(null);
  const [notif, setNotif] = useState<Order | null>(null);

  // Modals held locally (sections trigger them via actions).
  const [editing, setEditing] = useState<{ item: MenuItem | null } | null>(null);
  const [delItem, setDelItem] = useState<MenuItem | null>(null);
  const [delQr, setDelQr] = useState<Qr | null>(null);
  const [qrZoom, setQrZoom] = useState<Qr | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Order dbIds already known to this session — new ones (from later polls) ring the bell.
  const seenOrders = useRef<Set<string>>(
    new Set(orders0.map((o) => o.dbId).filter((x): x is string => Boolean(x))),
  );
  // Período exibido, vivo para o poll de 15s decidir se dá ping de novo pedido.
  const ordersPeriodRef = useRef<OrdersPeriod>({ kind: "hoje" });

  const toast = (msg: string) => {
    setToastText(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastText(null), 2400);
  };

  // Poll the establishment's real orders every 15s. New orders (created by
  // customers in the app) ring the bell + join the list; statuses stay in sync
  // with the DB. Fase 6 swaps polling for push (Supabase Realtime / Pusher).
  useEffect(() => {
    const poll = async () => {
      try {
        const p = ordersPeriodRef.current;
        const fresh = await refreshOrdersAction(p);
        // Só toca o sininho de "novo pedido" na visão de hoje (a visão viva do
        // balcão). Em períodos passados, só atualiza a lista, sem ping.
        const newOnes =
          p.kind === "hoje"
            ? fresh.filter((o) => o.dbId && !seenOrders.current.has(o.dbId))
            : [];
        fresh.forEach((o) => o.dbId && seenOrders.current.add(o.dbId));
        setOrders(fresh);
        if (newOnes.length > 0) {
          setNotif(newOnes[0]);
          try {
            navigator.vibrate?.(80);
          } catch {}
          if (notifTimer.current) clearTimeout(notifTimer.current);
          notifTimer.current = setTimeout(() => setNotif(null), 6500);
        }
      } catch {
        /* transient — the next tick retries */
      }
    };
    const id = setInterval(poll, 15000);
    return () => {
      clearInterval(id);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (notifTimer.current) clearTimeout(notifTimer.current);
    };
  }, []);

  const value = useMemo<PanelValue>(() => {
    return {
      beach,
      restName: profile.name,
      slug,
      now,
      orders,
      menu,
      qrs,
      stats,
      tab,
      setTab: (t) => {
        setTab(t);
        setOpenPay(null);
      },
      toast,

      orderFilter,
      setOrderFilter,
      ordersPeriod,
      setOrdersPeriod: (p: OrdersPeriod) => {
        setOrdersPeriodState(p);
        ordersPeriodRef.current = p;
        // Refetch imediato; marca tudo como visto (sem ping — é troca de visão).
        refreshOrdersAction(p)
          .then((fresh) => {
            fresh.forEach((o) => o.dbId && seenOrders.current.add(o.dbId));
            setOrders(fresh);
          })
          .catch(() => {});
      },
      dayStartHour: dayStart,
      dayStartSet,
      deliverOrder: (id) => {
        const o = orders.find((x) => x.id === id);
        setOrders((prev) =>
          prev.map((x) => (x.id === id ? { ...x, st: "entregue" } : x)),
        );
        toast(t("toasts.orderDelivered", { id: padId(id) }));
        if (o?.dbId) startTransition(() => deliverOrderAction(o.dbId!));
      },
      printOrder: (id) => {
        const o = orders.find((x) => x.id === id);
        if (!o?.dbId) return;
        startTransition(async () => {
          try {
            const r = await printOrderAction(o.dbId!);
            toast(
              r.ok
                ? t("toasts.printOrder", { id: padId(id) })
                : t("toasts.printError"),
            );
          } catch {
            toast(t("toasts.printError"));
          }
          refreshPrintJobsAction().then(setPrintJobs).catch(() => {});
        });
      },

      menuCat,
      setMenuCat,
      openEditor: (item) => setEditing({ item }),
      askDeleteItem: (item) => setDelItem(item),
      csvModel: () => toast(t("toasts.csvModel")),
      csvImport: () => toast(t("toasts.csvImport")),

      qrLabel,
      setQrLabel,
      addQr: () => {
        const lbl = qrLabel.trim();
        if (!lbl) return;
        if (qrs.some((q) => q.label.toLowerCase() === lbl.toLowerCase())) {
          setQrLabel("");
          return;
        }
        startTransition(async () => {
          const r = await addQrSpotAction(lbl);
          if (r.ok && r.qr) setQrs((prev) => [...prev, r.qr!]);
          else toast(t("toasts.qrError"));
        });
        setQrLabel("");
      },
      openZoom: (q) => setQrZoom(q),
      askDeleteQr: (q) => setDelQr(q),

      period,
      setPeriod: (p) => {
        setPeriod(p);
        setOpenPay(null);
        setItemCat("Todos");
      },
      openPay,
      setOpenPay,
      itemCat,
      setItemCat,

      aud,
      setAud: (k, v) => {
        setAudState((prev) => ({ ...prev, [k]: v }));
        setAudPage(1);
      },
      clearAud: () => {
        setAudState(EMPTY_AUD);
        setAudPage(1);
      },
      audPage,
      setAudPage,

      profile,
      setProfile: (k, v) => {
        setProfileState((prev) => ({ ...prev, [k]: v }));
        setProfSaved(false);
      },
      weekly,
      setWeekly: (w: WeekSchedule) => {
        setWeeklyState(w);
        setProfSaved(false);
      },
      profSaved,
      saveProfile: () => {
        startTransition(async () => {
          try {
            const r = await saveProfileAction({
              name: profile.name,
              tagline: profile.tagline,
              desc: profile.desc,
              address: profile.address,
              weekly,
              serviceFee: Number(profile.serviceFee) || 0,
              radius: profile.radius,
              phone: profile.phone,
              email: profile.email,
              website: profile.website,
              whatsapp: profile.whatsapp,
              instagram: profile.instagram,
            });
            if (r.ok) {
              setProfSaved(true);
              toast(t("toasts.profileSaved"));
              // O horário mudou a fronteira do "dia operacional" — reflete no
              // filtro de pedidos e refaz a busca do período atual.
              if (typeof r.dayStartHour === "number") setDayStart(r.dayStartHour);
              setDayStartSet(true);
              refreshOrdersAction(ordersPeriodRef.current)
                .then((fresh) => {
                  fresh.forEach((o) => o.dbId && seenOrders.current.add(o.dbId));
                  setOrders(fresh);
                })
                .catch(() => {});
            } else {
              toast(t("toasts.profileError"));
            }
          } catch {
            toast(t("toasts.profileError"));
          }
        });
      },
      coverImg,
      logoImg,
      uploadingImg,
      uploadImage: (kind, file) => {
        setUploadingImg(kind);
        (async () => {
          try {
            const signed = await signEstablishmentImageUploadAction(kind);
            if (!signed) {
              toast(t("toasts.imgNotConfigured"));
              return;
            }
            const body = new FormData();
            body.append("file", file);
            body.append("api_key", signed.apiKey);
            body.append("timestamp", String(signed.timestamp));
            body.append("folder", signed.folder);
            body.append("signature", signed.signature);
            const res = await fetch(
              `https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`,
              { method: "POST", body },
            );
            if (!res.ok) throw new Error("upload-failed");
            const data = (await res.json()) as { secure_url?: string };
            if (!data.secure_url) throw new Error("no-url");
            const saved = await saveEstablishmentImageAction(kind, data.secure_url);
            if (!saved.ok) throw new Error("save-failed");
            if (kind === "cover") setCoverImg(data.secure_url);
            else setLogoImg(data.secure_url);
            toast(t("toasts.imgSaved"));
          } catch {
            toast(t("toasts.imgError"));
          } finally {
            setUploadingImg(null);
          }
        })();
      },

      pw,
      setPw: (k, v) => setPwState((prev) => ({ ...prev, [k]: v })),
      savePw: () => {
        if (!pw.cur || !pw.nova || !pw.conf)
          return setPwMsg({ ok: false, t: t("config.pwFillAll") });
        if (pw.nova.length < 6)
          return setPwMsg({ ok: false, t: t("config.pwTooShort") });
        if (pw.nova !== pw.conf)
          return setPwMsg({ ok: false, t: t("config.pwMismatch") });
        startTransition(async () => {
          const r = await changePasswordAction(pw.cur, pw.nova);
          if (!r.ok) {
            setPwMsg({
              ok: false,
              t: t(
                `config.${r.error === "pwWrongCurrent" ? "pwWrongCurrent" : "pwTooShort"}`,
              ),
            });
            return;
          }
          setPwMsg({ ok: true, t: t("config.pwSuccess") });
          setPwState(EMPTY_PW);
        });
      },
      pwMsg,
      toggles,
      flipToggle: (k) => setToggles((prev) => ({ ...prev, [k]: !prev[k] })),
      printer,
      setPrinter: (k, v) => setPrinterState((prev) => ({ ...prev, [k]: v })),
      savePrinter: () => {
        startTransition(async () => {
          await savePrinterConfigAction(printer.ip, printEnabled);
          setPrMsg(t("config.printerSaved"));
        });
      },
      testPrint: () => {
        startTransition(async () => {
          const r = await testPrintAction();
          setPrMsg(
            r.hasToken
              ? t("config.testQueued")
              : t("config.testQueuedNoToken"),
          );
          refreshPrintJobsAction().then(setPrintJobs).catch(() => {});
        });
      },
      prMsg,
      printEnabled,
      setPrintEnabled: (v) => {
        setPrintEnabledState(v);
        startTransition(async () => {
          await savePrinterConfigAction(printer.ip, v);
        });
      },
      hasPrintToken,
      printToken,
      generatePrintToken: () => {
        startTransition(async () => {
          const r = await generatePrintTokenAction();
          if (r.ok) {
            setPrintToken(r.token);
            setHasPrintToken(true);
          }
        });
      },
      mpConnected,
      mpPixReady,
      checkPix: async () => {
        const r = await checkPixReadyAction();
        setMpPixReady(r.connected ? r.ready : null);
        return r;
      },
      mpResult,
      connectMp: () => {
        getMpConnectUrlForMeAction()
          .then((r) => {
            if (r.ok && r.url) window.location.href = r.url;
          })
          .catch(() => {});
      },
      disconnectMp: () => {
        startTransition(async () => {
          await disconnectMpAction();
          setMpConnected(false);
          setMpPixReady(null);
        });
      },
      gatewayPix,
      gatewayCredit,
      gatewayDebit,
      setGateway: (method: "pix" | "credit" | "debit", v: string) => {
        const prev = { pix: gatewayPix, credit: gatewayCredit, debit: gatewayDebit };
        const next = { ...prev, [method]: v };
        setGatewayPixState(next.pix);
        setGatewayCreditState(next.credit);
        setGatewayDebitState(next.debit);
        startTransition(async () => {
          const r = await savePaymentRoutingAction(next);
          if (r.ok) {
            // O servidor pode ter feito fallback (ex.: gateway não pronto) → reflete.
            setGatewayPixState(r.pix);
            setGatewayCreditState(r.credit);
            setGatewayDebitState(r.debit);
          } else {
            setGatewayPixState(prev.pix);
            setGatewayCreditState(prev.credit);
            setGatewayDebitState(prev.debit);
            toast(t("config.pixRoutingError"));
          }
        });
      },
      pagarmeReady,
      pagarmeStatus,
      createPagarmeRecipient: async (form: PagarmeRecipientForm) => {
        const r = await createPagarmeRecipientAction(form);
        if (r.ok) {
          setPagarmeReady(true);
          setPagarmeStatus(r.status ?? "registration");
        }
        return { ok: r.ok, error: r.error };
      },
      generatePagarmeKycLink: () => generatePagarmeKycLinkAction(),
      printJobs,
      refreshPrintJobs: () => {
        refreshPrintJobsAction()
          .then(setPrintJobs)
          .catch(() => {});
      },
    };
  }, [
    t, beach, now, slug, orders, menu, qrs, stats, tab, orderFilter, ordersPeriod, dayStart,
    dayStartSet, period, openPay, menuCat,
    itemCat, qrLabel, aud, audPage, profile, weekly, profSaved, pw, pwMsg,
    printer, prMsg, toggles, printJobs, printEnabled, hasPrintToken, printToken,
    mpConnected, mpPixReady, mpResult, coverImg, logoImg, uploadingImg,
    gatewayPix, gatewayCredit, gatewayDebit, pagarmeReady, pagarmeStatus,
  ]);

  const saveItem = (clean: MenuItem) => {
    startTransition(async () => {
      const r = await upsertMenuItemAction({
        id: clean.dbId,
        name: clean.name,
        description: clean.desc,
        price: clean.price,
        oldPrice: clean.old,
        photo: clean.photo,
        measure: clean.measure,
        unit: clean.unit,
        category: clean.cat,
        subcategory: clean.sub,
        active: true,
      });
      if (r.ok && r.item) {
        setMenu((prev) =>
          prev.some((x) => x.dbId === r.item!.dbId)
            ? prev.map((x) => (x.dbId === r.item!.dbId ? r.item! : x))
            : [...prev, r.item!],
        );
        setEditing(null);
        toast(t("toasts.itemSaved"));
      } else {
        toast(t("toasts.itemError"));
      }
    });
  };

  return (
    <PanelContext.Provider value={value}>
      <div className="min-h-screen bg-page">
        <header className="sticky top-0 z-40 flex h-[84px] items-center gap-1 bg-ink pl-2 lg:gap-0 lg:pl-0">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label={t("sidebar.open")}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-sand lg:hidden"
          >
            <Icon name="menu" size={26} />
          </button>
          <div className="box-border flex-shrink-0 p-3">
            {/* Altura fixa + largura automática → o logo nunca "estoura" para o
                tamanho natural do SVG, mesmo se a classe de largura do box faltar. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/jurandir-logo-horizontal.svg"
              alt="Jurandir"
              className="block h-11 w-auto max-w-full rounded-[10px] lg:h-[52px]"
            />
          </div>
        </header>

        <NotificationBell />

        <div className="flex min-h-[calc(100vh-84px)] items-stretch">
          {navOpen && (
            // Backdrop (só mobile) — clicar fecha a sidebar.
            <button
              type="button"
              aria-label={t("sidebar.close")}
              onClick={() => setNavOpen(false)}
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            />
          )}
          <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
          <main className="box-border min-w-0 flex-1 p-6 md:px-7 md:py-6">
            {tab === "pedidos" && <PedidosSection />}
            {tab === "cardapio" && <CardapioSection />}
            {tab === "qrcodes" && <QrSection />}
            {tab === "kpis" && <KpisSection />}
            {tab === "auditoria" && <AuditoriaSection />}
            {tab === "perfil" && <PerfilSection />}
            {tab === "config" && <ConfigSection />}
          </main>
        </div>

        {editing && (
          <ItemEditorModal
            item={editing.item}
            onClose={() => setEditing(null)}
            onSave={saveItem}
            onToast={toast}
          />
        )}
        {delItem && (
          <ConfirmDialog
            icon="delete"
            title={t("confirm.deleteItemTitle")}
            body={t.rich("confirm.deleteItemBody", {
              name: delItem.name,
              b: (c) => <b>{c}</b>,
            })}
            confirmLabel={t("confirm.delete")}
            onCancel={() => setDelItem(null)}
            onConfirm={() => {
              setMenu((prev) => prev.filter((x) => x.dbId !== delItem.dbId));
              if (delItem.dbId) startTransition(() => deleteMenuItemAction(delItem.dbId!));
              setDelItem(null);
            }}
          />
        )}
        {delQr && (
          <ConfirmDialog
            icon="delete"
            title={t("confirm.deleteQrTitle")}
            body={t.rich("confirm.deleteQrBody", {
              label: delQr.label,
              b: (c) => <b>{c}</b>,
            })}
            confirmLabel={t("confirm.delete")}
            onCancel={() => setDelQr(null)}
            onConfirm={() => {
              setQrs((prev) => prev.filter((x) => x.id !== delQr.id));
              startTransition(() => deleteQrSpotAction(delQr.id));
              setDelQr(null);
            }}
          />
        )}
        {qrZoom && (
          <QrZoomModal
            qr={qrZoom}
            slug={slug}
            restName={profile.name}
            onClose={() => setQrZoom(null)}
            onPrint={() => toast(t("toasts.qrPrint"))}
          />
        )}

        <RealtimeNotif notif={notif} onDismiss={() => setNotif(null)} />
        <Toast text={toastText} />
      </div>
    </PanelContext.Provider>
  );
}
