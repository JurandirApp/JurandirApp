import { describe, it, expect } from "vitest";
import pt from "@/messages/pt.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import { routing } from "@/i18n/routing";

type Tree = { [k: string]: unknown };

/** Achata o JSON em { "a.b.0.c": "texto" } (arrays entram com o índice). */
function flatten(o: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (o && typeof o === "object") {
    for (const [k, v] of Object.entries(o as Tree)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out[prefix] = String(o);
  }
  return out;
}

/** Assinatura ICU de uma mensagem: nomes das variáveis com o tipo (`{nome}` /
 *  `{nome, plural, ...}`) e as tags rich-text. O texto dos ramos é o que se
 *  traduz; categorias de plural (`one`/`other`) e `#` literal podem variar por
 *  idioma, então não entram. Todo plural precisa do ramo `other`. */
function icuSignature(msg: string): string {
  const vars = new Set<string>();
  for (const m of msg.matchAll(/\{\s*([A-Za-z_]\w*)\s*(?:,\s*(plural|select|selectordinal|number|date|time)\s*)?[,}]/g)) {
    vars.add(m[2] ? `${m[1]}:${m[2]}` : m[1]);
  }
  const tags = [...msg.matchAll(/<\/?([A-Za-z][\w-]*)>/g)].map((m) => m[0]).sort();
  const pluralOk = !/,\s*plural\s*,/.test(msg) || /other\s*\{/.test(msg);
  return JSON.stringify({ vars: [...vars].sort(), tags, pluralOk });
}

const ptFlat = flatten(pt);
const others = { en: flatten(en), es: flatten(es) } as const;

describe("mensagens i18n — paridade de chaves e placeholders", () => {
  it("o roteamento tem pt (padrão), en e es", () => {
    expect(routing.locales).toEqual(["pt", "en", "es"]);
    expect(routing.defaultLocale).toBe("pt");
  });

  for (const [loc, flat] of Object.entries(others)) {
    it(`${loc}.json tem exatamente as mesmas chaves que pt.json`, () => {
      const missing = Object.keys(ptFlat).filter((k) => !(k in flat));
      const extra = Object.keys(flat).filter((k) => !(k in ptFlat));
      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    });

    it(`${loc}.json mantém os placeholders ICU de pt.json`, () => {
      const diff = Object.keys(ptFlat)
        .filter((k) => k in flat && icuSignature(ptFlat[k]) !== icuSignature(flat[k]))
        .map((k) => ({ key: k, pt: ptFlat[k], [loc]: flat[k] }));
      expect(diff).toEqual([]);
    });
  }

  it("es.json não tem valor vazio", () => {
    expect(Object.entries(others.es).filter(([, v]) => v.trim() === "").map(([k]) => k)).toEqual([]);
  });
});
