import { describe, it, expect, vi, beforeEach } from "vitest";
import { pagarmeProvider, createPagarmeRecipient, getPagarmeKycLink } from "@/lib/payments/pagarme";
import { PIX_EXPIRES_MIN } from "@/lib/domain/pricing";
import type { Establishment } from "@prisma/client";

function seq(bodies: unknown[]) {
  const fn = vi.fn();
  bodies.forEach((b) =>
    fn.mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(b) }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

const est = { id: "est_1", pagarmeRecipientId: "rp_bar" } as unknown as Establishment;

beforeEach(() => {
  process.env.PAGARME_BASE_URL = "https://api.pagar.me/core/v5";
  process.env.PAGARME_SECRET_KEY = "sk_test";
  process.env.PAGARME_PLATFORM_RECIPIENT_ID = "rp_platform";
  vi.restoreAllMocks();
});

describe("pagarmeProvider.createPixCharge", () => {
  it("monta o split (bar + plataforma) em centavos, soma = total, e devolve o QR", async () => {
    const fn = seq([
      {
        id: "or_1",
        status: "pending",
        charges: [
          { id: "ch_1", status: "pending", last_transaction: { qr_code: "copiaecola" } },
        ],
      },
    ]);
    const r = await pagarmeProvider.createPixCharge({
      est,
      reference: "PED-1",
      total: 100,
      platformFee: 8,
      description: "Pedido PED-1",
    });
    expect(r).toEqual({
      chargeId: "ch_1",
      pixPayload: "copiaecola",
      pixQrImage: "",
      status: "pending",
    });
    const body = JSON.parse(fn.mock.calls[0][1].body as string);
    expect(body.code).toBe("PED-1");
    expect(body.items[0].amount).toBe(10000); // centavos
    const pay = body.payments[0];
    expect(pay.payment_method).toBe("pix");
    expect(pay.pix.expires_in).toBe(PIX_EXPIRES_MIN * 60);
    expect(pay.split).toEqual([
      {
        amount: 9200,
        recipient_id: "rp_bar",
        type: "flat",
        options: { charge_processing_fee: true, liable: true, charge_remainder_fee: true },
      },
      {
        amount: 800,
        recipient_id: "rp_platform",
        type: "flat",
        options: { charge_processing_fee: false, liable: false, charge_remainder_fee: false },
      },
    ]);
    // soma dos legs = total em centavos
    expect(pay.split[0].amount + pay.split[1].amount).toBe(10000);
    // Basic auth com a secret key
    expect(fn.mock.calls[0][1].headers.Authorization).toBe(
      "Basic " + Buffer.from("sk_test:").toString("base64"),
    );
  });

  it("sem recebedor da plataforma → tudo pro bar (split único)", async () => {
    process.env.PAGARME_PLATFORM_RECIPIENT_ID = "";
    const fn = seq([
      { id: "or_2", status: "pending", charges: [{ id: "ch_2", status: "pending", last_transaction: {} }] },
    ]);
    await pagarmeProvider.createPixCharge({
      est,
      reference: "PED-2",
      total: 50,
      platformFee: 4,
      description: "d",
    });
    const body = JSON.parse(fn.mock.calls[0][1].body as string);
    expect(body.payments[0].split).toHaveLength(1);
    expect(body.payments[0].split[0]).toMatchObject({ amount: 5000, recipient_id: "rp_bar" });
  });

  it("sem recebedor do estabelecimento → erro", async () => {
    seq([]);
    await expect(
      pagarmeProvider.createPixCharge({
        est: { id: "x", pagarmeRecipientId: null } as unknown as Establishment,
        reference: "R",
        total: 10,
        platformFee: 1,
        description: "d",
      }),
    ).rejects.toThrow(/recebedor/);
  });
});

describe("pagarmeProvider.getChargeStatus", () => {
  it("mapeia paid → paid e waiting_payment → pending", async () => {
    seq([{ status: "paid" }]);
    expect(await pagarmeProvider.getChargeStatus(est, "ch_1")).toBe("paid");
    seq([{ status: "waiting_payment" }]);
    expect(await pagarmeProvider.getChargeStatus(est, "ch_1")).toBe("pending");
  });
});

describe("createPagarmeRecipient", () => {
  it("cria recebedor PF com conta bancária + register_information", async () => {
    const fn = seq([{ id: "re_new", status: "registration" }]);
    const r = await createPagarmeRecipient({
      type: "individual",
      name: "Bar do Zé",
      email: "ze@bar.com",
      document: "123.456.789-00",
      phone: "47999998888",
      bank: "341",
      branchNumber: "0001",
      accountNumber: "12345",
      accountCheckDigit: "6",
      accountType: "checking",
      city: "Itajaí",
    });
    expect(r).toEqual({ id: "re_new", status: "registration" });
    const body = JSON.parse(fn.mock.calls[0][1].body as string);
    expect(body.type).toBe("individual");
    expect(body.document).toBe("12345678900"); // só dígitos
    expect(body.default_bank_account.bank).toBe("341");
    expect(body.default_bank_account.type).toBe("checking");
    expect(body.register_information.type).toBe("individual");
    expect(body.register_information.address.city).toBe("Itajaí");
    expect(body.register_information.phone_numbers[0]).toEqual({
      ddd: "47",
      number: "999998888",
      type: "mobile",
    });
  });
});

describe("getPagarmeKycLink", () => {
  it("gera o link/QR do webapp hospedado do Pagar.me", async () => {
    const fn = seq([
      { url: "https://kyc.pagar.me/abc", base64: "iVBOR", expiration_date: "2026-01-01T00:00:00Z" },
    ]);
    const r = await getPagarmeKycLink("rp_new");
    expect(r).toEqual({
      url: "https://kyc.pagar.me/abc",
      base64: "iVBOR",
      expiresAt: "2026-01-01T00:00:00Z",
    });
    expect(fn.mock.calls[0][0]).toContain("/recipients/rp_new/kyc_link");
    expect(fn.mock.calls[0][1].method).toBe("POST");
  });
});
