import type { Establishment } from "@prisma/client";
import { splitToEstablishment } from "@/lib/domain/pricing";
import type { PaymentProvider, PixCharge, PixChargeInput, ChargeStatus } from "./types";

const baseUrl = () => process.env.ASAAS_BASE_URL ?? "https://api-sandbox.asaas.com/v3";
const apiKey = () => process.env.ASAAS_API_KEY ?? "";
const SANDBOX_CPF = "24971563792"; // CPF válido de testes (sandbox)

export class AsaasError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Asaas ${status}: ${body}`);
    this.name = "AsaasError";
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: apiKey(),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new AsaasError(res.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}

function mapStatus(s: string): ChargeStatus {
  if (s === "RECEIVED" || s === "CONFIRMED" || s === "RECEIVED_IN_CASH") return "paid";
  if (s === "PENDING" || s === "AWAITING_RISK_ANALYSIS") return "pending";
  return "failed";
}

function dueTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export const asaasProvider: PaymentProvider = {
  name: "ASAAS",
  async createPixCharge(input: PixChargeInput): Promise<PixCharge> {
    const { est, reference, total, platformFee, customerName, description } = input;
    const customer = await call<{ id: string }>("/customers", {
      method: "POST",
      body: JSON.stringify({
        name: customerName || "Cliente Jurandir",
        cpfCnpj: est.ownerCpfCnpj || SANDBOX_CPF,
      }),
    });
    const charge = await call<{ id: string; status: string }>("/payments", {
      method: "POST",
      body: JSON.stringify({
        customer: customer.id,
        billingType: "PIX",
        value: total,
        dueDate: dueTomorrow(),
        description,
        externalReference: reference,
        split: [{ walletId: est.asaasWalletId, fixedValue: splitToEstablishment(total, platformFee) }],
      }),
    });
    const qr = await call<{ payload: string; encodedImage: string }>(
      `/payments/${charge.id}/pixQrCode`,
    );
    return {
      chargeId: charge.id,
      pixPayload: qr.payload,
      pixQrImage: qr.encodedImage,
      status: mapStatus(charge.status),
    };
  },
  async getChargeStatus(_est: Establishment, chargeId: string): Promise<ChargeStatus> {
    const c = await call<{ status: string }>(`/payments/${chargeId}`);
    return mapStatus(c.status);
  },
};

export async function createSubaccount(
  est: Establishment,
): Promise<{ accountId: string; walletId: string }> {
  const r = await call<{ id: string; walletId: string }>("/accounts", {
    method: "POST",
    body: JSON.stringify({
      name: est.name,
      email: est.email,
      cpfCnpj: est.ownerCpfCnpj,
      mobilePhone: (est.phone ?? "").replace(/\D/g, "") || "47999990000",
      address: est.address ?? "Rua Exemplo",
      addressNumber: "100",
      province: "Centro",
      postalCode: "88300000",
    }),
  });
  return { accountId: r.id, walletId: r.walletId };
}
