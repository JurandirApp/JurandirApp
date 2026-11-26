/** Cache das rotas públicas de LEITURA que são iguais pra todo cliente (lista de
 *  bares, cardápio). A CDN da Vercel guarda a resposta por 30 s e, depois disso,
 *  serve a cópia antiga por até 2 min enquanto busca a nova em segundo plano —
 *  sob pico, quase nenhuma requisição chega ao servidor/banco. O navegador não
 *  guarda (s-maxage só vale pra cache compartilhado). Mudança no cardápio ou no
 *  gateway aparece em até ~30 s; a cobrança sempre revalida no servidor. */
export const PUBLIC_READ_CACHE: Record<string, string> = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
};
