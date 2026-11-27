"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/ui/Icon";

/** Altura da faixa do modo visualização (px) — as barras fixas do cardápio
 *  descem esse tanto pra não ficarem por baixo dela. */
export const PREVIEW_BANNER_H = 48;

/** Faixa fixa no topo do modo visualização ("Ver como o cliente vê"). O botão
 *  tenta fechar a aba (ela foi aberta pelo painel); se o navegador não deixar,
 *  o link segue pro painel. */
export function PreviewBanner() {
  const t = useTranslations("app");
  return (
    <>
      <div
        role="status"
        className="fixed inset-x-0 top-0 z-[45] flex items-center gap-2 bg-ink px-4 text-white"
        style={{ height: PREVIEW_BANNER_H }}
      >
        <Icon name="visibility" size={18} className="flex-shrink-0 text-sun" />
        <p className="m-0 line-clamp-2 flex-1 text-[12px] font-semibold leading-tight">
          {t("previewBanner")}
        </p>
        <Link
          href="/painel"
          onClick={() => {
            try {
              window.close();
            } catch {
              /* não deu pra fechar → segue o link */
            }
          }}
          className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-white/15 px-2.5 py-1.5 text-xs font-semibold text-white no-underline"
        >
          <Icon name="close" size={14} />
          {t("previewBack")}
        </Link>
      </div>
      {/* Espaço da faixa fixa no fluxo da página. */}
      <div aria-hidden style={{ height: PREVIEW_BANNER_H }} />
    </>
  );
}
