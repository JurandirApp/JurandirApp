import { describe, it, expect } from "vitest";
import { socialLinks } from "@/lib/site/social";

describe("socialLinks", () => {
  it("só os botões com URL configurada, na ordem WhatsApp → Instagram → Facebook", () => {
    expect(
      socialLinks({ facebook: "https://facebook.com/jurandir", whatsapp: "https://wa.me/5543996176666" }),
    ).toEqual([
      { key: "whatsapp", href: "https://wa.me/5543996176666" },
      { key: "facebook", href: "https://facebook.com/jurandir" },
    ]);
  });
  it("vazio/espaços/não-http → escondido", () => {
    expect(socialLinks({ whatsapp: "", instagram: "  ", facebook: "javascript:alert(1)" })).toEqual([]);
    expect(socialLinks({})).toEqual([]);
  });
});
