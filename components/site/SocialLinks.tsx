import { socialLinksFromEnv, type SocialKey } from "@/lib/site/social";

const LABEL: Record<SocialKey, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
};

/** Ícones das marcas (SVG próprio, traço simples — a fonte Material Symbols não
 *  tem logos de marca). */
function BrandIcon({ k }: { k: SocialKey }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  } as const;
  if (k === "whatsapp") {
    return (
      <svg {...common} fill="none">
        <path
          d="M12 2.75a9.25 9.25 0 0 0-7.95 13.97L2.9 21.1l4.5-1.13A9.25 9.25 0 1 0 12 2.75Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M8.6 7.6c.3-.3.8-.3 1 .05l1.1 1.6c.2.3.15.7-.1.95l-.55.55c.6 1.2 1.6 2.2 2.8 2.8l.55-.55c.25-.25.65-.3.95-.1l1.6 1.1c.35.25.35.7.05 1l-.75.75c-.6.6-1.5.7-2.25.35-2.35-1.15-4.2-3-5.35-5.35-.35-.75-.25-1.65.35-2.25Z"
          fill="currentColor"
        />
      </svg>
    );
  }
  if (k === "instagram") {
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4.2" />
        <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg {...common} fill="currentColor">
      <path d="M13.5 21v-7.5h2.6l.4-3.1h-3V8.5c0-.9.25-1.5 1.5-1.5h1.6V4.2c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.3H7.8v3.1h2.6V21h3.1Z" />
    </svg>
  );
}

/** Botões de WhatsApp / Instagram / Facebook da landing. Cada um só aparece se a
 *  URL estiver configurada (NEXT_PUBLIC_SOCIAL_WHATSAPP / _INSTAGRAM / _FACEBOOK). */
export function SocialLinks({ className }: { className?: string }) {
  const links = socialLinksFromEnv();
  if (!links.length) return null;
  return (
    <div className={`flex items-center justify-center gap-3 ${className ?? ""}`}>
      {links.map((l) => (
        <a
          key={l.key}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={LABEL[l.key]}
          title={LABEL[l.key]}
          className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/20 bg-white/10 text-white transition-colors hover:border-sun hover:text-sun"
        >
          <BrandIcon k={l.key} />
        </a>
      ))}
    </div>
  );
}
