import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  __resetTunaFingerprintForTests,
  injectTagsScript,
  newDeviceSessionId,
  startTunaFingerprint,
  tagsScriptUrl,
  usableConfig,
} from "@/lib/app/tuna-fingerprint";

/** Document mínimo (o ambiente de teste é node, sem DOM). */
function fakeDoc() {
  const scripts: Record<string, unknown>[] = [];
  const doc = {
    scripts,
    querySelector: (sel: string) => {
      const id = /data-tuna-fp="([^"]+)"/.exec(sel)?.[1];
      return scripts.find((s) => (s.attrs as Record<string, string>)["data-tuna-fp"] === id) ?? null;
    },
    createElement: () => {
      const attrs: Record<string, string> = {};
      return { attrs, setAttribute: (k: string, v: string) => (attrs[k] = v) } as Record<string, unknown>;
    },
    head: { appendChild: (s: Record<string, unknown>) => scripts.push(s) },
  };
  return doc as unknown as Document & { scripts: Record<string, unknown>[] };
}

const okFetch = (body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

beforeEach(() => __resetTunaFingerprintForTests());

describe("newDeviceSessionId", () => {
  it("32 hex minúsculos e aceito pelo servidor", () => {
    const id = newDeviceSessionId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(newDeviceSessionId()).not.toBe(id);
  });
  it("usa os bytes aleatórios (padding com zero)", () => {
    expect(newDeviceSessionId((a) => a.fill(10))).toBe("0a".repeat(16));
  });
});

describe("tagsScriptUrl / usableConfig", () => {
  it("session_id = merchant + id, sem separador", () => {
    expect(tagsScriptUrl("1snn5n9w", "merch", "abc")).toBe(
      "https://h.online-metrix.net/fp/tags.js?org_id=1snn5n9w&session_id=merchabc",
    );
  });
  it("config só vale com enabled + orgId/merchantId", () => {
    expect(usableConfig({ enabled: true, orgId: "o", merchantId: "m" })).toEqual({ orgId: "o", merchantId: "m" });
    for (const c of [null, "x", { enabled: false }, { enabled: true, orgId: "o" }, { enabled: "true", orgId: "o", merchantId: "m" }]) {
      expect(usableConfig(c)).toBeNull();
    }
  });
});

describe("injectTagsScript", () => {
  it("injeta uma vez por id (sem duplicar)", () => {
    const doc = fakeDoc();
    injectTagsScript(doc, "o", "m", "id1");
    injectTagsScript(doc, "o", "m", "id1");
    expect(doc.scripts).toHaveLength(1);
    expect(doc.scripts[0].src).toBe("https://h.online-metrix.net/fp/tags.js?org_id=o&session_id=mid1");
    expect(doc.scripts[0].async).toBe(true);
  });
});

describe("startTunaFingerprint", () => {
  it("ligado: busca a config uma vez, injeta o script e devolve o id (singleton)", async () => {
    const doc = fakeDoc();
    const f = okFetch({ enabled: true, orgId: "o", merchantId: "m" });
    const [a, b] = await Promise.all([startTunaFingerprint(f, doc), startTunaFingerprint(f, doc)]);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(b).toBe(a);
    expect(f).toHaveBeenCalledTimes(1);
    expect(doc.scripts).toHaveLength(1);
    expect(doc.scripts[0].src).toContain(`session_id=m${a}`);
  });
  it("desligado → undefined, sem script", async () => {
    const doc = fakeDoc();
    expect(await startTunaFingerprint(okFetch({ enabled: false }), doc)).toBeUndefined();
    expect(doc.scripts).toHaveLength(0);
  });
  it("falha de rede → undefined e libera nova tentativa", async () => {
    const doc = fakeDoc();
    const bad = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await startTunaFingerprint(bad, doc)).toBeUndefined();
    const id = await startTunaFingerprint(okFetch({ enabled: true, orgId: "o", merchantId: "m" }), doc);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });
});
