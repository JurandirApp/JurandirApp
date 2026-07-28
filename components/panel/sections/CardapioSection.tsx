"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { CATS, CAT_ICON, type MenuItem } from "@/lib/data/panel";
import { money } from "@/lib/panel/helpers";
import { usePanel } from "../context";

const CN = Object.keys(CATS);

const pillStyle = (active: boolean) =>
  active
    ? { background: "#141821", color: "#EDD8A3" }
    : { background: "#fff", color: "rgba(20,24,33,.6)" };

export function CardapioSection() {
  const { menu, menuCat, setMenuCat, openEditor, csvModel, csvImport } = usePanel();
  const t = useTranslations("panel.cardapio");
  const tcat = useTranslations("panel.cat");

  const list = menuCat === "Todos" ? menu : menu.filter((i) => i.cat === menuCat);
  const countLabel =
    t("countItems", { count: list.length }) +
    (menuCat === "Todos" ? t("inMenu") : t("inCategory", { cat: tcat(menuCat) }));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 font-display text-base font-semibold text-ink/70">
          {countLabel}
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={csvModel}
            className="flex items-center gap-1 rounded-xl bg-dune-50 px-3 py-2 text-sm font-medium text-ink/70"
          >
            <Icon name="download" size={15} />
            {t("model")}
          </button>
          <button
            type="button"
            onClick={csvImport}
            className="flex items-center gap-1 rounded-xl bg-dune-50 px-3 py-2 text-sm font-medium text-ink/70"
          >
            <Icon name="upload" size={15} />
            {t("import")}
          </button>
          <button
            type="button"
            onClick={() => openEditor(null)}
            className="flex items-center gap-1 rounded-xl bg-coral px-3 py-2 text-sm font-medium text-white"
          >
            <Icon name="add" size={16} />
            {t("newItem")}
          </button>
        </div>
      </div>

      <div className="mb-3 flex gap-2 overflow-x-auto">
        {["Todos", ...CN].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setMenuCat(c)}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium"
            style={pillStyle(menuCat === c)}
          >
            {c !== "Todos" && <Icon name={CAT_ICON[c]} size={14} />}
            {c === "Todos" ? t("all") : tcat(c)}
          </button>
        ))}
      </div>

      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(auto-fill,minmax(330px,1fr))" }}
      >
        {list.map((i) => (
          <ItemRow key={i.dbId ?? i.id} item={i} />
        ))}
      </div>
    </div>
  );
}

function ItemRow({ item: i }: { item: MenuItem }) {
  const { openEditor, askDeleteItem } = usePanel();
  const t = useTranslations("panel.cardapio");
  const tcat = useTranslations("panel.cat");
  const tsub = useTranslations("panel.sub");
  const promo = i.old != null && i.old > i.price;
  const pctOff = promo ? `-${Math.round((1 - i.price / i.old!) * 100)}%` : "";
  const meas = i.measure
    ? ` · ${String(i.measure).replace(".", ",")} ${i.unit}`
    : "";

  return (
    <div className="flex items-center gap-3 rounded-xl border-2 border-ink bg-white p-2.5 shadow-hard">
      {i.photo ? (
        <div
          role="img"
          aria-label={i.name}
          className="h-12 w-12 flex-shrink-0 rounded-lg bg-[#e2e8f0] bg-cover bg-center"
          style={{ backgroundImage: `url("${i.photo}")` }}
        />
      ) : (
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#e2e8f0] to-[#cbd5e1] text-ink/50">
          <Icon name={CAT_ICON[i.cat] ?? "restaurant"} size={22} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-sm font-medium">
          {i.name}
          {promo && (
            <span className="ml-1 rounded-full bg-[#fee2e2] px-1.5 py-0.5 text-[10px] font-bold text-[#dc2626]">
              {pctOff}
            </span>
          )}
        </p>
        <p className="m-0 mt-0.5 truncate text-xs text-ink/50">
          {tcat(i.cat)} › {tsub(i.sub)} · {money(i.price)}
          {promo && (
            <span className="ml-1 text-ink/30 line-through">{money(i.old!)}</span>
          )}
          {meas}
        </p>
      </div>

      <button
        type="button"
        onClick={() => openEditor(i)}
        aria-label={t("edit")}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-dune-50 text-ink/60"
      >
        <Icon name="edit" size={15} />
      </button>
      <button
        type="button"
        onClick={() => askDeleteItem(i)}
        aria-label={t("delete")}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#fef2f2] text-[#ef4444]"
      >
        <Icon name="delete" size={15} />
      </button>
    </div>
  );
}
