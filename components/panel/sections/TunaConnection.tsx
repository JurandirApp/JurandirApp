"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import type { RouteKey } from "@/lib/payments/capabilities";
import type { TunaMerchantFormInput } from "@/lib/validation";
import { usePanel, type PanelTuna } from "../context";
import { F, MiniDd, formatDoc, formatPhone, onlyDigits } from "./PaymentFormKit";

// Tuna no painel do bar: card em "Conexões" (status Pix / cartão e carteiras +
// botão de cadastro) e o modal do cadastro (Merchant/Register), no visual do
// modal do recebedor Pagar.me.

/** Cadastro que a Tuna ainda está analisando ou já aprovou — não deixa recadastrar. */
const inProgress = (s: string | null) => s === "analysis" || s === "active";

/** Chave i18n (panel.config) do status de um grupo da Tuna (Pix ou cartão). */
function statusKey(status: string | null): string {
  switch (status) {
    case null:
      return "tunaStatusNone";
    case "active":
      return "tunaStatusActive";
    case "rejected":
      return "tunaStatusRejected";
    case "blocked":
      return "tunaStatusBlocked";
    case "error":
      return "tunaStatusError";
    default:
      return "tunaInAnalysis";
  }
}

/** Nota (chave i18n de panel.config) da célula TUNA na matriz método × gateway. */
export function tunaRouteNoteKey(tuna: PanelTuna, key: RouteKey): string {
  if (!tuna.registered) return "needsSetup";
  const pix = key === "pix";
  if (pix ? tuna.pixReady : tuna.cardReady) return "tunaStatusActive";
  const status = pix ? tuna.pixStatus : tuna.cardStatus;
  // Cartão aprovado na Tuna, mas cartões/carteiras ainda não liberados pela plataforma.
  if (status === "active") return "soon";
  return status ? statusKey(status) : "needsSetup";
}

const DOT: Record<string, string> = {
  active: "#10b981",
  analysis: "#f59e0b",
  rejected: "#e11d48",
  blocked: "#e11d48",
  error: "#e11d48",
};

function StatusRow({ label, status, suffix }: { label: string; status: string | null; suffix?: string }) {
  const t = useTranslations("panel.config");
  return (
    <p className="m-0 flex items-center gap-2 text-xs text-ink/70">
      <span
        className="h-2 w-2 flex-shrink-0 rounded-full"
        style={{ background: status ? (DOT[status] ?? DOT.analysis) : "rgba(20,24,33,.25)" }}
      />
      <span className="font-semibold">{label}</span>
      <span className="text-ink/50">
        {t(statusKey(status))}
        {suffix ? ` · ${suffix}` : ""}
      </span>
    </p>
  );
}

/** Card "Tuna" em Conexões (só quando a Tuna está visível pro bar). */
export function TunaConnection() {
  const { tuna, registerTuna, toast } = usePanel();
  const t = useTranslations("panel.config");
  const [open, setOpen] = useState(false);
  // O serviço recusa recadastro enquanto algum grupo está em análise/ativo.
  const canRegister =
    !tuna.registered || (!inProgress(tuna.pixStatus) && !inProgress(tuna.cardStatus));
  const again = tuna.registered || tuna.otherEnv;
  const analysis = tuna.pixStatus === "analysis" || tuna.cardStatus === "analysis";
  const cardsSoon = tuna.cardStatus === "active" && !tuna.cardReady;

  return (
    <div className="rounded-xl border-2 border-ink/10 p-3">
      <p className="m-0 mb-2 text-sm font-semibold text-ink/80">{t("tunaTitle")}</p>
      <div className="flex flex-col gap-1">
        <StatusRow label={t("method_pix")} status={tuna.pixStatus} />
        <StatusRow
          label={t("tunaCardGroup")}
          status={tuna.cardStatus}
          suffix={cardsSoon ? t("soon") : undefined}
        />
      </div>
      {analysis && (
        <p className="m-0 mt-2 text-[11px] leading-relaxed text-ink/45">{t("tunaAnalysisNote")}</p>
      )}
      {canRegister && (
        <>
          <p className="m-0 mb-2 mt-2 text-[11px] leading-relaxed text-ink/45">
            {tuna.otherEnv ? t("tunaOtherEnvHint") : t("tunaHint")}
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-xs font-bold text-sand"
          >
            <Icon name="add_business" size={15} />
            {again ? t("tunaRegisterAgain") : t("tunaRegister")}
          </button>
        </>
      )}
      {open && <TunaModal onClose={() => setOpen(false)} onDone={registerTuna} toast={toast} />}
    </div>
  );
}

// ---- Modal de cadastro na Tuna ---------------------------------------------

type PixKeyType = "1" | "2" | "3" | "4" | "5" | "6";

type TunaForm = {
  documentType: "CNPJ" | "CPF";
  document: string;
  name: string;
  fantasyName: string;
  stateFiscalDocument: string;
  // só CPF
  birthday: string;
  motherName: string;
  occupation: string;
  pixKeyType: PixKeyType;
  pixKey: string;
  bankCode: string;
  accountType: "C" | "S";
  agency: string;
  account: string;
  accountDigit: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  // contato
  cName: string;
  cEmail: string;
  cPhone: string;
  // representante legal
  lrName: string;
  lrDocument: string;
  lrBirthday: string;
};

type Field = keyof TunaForm;

const EMPTY: TunaForm = {
  documentType: "CNPJ",
  document: "",
  name: "",
  fantasyName: "",
  stateFiscalDocument: "ISENTO",
  birthday: "",
  motherName: "",
  occupation: "",
  pixKeyType: "2",
  pixKey: "",
  bankCode: "",
  accountType: "C",
  agency: "",
  account: "",
  accountDigit: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  postalCode: "",
  cName: "",
  cEmail: "",
  cPhone: "",
  lrName: "",
  lrDocument: "",
  lrBirthday: "",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Campos inválidos, pelos mesmos critérios do `tunaMerchantSchema` (o servidor revalida). */
function invalidFields(f: TunaForm): Set<Field> {
  const bad = new Set<Field>();
  const cpf = f.documentType === "CPF";
  const required: Field[] = [
    "name",
    "fantasyName",
    "pixKey",
    "bankCode",
    "agency",
    "account",
    "street",
    "number",
    "neighborhood",
    "city",
    "cName",
    "lrName",
    ...(cpf ? (["motherName", "occupation"] as Field[]) : []),
  ];
  for (const k of required) if (!f[k].trim()) bad.add(k);
  if (onlyDigits(f.document).length !== (cpf ? 11 : 14)) bad.add("document");
  if (cpf && !DATE.test(f.birthday)) bad.add("birthday");
  if (!/^[\dxX]$/.test(f.accountDigit.trim())) bad.add("accountDigit");
  if (!/^[A-Za-z]{2}$/.test(f.state.trim())) bad.add("state");
  if (onlyDigits(f.postalCode).length !== 8) bad.add("postalCode");
  if (!EMAIL.test(f.cEmail.trim())) bad.add("cEmail");
  if (onlyDigits(f.cPhone).length < 10) bad.add("cPhone");
  if (onlyDigits(f.lrDocument).length !== 11) bad.add("lrDocument");
  if (!DATE.test(f.lrBirthday)) bad.add("lrBirthday");
  return bad;
}

function toInput(f: TunaForm): TunaMerchantFormInput {
  const cpf = f.documentType === "CPF";
  return {
    documentType: f.documentType,
    document: f.document,
    name: f.name.trim(),
    fantasyName: f.fantasyName.trim(),
    pixKeyType: f.pixKeyType,
    pixKey: f.pixKey.trim(),
    contact: { name: f.cName.trim(), email: f.cEmail.trim(), phone: f.cPhone },
    legalRepresentative: { name: f.lrName.trim(), document: f.lrDocument, birthday: f.lrBirthday },
    bank: {
      bankCode: f.bankCode,
      agency: f.agency,
      account: `${onlyDigits(f.account)}-${f.accountDigit.trim()}`,
      accountType: f.accountType,
    },
    address: {
      street: f.street.trim(),
      number: f.number.trim(),
      complement: f.complement.trim() || undefined,
      neighborhood: f.neighborhood.trim(),
      city: f.city.trim(),
      state: f.state.trim(),
      postalCode: f.postalCode,
    },
    stateFiscalDocument: f.stateFiscalDocument.trim() || undefined,
    ...(cpf
      ? { birthday: f.birthday, motherName: f.motherName.trim(), occupation: f.occupation.trim() }
      : {}),
    acceptedContract: true,
  };
}

function TunaModal({
  onClose,
  onDone,
  toast,
}: {
  onClose: () => void;
  onDone: (form: TunaMerchantFormInput) => Promise<{ ok: boolean; error?: string }>;
  toast: (msg: string) => void;
}) {
  const t = useTranslations("panel.config");
  const [form, setForm] = useState<TunaForm>(EMPTY);
  const [invalid, setInvalid] = useState<Set<Field>>(new Set());
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  // Resposta perdida ("tryLater"): o cadastro pode ter chegado — não reenviar daqui.
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cpf = form.documentType === "CPF";

  const set = (k: Field, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setInvalid((prev) => {
      if (!prev.has(k)) return prev;
      const next = new Set(prev);
      next.delete(k);
      return next;
    });
  };
  const bad = (k: Field) => (invalid.has(k) ? "border-[#e11d48]" : undefined);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const errorMessage = (e?: string): string => {
    switch (e) {
      case "invalid":
        return t("tunaInvalid");
      case "notConfigured":
        return t("tunaNotConfigured");
      case "notAvailable":
        return t("tunaNotAvailable");
      case "alreadyRegistered":
        return t("tunaAlreadyRegistered");
      case "tunaRejected":
        return t("tunaRejected");
      case undefined:
      case "":
      case "error":
      case "notFound":
        return t("tunaError");
      default:
        return e; // mensagem curta da própria Tuna
    }
  };

  const submit = async () => {
    if (saving || sent || !accepted) return;
    setErr(null);
    const found = invalidFields(form);
    setInvalid(found);
    if (found.size) {
      setErr(t("tunaInvalid"));
      return;
    }
    setSaving(true);
    const r = await onDone(toInput(form));
    setSaving(false);
    if (r.ok) {
      toast(t("tunaRegistered"));
      onClose();
    } else if (r.error === "tryLater") {
      setSent(true);
      setNotice(t("tunaTryLater"));
    } else {
      setErr(errorMessage(r.error));
    }
  };

  const sectionTitle = "m-0 mt-1 text-[11px] font-bold uppercase tracking-wide text-ink/40";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/60 md:items-center md:p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-t-2xl bg-white p-5 md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="m-0 font-display text-lg font-extrabold uppercase tracking-[-0.01em]">
            {t("tunaRegister")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("pgCancel")}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-transparent text-ink/50"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <p className="m-0 mb-2 text-xs leading-relaxed text-ink/50">{t("tunaModalHint")}</p>
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-[11px] leading-snug text-[#92400e]">
          <Icon name="info" size={14} className="mt-px flex-none" />
          <span className="min-w-0 flex-1">{t("tunaAnalysisNote")}</span>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2">
            <F label={t("pgType")}>
              <MiniDd
                value={form.documentType}
                onChange={(v) =>
                  setForm((f) => {
                    const documentType = v as TunaForm["documentType"];
                    const pf = documentType === "CPF";
                    return {
                      ...f,
                      documentType,
                      document: formatDoc(f.document, pf ? "individual" : "corporation"),
                      // Chave Pix por documento acompanha o tipo do cadastro.
                      pixKeyType:
                        f.pixKeyType === "1" || f.pixKeyType === "2" ? (pf ? "1" : "2") : f.pixKeyType,
                    };
                  })
                }
                options={[
                  { value: "CNPJ", label: `${t("pgCorporation")} (CNPJ)` },
                  { value: "CPF", label: `${t("pgIndividual")} (CPF)` },
                ]}
              />
            </F>
            <F req label={t("pgDocument")}>
              <Input
                value={form.document}
                onChange={(e) => set("document", formatDoc(e.target.value, cpf ? "individual" : "corporation"))}
                inputMode="numeric"
                placeholder={cpf ? "000.000.000-00" : "00.000.000/0000-00"}
                className={bad("document")}
              />
            </F>
            <F req className="col-span-2" label={t("pgName")}>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} className={bad("name")} />
            </F>
            <F req label={t("tunaFantasyName")}>
              <Input value={form.fantasyName} onChange={(e) => set("fantasyName", e.target.value)} className={bad("fantasyName")} />
            </F>
            <F label={t("tunaStateFiscal")}>
              <Input value={form.stateFiscalDocument} onChange={(e) => set("stateFiscalDocument", e.target.value)} placeholder="ISENTO" />
            </F>
            {cpf && (
              <>
                <F req label={t("pgBirthdate")}>
                  <Input type="date" value={form.birthday} onChange={(e) => set("birthday", e.target.value)} className={bad("birthday")} />
                </F>
                <F req label={t("pgOccupation")}>
                  <Input value={form.occupation} onChange={(e) => set("occupation", e.target.value)} className={bad("occupation")} />
                </F>
                <F req className="col-span-2" label={t("pgMother")}>
                  <Input value={form.motherName} onChange={(e) => set("motherName", e.target.value)} className={bad("motherName")} />
                </F>
              </>
            )}
          </div>

          <p className={sectionTitle}>{t("tunaPixTitle")}</p>
          <p className="m-0 -mt-1.5 text-[11px] leading-relaxed text-ink/45">{t("tunaSameDocHint")}</p>
          <div className="grid grid-cols-2 gap-2">
            <F label={t("tunaPixKeyType")}>
              <MiniDd
                value={form.pixKeyType}
                onChange={(v) => set("pixKeyType", v)}
                options={(["1", "2", "3", "4", "5", "6"] as const).map((v) => ({
                  value: v,
                  label: t(`tunaPixType${v}`),
                }))}
              />
            </F>
            <F req label={t("tunaPixKey")}>
              <Input value={form.pixKey} onChange={(e) => set("pixKey", e.target.value)} className={bad("pixKey")} />
            </F>
          </div>

          <p className={sectionTitle}>{t("pgBankTitle")}</p>
          <div className="grid grid-cols-2 gap-2">
            <F req label={t("pgBank")}>
              <Input
                value={form.bankCode}
                onChange={(e) => set("bankCode", onlyDigits(e.target.value).slice(0, 3))}
                inputMode="numeric"
                placeholder="Ex: 341"
                className={bad("bankCode")}
              />
            </F>
            <F label={t("pgAccountType")}>
              <MiniDd
                value={form.accountType}
                onChange={(v) => set("accountType", v)}
                options={[
                  { value: "C", label: t("pgChecking") },
                  { value: "S", label: t("pgSavings") },
                ]}
              />
            </F>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <F req label={t("pgBranch")}>
              <Input
                value={form.agency}
                onChange={(e) => set("agency", onlyDigits(e.target.value))}
                inputMode="numeric"
                placeholder="0001"
                className={bad("agency")}
              />
            </F>
            <F req label={t("pgAccount")}>
              <Input
                value={form.account}
                onChange={(e) => set("account", onlyDigits(e.target.value))}
                inputMode="numeric"
                placeholder="12345"
                className={bad("account")}
              />
            </F>
            <F req label={t("pgAccountDigit")}>
              <Input
                value={form.accountDigit}
                onChange={(e) => set("accountDigit", e.target.value.replace(/[^\dxX]/g, "").slice(0, 1))}
                placeholder="6"
                className={bad("accountDigit")}
              />
            </F>
          </div>

          <p className={sectionTitle}>{t("pgAddressTitle")}</p>
          <div className="grid grid-cols-2 gap-2">
            <F req className="col-span-2" label={t("pgStreet")}>
              <Input value={form.street} onChange={(e) => set("street", e.target.value)} className={bad("street")} />
            </F>
            <F req label={t("pgStreetNumber")}>
              <Input value={form.number} onChange={(e) => set("number", e.target.value)} className={bad("number")} />
            </F>
            <F label={t("pgComplement")}>
              <Input value={form.complement} onChange={(e) => set("complement", e.target.value)} placeholder={t("pgComplementPh")} />
            </F>
            <F req label={t("pgNeighborhood")}>
              <Input value={form.neighborhood} onChange={(e) => set("neighborhood", e.target.value)} className={bad("neighborhood")} />
            </F>
            <F req label={t("pgCity")}>
              <Input value={form.city} onChange={(e) => set("city", e.target.value)} className={bad("city")} />
            </F>
            <F req label={t("pgState")}>
              <Input
                value={form.state}
                onChange={(e) => set("state", e.target.value.toUpperCase().slice(0, 2))}
                placeholder="SC"
                className={bad("state")}
              />
            </F>
            <F req label={t("pgZip")}>
              <Input
                value={form.postalCode}
                onChange={(e) => set("postalCode", onlyDigits(e.target.value).slice(0, 8))}
                inputMode="numeric"
                placeholder="88300000"
                className={bad("postalCode")}
              />
            </F>
          </div>

          <p className={sectionTitle}>{t("tunaContactTitle")}</p>
          <div className="grid grid-cols-2 gap-2">
            <F req className="col-span-2" label={t("tunaContactName")}>
              <Input value={form.cName} onChange={(e) => set("cName", e.target.value)} className={bad("cName")} />
            </F>
            <F req label={t("pgEmail")}>
              <Input value={form.cEmail} onChange={(e) => set("cEmail", e.target.value)} inputMode="email" className={bad("cEmail")} />
            </F>
            <F req label={t("pgPhone")}>
              <Input
                value={form.cPhone}
                onChange={(e) => set("cPhone", formatPhone(e.target.value))}
                inputMode="tel"
                placeholder="(47) 99999-9999"
                className={bad("cPhone")}
              />
            </F>
          </div>

          <p className={sectionTitle}>{t("tunaLegalRepTitle")}</p>
          <div className="grid grid-cols-2 gap-2">
            <F req className="col-span-2" label={t("tunaLegalRepName")}>
              <Input value={form.lrName} onChange={(e) => set("lrName", e.target.value)} className={bad("lrName")} />
            </F>
            <F req label={t("tunaLegalRepCpf")}>
              <Input
                value={form.lrDocument}
                onChange={(e) => set("lrDocument", formatDoc(e.target.value, "individual"))}
                inputMode="numeric"
                placeholder="000.000.000-00"
                className={bad("lrDocument")}
              />
            </F>
            <F req label={t("pgBirthdate")}>
              <Input type="date" value={form.lrBirthday} onChange={(e) => set("lrBirthday", e.target.value)} className={bad("lrBirthday")} />
            </F>
          </div>

          <label className="mt-1 flex items-start gap-2 text-[12px] font-medium leading-snug text-ink/70">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 flex-none accent-ink"
            />
            {t("tunaAccept")}
          </label>

          {err && <p className="m-0 text-xs font-medium text-[#e11d48]">{err}</p>}
          {notice && (
            <p className="m-0 rounded-lg bg-[#fffbeb] px-3 py-2 text-xs font-medium text-[#92400e]">{notice}</p>
          )}
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={saving || sent || !accepted}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink px-3.5 py-2.5 text-sm font-bold text-sand disabled:opacity-50"
            >
              {saving ? <Icon name="hourglass_empty" size={15} /> : <Icon name="check" size={15} />}
              {saving ? t("pgSaving") : t("tunaSubmit")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-ink/[0.06] px-4 py-2.5 text-sm font-bold text-ink/60"
            >
              {sent ? t("tunaClose") : t("pgCancel")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
