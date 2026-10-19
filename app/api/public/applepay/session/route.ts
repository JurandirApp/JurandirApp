import { request } from "node:https";
import { NextResponse } from "next/server";
import {
  decodePem,
  isAppleValidationUrl,
  resolveInitiativeContext,
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

export async function POST(req: Request) {
  let validationURL: unknown;
  try {
    const json = (await req.json()) as { validationURL?: unknown } | null;
    validationURL = json?.validationURL;
  } catch {
    return NextResponse.json({ error: "invalidUrl" }, { status: 400 });
  }
  if (typeof validationURL !== "string" || !isAppleValidationUrl(validationURL)) {
    return NextResponse.json({ error: "invalidUrl" }, { status: 400 });
  }

  const cert = process.env.APPLE_PAY_MERCHANT_CERT?.trim()
    ? decodePem(process.env.APPLE_PAY_MERCHANT_CERT)
    : null;
  const key = process.env.APPLE_PAY_MERCHANT_KEY?.trim()
    ? decodePem(process.env.APPLE_PAY_MERCHANT_KEY)
    : null;
  const initiativeContext = resolveInitiativeContext(
    process.env.APPLE_PAY_DOMAIN,
    process.env.APP_BASE_URL,
  );
  if (!cert || !key || !initiativeContext) {
    return NextResponse.json({ error: "notConfigured" }, { status: 503 });
  }

  const env = readWalletWebEnv();
  const body = JSON.stringify({
    merchantIdentifier: env.appleMerchantId,
    displayName: env.appleDisplayName,
    initiative: "web",
    initiativeContext,
  });

  try {
    const res = await postToApple(validationURL, body, cert, key);
    if (res.status < 200 || res.status >= 300) {
      console.error(`[applepay/session] apple status ${res.status}`);
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
