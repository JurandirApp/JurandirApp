/** Redes sociais da landing. As URLs vêm de env (NEXT_PUBLIC_SOCIAL_*); botão
 *  sem URL não aparece (nada de link placeholder). */
export type SocialKey = "whatsapp" | "instagram" | "facebook";
export type SocialLink = { key: SocialKey; href: string };

const ORDER: SocialKey[] = ["whatsapp", "instagram", "facebook"];

/** Só http(s) — evita `javascript:` ou lixo vindo de env mal configurada. */
function safeUrl(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return /^https?:\/\/\S+$/i.test(s) ? s : null;
}

export function socialLinks(env: Partial<Record<SocialKey, string | undefined>>): SocialLink[] {
  return ORDER.flatMap((key) => {
    const href = safeUrl(env[key]);
    return href ? [{ key, href }] : [];
  });
}

/** Lê as env vars públicas. Referências LITERAIS (o Next só embute
 *  `process.env.NEXT_PUBLIC_*` escrito assim no bundle do cliente). */
export function socialLinksFromEnv(): SocialLink[] {
  return socialLinks({
    whatsapp: process.env.NEXT_PUBLIC_SOCIAL_WHATSAPP,
    instagram: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM,
    facebook: process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK,
  });
}
