import { describe, it, expect } from "vitest";
import { threeDsPageHtml } from "@/lib/payments/threeds-page";

describe("threeDsPageHtml", () => {
  const html = threeDsPageHtml();
  it("contém o contrato com o app", () => {
    expect(html).toContain("https://assets.pagseguro.com.br/checkout-sdk-js/rc/dist/browser/pagseguro.min.js");
    expect(html).toContain("jurandir3ds");
    expect(html).toContain("ThreeDS.postMessage");
    expect(html).toContain("beforeChallenge");
    expect(html).toContain("open()");
    expect(html).toContain("SDK_LOAD_FAILED");
    expect(html).toContain("Confirmando com o seu banco");
  });
  it("não loga params/data nem faz fetch", () => {
    expect(html).not.toContain("console.log(params");
    expect(html).not.toContain("console.log(data");
    expect(html).not.toContain("fetch(");
  });
});

describe("threeDsPageHtml endurecimento", () => {
  const html = threeDsPageHtml();
  it("mascara dígitos longos e permite zoom", () => {
    expect(html).toContain("replace(/\\d{8,}/g");
    expect(html).not.toContain("user-scalable=no");
    expect(html).not.toContain("maximum-scale");
  });
});
