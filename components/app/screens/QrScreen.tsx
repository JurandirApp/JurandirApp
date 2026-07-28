"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { PAY_LOGOS } from "@/lib/data/app";
import { useApp } from "../context";
import { SpotModal } from "../SpotModal";

export function QrScreen() {
  const { est, beach, loc, spotFromQr, custName, setCustName, goMenu } = useApp();
  const t = useTranslations("app");

  // Sem QR (chegou pela landing): abre o modal de escolha do guarda-sol/mesa já
  // na chegada. Com QR (?local=), o lugar é fixo e não há modal.
  const [spotModal, setSpotModal] = useState(!spotFromQr);

  const qrData = `https://jurandir.app/${est.slug}?local=${loc}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=6&data=${encodeURIComponent(
    qrData,
  )}`;

  return (
    <div
      className="pb-6 text-center"
      style={{
        background:
          "radial-gradient(120% 42% at 50% 100%,rgba(255,194,75,.18),#fff 70%)",
      }}
    >
      <div className="animate-rise-in overflow-hidden rounded-b-28 bg-white">
        {/* Cover */}
        <div className="relative h-[210px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={est.cover} alt="" className="block h-full w-full object-cover" />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top,rgba(20,24,33,.85),rgba(20,24,33,.15) 60%,transparent)",
            }}
          />
          <div className="absolute bottom-[66px] left-0 right-0 text-white">
            <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-sun px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.08em] text-ink">
              <Icon name="bolt" size={12} />
              {t("badge")}
            </span>
            <h1 className="m-0 font-display text-[26px] font-extrabold">{est.name}</h1>
            <p className="m-0 mt-0.5 text-[13px] text-white/85">{est.tagline}</p>
          </div>
        </div>

        {/* QR + info */}
        <div className="relative px-6 pb-7">
          <div
            className="mx-auto mt-[-48px] box-border h-[132px] w-[132px] rounded-20 border-2 border-ink/[0.08] bg-white p-2.5"
            style={{
              boxShadow:
                "0 10px 30px -12px rgba(20,24,33,.35),0 0 0 6px rgba(255,194,75,.16)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSrc}
              alt={t("qrAlt")}
              className="h-full w-full rounded-[10px] object-cover"
            />
          </div>

          {spotFromQr ? (
            <>
              <p className="mb-0.5 mt-3.5 text-[13px] text-ink/50">
                {beach ? t("youAreAtBeach") : t("youAreAtTable")}
              </p>
              <p className="m-0 flex items-center justify-center gap-1.5 font-display text-[22px] font-extrabold">
                <Icon name="location_on" size={20} style={{ color: "#FF6B4A" }} />
                {loc}
              </p>
              {beach && (
                <span
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-full px-3.5 py-[5px] text-[13px] font-bold text-ocean-900"
                  style={{ background: "rgba(12,67,71,.1)" }}
                >
                  <Icon name="near_me" size={14} />
                  {est.posto}{" "}
                  <span className="text-[10px] font-semibold uppercase tracking-[.05em] text-ocean-900/60">
                    {t("viaQr")}
                  </span>
                </span>
              )}
            </>
          ) : (
            <>
              <p className="mb-2 mt-3.5 text-[13px] text-ink/50">
                {t("chooseSpotTitle")}
              </p>
              <button
                type="button"
                onClick={() => setSpotModal(true)}
                className="mx-auto flex items-center gap-1.5 rounded-full border-2 px-4 py-2 font-display text-[20px] font-extrabold"
                style={{
                  borderColor: loc ? "rgba(20,24,33,.12)" : "#FF6B4A",
                  color: loc ? "#141821" : "#FF6B4A",
                }}
              >
                <Icon name="location_on" size={19} style={{ color: "#FF6B4A" }} />
                {loc || (beach ? t("chooseSpotBeach") : t("chooseSpotTable"))}
                <Icon name="expand_more" size={17} className="text-ink/40" />
              </button>
              <p className="m-0 mt-2 text-[11px] text-ink/40">
                {beach ? t("spotHintBeach") : t("spotHintTable")}
              </p>
            </>
          )}

          <div className="mt-5 h-px bg-ink/[0.08]" />

          {/* Name */}
          <div className="mt-[18px] text-left">
            <label className="text-xs font-bold text-ink/60">
              {t("nameLabel")}{" "}
              <span className="font-normal text-ink/40">{t("optional")}</span>
            </label>
            <input
              value={custName}
              onChange={(e) => setCustName(e.target.value)}
              placeholder={t("namePh")}
              className="mt-1.5 w-full rounded-full border-2 border-ink/[0.12] px-4 py-3 text-sm outline-none focus:border-ink"
            />
            <p className="m-0 ml-1 mt-1.5 text-[11px] text-ink/40">
              {beach ? t("nameHintBeach") : t("nameHintTable")}
            </p>
          </div>

          <button
            type="button"
            onClick={!spotFromQr && !loc ? () => setSpotModal(true) : goMenu}
            className="mt-[18px] flex w-full items-center justify-center gap-2 rounded-full bg-ink px-4 py-3.5 text-[15px] font-bold text-sand"
          >
            {!spotFromQr && !loc ? t("chooseSpotTitle") : t("seeMenu")}
            <Icon name="arrow_forward" size={16} />
          </button>

          {/* Pay-with strip */}
          <div className="mt-3.5 flex items-center justify-center gap-2">
            <span className="text-[11px] font-semibold text-ink/40">{t("payWith")}</span>
            <span
              className="h-[22px] w-[22px] rounded-md border border-ink/10 bg-white bg-center bg-no-repeat"
              style={{ backgroundImage: `url("${PAY_LOGOS.pix}")`, backgroundSize: "16px" }}
            />
            <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-md bg-pay-card text-white">
              <Icon name="credit_card" size={13} />
            </span>
            <span
              className="h-[22px] w-[22px] rounded-md bg-contain bg-center bg-no-repeat"
              style={{ backgroundImage: `url("${PAY_LOGOS.usdc}")` }}
            />
            <span className="text-[11px] font-semibold text-ink/40">{t("noQueue")}</span>
          </div>
        </div>
      </div>

      <p className="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-full border border-dashed border-ink/25 px-3.5 py-1.5 text-[11px] font-semibold text-ink/45">
        <Icon name={spotFromQr ? "qr_code_scanner" : "touch_app"} size={13} />
        {spotFromQr
          ? beach
            ? t("scanHintBeach")
            : t("scanHintTable")
          : t("noQrHint")}
      </p>

      {spotModal && <SpotModal onClose={() => setSpotModal(false)} />}
    </div>
  );
}
