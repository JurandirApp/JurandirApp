// Device Fingerprint do CyberSource (antifraude da Tuna) no navegador: gera o
// id da sessão do device, monta a URL do `tags.js` e injeta o script uma vez por
// id. Tudo best-effort — falhou, a cobrança segue sem fingerprint.

export const TUNA_FP_HOST = "https://h.online-metrix.net";

export type FingerprintConfig = { enabled: boolean; orgId?: string; merchantId?: string };

/** 32 hex minúsculos (16 bytes do crypto.getRandomValues) — único por carga de
 *  página, bem acima das 24 h de unicidade que o CyberSource pede. */
export function newDeviceSessionId(rand: (a: Uint8Array) => Uint8Array = (a) => crypto.getRandomValues(a)): string {
  const bytes = rand(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** URL do tags.js: `session_id` = merchant id + id da sessão (sem separador). */
export function tagsScriptUrl(orgId: string, merchantId: string, deviceSessionId: string): string {
  return (
    `${TUNA_FP_HOST}/fp/tags.js?org_id=${encodeURIComponent(orgId)}` +
    `&session_id=${encodeURIComponent(merchantId + deviceSessionId)}`
  );
}

/** Config válida pra ligar o fingerprint (enabled + orgId/merchantId string). */
export function usableConfig(c: unknown): { orgId: string; merchantId: string } | null {
  if (!c || typeof c !== "object") return null;
  const o = c as FingerprintConfig;
  if (o.enabled !== true) return null;
  if (typeof o.orgId !== "string" || !o.orgId || typeof o.merchantId !== "string" || !o.merchantId) return null;
  return { orgId: o.orgId, merchantId: o.merchantId };
}

/** Injeta o `<script>` do tags.js uma única vez por id (marca `data-tuna-fp`).
 *  Erro de carga é engolido. */
export function injectTagsScript(doc: Document, orgId: string, merchantId: string, deviceSessionId: string): void {
  if (doc.querySelector(`script[data-tuna-fp="${deviceSessionId}"]`)) return;
  const s = doc.createElement("script");
  s.src = tagsScriptUrl(orgId, merchantId, deviceSessionId);
  s.async = true;
  s.setAttribute("data-tuna-fp", deviceSessionId);
  s.onerror = () => {
    /* sem fingerprint: a cobrança segue normal */
  };
  (doc.head ?? doc.body).appendChild(s);
}

let started: Promise<string | undefined> | null = null;

/** Inicia o fingerprint (uma vez por carga de página — sobrevive a re-render,
 *  remontagem e StrictMode). Devolve o id da sessão ou undefined (desligado /
 *  falhou). Falha de rede libera uma nova tentativa na próxima chamada. */
export function startTunaFingerprint(
  fetchFn: typeof fetch = fetch,
  doc: Document = document,
): Promise<string | undefined> {
  if (started) return started;
  started = (async () => {
    let cfg: unknown;
    try {
      const r = await fetchFn("/api/public/tuna/fingerprint", { cache: "no-store" });
      if (!r.ok) throw new Error("fp");
      cfg = await r.json();
    } catch {
      started = null; // tenta de novo numa próxima abertura do checkout
      return undefined;
    }
    const c = usableConfig(cfg);
    if (!c) return undefined;
    try {
      const id = newDeviceSessionId();
      injectTagsScript(doc, c.orgId, c.merchantId, id);
      return id;
    } catch {
      return undefined;
    }
  })();
  return started;
}

/** Só para testes: zera o estado do módulo. */
export function __resetTunaFingerprintForTests(): void {
  started = null;
}
