import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { deriveTunaDeviceCustomer, sanitizeDeviceKey, tunaCardKeySecret } from "@/lib/payments/tuna-cards";

const KEY = "A".repeat(20) + "b_c-" + "9".repeat(19); // 43 chars (32 bytes em base64url)

describe("sanitizeDeviceKey", () => {
  it("aceita base64url de 32 a 128 chars (com trim)", () => {
    expect(sanitizeDeviceKey(KEY)).toBe(KEY);
    expect(sanitizeDeviceKey(` ${KEY} `)).toBe(KEY);
    expect(sanitizeDeviceKey("a".repeat(32))).toBe("a".repeat(32));
    expect(sanitizeDeviceKey("a".repeat(128))).toBe("a".repeat(128));
  });
  it("rejeita curto, longo, caracteres fora do base64url e não-string", () => {
    expect(sanitizeDeviceKey("a".repeat(31))).toBeUndefined();
    expect(sanitizeDeviceKey("a".repeat(129))).toBeUndefined();
    expect(sanitizeDeviceKey("a".repeat(40) + "=")).toBeUndefined();
    expect(sanitizeDeviceKey("a".repeat(40) + "+/")).toBeUndefined();
    expect(sanitizeDeviceKey("a".repeat(20) + " " + "a".repeat(20))).toBeUndefined();
    expect(sanitizeDeviceKey(undefined)).toBeUndefined();
    expect(sanitizeDeviceKey(123)).toBeUndefined();
    expect(sanitizeDeviceKey(null)).toBeUndefined();
  });
});

describe("tunaCardKeySecret", () => {
  it("prefere TUNA_CARD_KEY_SECRET e cai no AUTH_SECRET", () => {
    expect(tunaCardKeySecret({ TUNA_CARD_KEY_SECRET: " s1 ", AUTH_SECRET: "s2" })).toBe("s1");
    expect(tunaCardKeySecret({ TUNA_CARD_KEY_SECRET: " ", AUTH_SECRET: "s2" })).toBe("s2");
    expect(tunaCardKeySecret({})).toBe("");
  });
});

describe("deriveTunaDeviceCustomer", () => {
  const env = { TUNA_CARD_KEY_SECRET: "segredo" };

  it("id = jdev_ + 40 hex do HMAC-SHA256(segredo, chave); e-mail no domínio dos cartões", () => {
    const hex = createHmac("sha256", "segredo").update(KEY).digest("hex").slice(0, 40);
    const c = deriveTunaDeviceCustomer(KEY, env);
    expect(c).toEqual({ id: `jdev_${hex}`, email: `jdev_${hex}@cartoes.jurandir.app.br` });
    expect(c!.id).toMatch(/^jdev_[0-9a-f]{40}$/);
  });

  it("determinístico; chave diferente ou segredo diferente → customer diferente", () => {
    const a = deriveTunaDeviceCustomer(KEY, env)!;
    expect(deriveTunaDeviceCustomer(` ${KEY} `, env)).toEqual(a);
    expect(deriveTunaDeviceCustomer(KEY.replace("b", "x"), env)!.id).not.toBe(a.id);
    expect(deriveTunaDeviceCustomer(KEY, { AUTH_SECRET: "outro" })!.id).not.toBe(a.id);
  });

  it("cai no AUTH_SECRET quando não há TUNA_CARD_KEY_SECRET", () => {
    expect(deriveTunaDeviceCustomer(KEY, { AUTH_SECRET: "segredo" })).toEqual(deriveTunaDeviceCustomer(KEY, env));
  });

  it("o id/e-mail nunca contém a chave", () => {
    const c = deriveTunaDeviceCustomer(KEY, env)!;
    expect(c.id).not.toContain(KEY);
    expect(c.email).not.toContain(KEY);
  });

  it("chave inválida/ausente → null (mesmo sem segredo)", () => {
    expect(deriveTunaDeviceCustomer("curta", env)).toBeNull();
    expect(deriveTunaDeviceCustomer(undefined, {})).toBeNull();
  });

  it("chave válida sem segredo → lança", () => {
    expect(() => deriveTunaDeviceCustomer(KEY, {})).toThrow();
  });
});
