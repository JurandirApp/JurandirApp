"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Marquee } from "@/components/site/Marquee";
import { cn } from "@/lib/utils";
import { Link, useRouter } from "@/i18n/navigation";
import { login } from "@/lib/auth/actions";

type Mode = "login" | "forgot";

export function LoginScreen() {
  const t = useTranslations("login");
  const tAuth = useTranslations("auth");
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pwVisible, setPwVisible] = useState(false);
  const [remembered, setRemembered] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const clearError = () => setError(null);

  async function doLogin() {
    if (loading) return;
    if (!email.trim() || !pass) {
      setError(t("fillFields"));
      return;
    }
    setLoading(true);
    setError(null);
    const res = await login(email, pass, remembered);
    if (!res.ok) {
      setError(tAuth(res.error));
      setLoading(false);
      return;
    }
    router.replace(res.dest); // keep loading state through navigation
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") doLogin();
  };

  const goForgot = () => {
    setMode("forgot");
    setSent(false);
    setError(null);
  };
  const backToLogin = () => {
    setMode("login");
    setSent(false);
    setError(null);
  };
  const sendReset = () => {
    if (email.trim()) setSent(true); // mock — Fase 3 sends the real reset e-mail (Resend)
  };

  const title = mode === "forgot" ? t("titleForgot") : t("titleLogin");
  const sub = mode === "forgot" ? t("subForgot") : t("subLogin");

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-16px] z-0 -translate-x-1/2 select-none whitespace-nowrap font-display text-[24vw] font-extrabold uppercase leading-none tracking-[-0.05em] text-ink/5"
      >
        Jurandir
      </span>

      <div className="relative z-[1] mx-auto grid w-full max-w-[1152px] flex-1 grid-cols-1 items-center gap-12 px-6 py-12 md:grid-cols-2">
        {/* Branding */}
        <div className="animate-fade-up">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/jurandir-logo-horizontal.svg"
            alt="Jurandir"
            className="block w-[280px] rounded-[14px]"
          />
          <h1 className="mt-7 font-display text-[2.5rem] font-extrabold uppercase leading-[.9] tracking-[-0.02em] sm:text-[3rem] md:text-[3.6rem]">
            {t("welcomeLine1")}
            <span className="mt-1 block text-coral-emph">{t("welcomeLine2")}</span>
          </h1>
          <p className="mt-5 max-w-[400px] text-[17px] leading-[1.6] text-ink/70">
            {t("description")}
          </p>
          <div className="mt-7 flex max-w-[400px] flex-col gap-2.5">
            <FeatureCard icon="qr_code_2">{t("feature1")}</FeatureCard>
            <FeatureCard icon="trending_up">{t("feature2")}</FeatureCard>
          </div>
        </div>

        {/* Auth card */}
        <div
          className="w-full max-w-[420px] animate-fade-up justify-self-center"
          style={{ animationDelay: ".12s" }}
        >
          <div className="overflow-hidden rounded-28 border-2 border-ink bg-white shadow-hard-lg">
            <div className="p-7">
              <h2 className="m-0 font-display text-[22px] font-extrabold uppercase tracking-[-0.01em]">
                {title}
              </h2>
              <p className="mt-1 text-[13px] text-ink/50">{sub}</p>

              {mode === "login" ? (
                <div className="mt-[22px] flex flex-col gap-3.5">
                  <Field label={t("email")}>
                    <IconInput icon="mail">
                      <Input
                        type="text"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          clearError();
                        }}
                        onKeyDown={onKey}
                        placeholder={t("emailPlaceholder")}
                        className="rounded-full py-[13px] pl-[42px] pr-3.5"
                      />
                    </IconInput>
                  </Field>

                  <Field label={t("password")}>
                    <IconInput icon="lock">
                      <Input
                        type={pwVisible ? "text" : "password"}
                        value={pass}
                        onChange={(e) => {
                          setPass(e.target.value);
                          clearError();
                        }}
                        onKeyDown={onKey}
                        placeholder={t("passwordPlaceholder")}
                        className="rounded-full py-[13px] pl-[42px] pr-[46px]"
                      />
                      <button
                        type="button"
                        onClick={() => setPwVisible((v) => !v)}
                        aria-label={pwVisible ? t("hidePassword") : t("showPassword")}
                        className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-transparent text-ink/40"
                      >
                        <Icon
                          name={pwVisible ? "visibility_off" : "visibility"}
                          size={18}
                        />
                      </button>
                    </IconInput>
                  </Field>

                  {error && (
                    <p className="m-0 flex items-center gap-1.5 text-xs font-semibold text-[#e11d48]">
                      <Icon name="error" size={14} />
                      {error}
                    </p>
                  )}

                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setRemembered((r) => !r)}
                      className="flex items-center gap-2 bg-transparent p-0 text-[13px] font-semibold text-ink/60"
                    >
                      <span
                        className="box-border flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-2 border-ink"
                        style={{ background: remembered ? "#141821" : "#fff" }}
                      >
                        {remembered && (
                          <Icon name="check" size={13} className="text-sand" />
                        )}
                      </span>
                      {t("remember")}
                    </button>
                    <button
                      type="button"
                      onClick={goForgot}
                      className="bg-transparent p-0 text-[13px] font-bold text-coral-emph underline decoration-2 underline-offset-[3px]"
                    >
                      {t("forgot")}
                    </button>
                  </div>

                  <Button
                    variant="ink"
                    block
                    onClick={doLogin}
                    disabled={loading}
                    className={cn("rounded-full py-[15px] text-[15px]", loading && "bg-ink/50")}
                  >
                    {loading ? t("entering") : t("enter")}
                    <Icon name="arrow_forward" size={16} />
                  </Button>

                  <p className="m-0 text-center text-xs text-ink/45">
                    {t("accessNote")}
                  </p>
                </div>
              ) : (
                <div className="mt-[22px] flex flex-col gap-3.5">
                  {!sent ? (
                    <>
                      <Field label={t("forgotEmail")}>
                        <IconInput icon="mail">
                          <Input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder={t("emailPlaceholder")}
                            className="rounded-full py-[13px] pl-[42px] pr-3.5"
                          />
                        </IconInput>
                      </Field>
                      <Button
                        variant="ink"
                        block
                        onClick={sendReset}
                        className={cn(
                          "rounded-full py-[15px] text-[15px]",
                          !email.trim() && "bg-ink/30",
                        )}
                      >
                        {t("sendLink")}
                        <Icon name="arrow_forward" size={16} />
                      </Button>
                    </>
                  ) : (
                    <div className="py-2 text-center">
                      <div className="mx-auto mb-3.5 flex h-14 w-14 items-center justify-center rounded-full bg-ink">
                        <Icon name="mark_email_read" size={28} className="text-sun" />
                      </div>
                      <p className="m-0 text-[15px] font-bold">{t("linkSent")}</p>
                      <p className="mt-1.5 text-[13px] leading-[1.5] text-ink/55">
                        {t.rich("linkSentText", {
                          email: email.trim(),
                          b: (c) => <b>{c}</b>,
                        })}
                      </p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={backToLogin}
                    className="flex items-center justify-center gap-1.5 bg-transparent p-0 text-[13px] font-bold text-ink/60"
                  >
                    <Icon name="arrow_back" size={15} />
                    {t("backToLogin")}
                  </button>
                </div>
              )}
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-ink/50">
            {t("notPartner")}{" "}
            <Link href="/" className="font-bold text-coral-emph">
              {t("knowJurandir")}
            </Link>
          </p>
        </div>
      </div>

      <Marquee withIcon={false} border="top" size="base" />
    </div>
  );
}

function FeatureCard({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[14px] border-2 border-ink bg-white px-4 py-3 shadow-hard">
      <Icon name={icon} size={20} className="text-coral-emph" />
      <span className="text-sm font-semibold">{children}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-ink/60">{label}</span>
      {children}
    </label>
  );
}

function IconInput({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="relative mt-1.5">
      <Icon
        name={icon}
        size={17}
        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/35"
      />
      {children}
    </div>
  );
}
