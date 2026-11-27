import { request } from "node:https";
import { NextResponse } from "next/server";
import {
  decodePem,
  isAppleValidationUrl,
  resolveInitiativeContext,
  type AppleMerchantKey,
} from "@/lib/payments/wallet-web";
import { readWalletWebEnv } from "@/lib/payments/wallet-web-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 64 * 1024;

function postToApple(
  url: string,
  body: string,
  cert: string,
  key: string,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = <T,>(fn: (v: T) => void, v: T) => {
      clearTimeout(timer);
      fn(v);
    };
    const req = request(
      url,
      {
        method: "POST",
        cert,
        key,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_BYTES) {
            req.destroy(new Error("resposta grande demais"));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () =>
          done(resolve, {
            status: res.statusCode ?? 0,
            text: Buffer.concat(chunks).toString("utf8"),
          }),
        );
        res.on("error", (e) => done(reject, e));
      },
    );
    timer = setTimeout(() => req.destroy(new Error("timeout")), TIMEOUT_MS);
    req.on("error", (e) => done(reject, e));
    req.end(body);
  });
}

/** Certificado de identidade + merchant ID por merchant da Apple:
 *  - "default": merchant.br.app.jurandir (Pagar.me/PagBank) — APPLE_PAY_MERCHANT_CERT/KEY
 *  - "tuna":    merchant.br.app.jurandir.tuna — APPLE_PAY_TUNA_MERCHANT_CERT/KEY */
function merchantCredentials(merchant: AppleMerchantKey) {
  const e = process.env;
  const [certEnv, keyEnv] =
    merchant === "tuna"
      ? [e.APPLE_PAY_TUNA_MERCHANT_CERT, e.APPLE_PAY_TUNA_MERCHANT_KEY]
      : [e.APPLE_PAY_MERCHANT_CERT, e.APPLE_PAY_MERCHANT_KEY];
  const env = readWalletWebEnv();
  return {
    cert: certEnv?.trim() ? decodePem(certEnv) : null,
    key: keyEnv?.trim() ? decodePem(keyEnv) : null,
    merchantIdentifier: merchant === "tuna" ? env.appleTunaMerchantId : env.appleMerchantId,
    displayName: env.appleDisplayName,
  };
}

export async function POST(req: Request) {
  let validationURL: unknown;
  let merchantRaw: unknown;
  try {
    const json = (await req.json()) as { validationURL?: unknown; merchant?: unknown } | null;
    validationURL = json?.validationURL;
    merchantRaw = json?.merchant;
  } catch {
    return NextResponse.json({ error: "invalidUrl" }, { status: 400 });
  }
  if (typeof validationURL !== "string" || !isAppleValidationUrl(validationURL)) {
    return NextResponse.json({ error: "invalidUrl" }, { status: 400 });
  }

  // Ausente = "default" (compat com páginas antigas em cache); outro valor = 400.
  if (merchantRaw !== undefined && merchantRaw !== "default" && merchantRaw !== "tuna") {
    return NextResponse.json({ error: "invalidMerchant" }, { status: 400 });
  }
  const merchant: AppleMerchantKey = merchantRaw === "tuna" ? "tuna" : "default";
  const { cert, key, merchantIdentifier, displayName } = merchantCredentials(merchant);
  const initiativeContext = resolveInitiativeContext(
    process.env.APPLE_PAY_DOMAIN,
    process.env.APP_BASE_URL,
  );
  if (!cert || !key || !initiativeContext) {
    return NextResponse.json({ error: "notConfigured" }, { status: 503 });
  }

  const body = JSON.stringify({
    merchantIdentifier,
    displayName,
    initiative: "web",
    initiativeContext,
  });

  try {
    const res = await postToApple(validationURL, body, cert, key);
    if (res.status < 200 || res.status >= 300) {
      console.error(`[applepay/session] apple status ${res.status} (merchant ${merchant})`);
      return NextResponse.json({ error: "appleFailed" }, { status: 502 });
    }
    let session: unknown;
    try {
      session = JSON.parse(res.text);
    } catch {
      console.error("[applepay/session] resposta inválida da Apple");
      return NextResponse.json({ error: "appleFailed" }, { status: 502 });
    }
    return NextResponse.json(session, { status: 200 });
  } catch (e) {
    console.error(
      `[applepay/session] ${e instanceof Error ? e.message : "erro"}`,
    );
    return NextResponse.json({ error: "appleFailed" }, { status: 502 });
  }
}
