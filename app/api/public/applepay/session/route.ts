import { request } from "node:https";
import { NextResponse } from "next/server";
import { isAppleValidationUrl } from "@/lib/payments/wallet-web";
import {
  decodePem,
  readWalletWebEnv,
  resolveInitiativeContext,
} from "@/lib/payments/wallet-web-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 10_000;

function postToApple(
  url: string,
  body: string,
  cert: string,
  key: string,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
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
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            text: Buffer.concat(chunks).toString("utf8"),
          }),
        );
        res.on("error", reject);
      },
    );
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error("timeout")));
    req.on("error", reject);
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

  const cert = decodePem(process.env.APPLE_PAY_MERCHANT_CERT);
  const key = decodePem(process.env.APPLE_PAY_MERCHANT_KEY);
  const initiativeContext = resolveInitiativeContext();
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
    const session = JSON.parse(res.text);
    return NextResponse.json(session, { status: 200 });
  } catch (e) {
    console.error(
      `[applepay/session] ${e instanceof Error ? e.message : "erro"}`,
    );
    return NextResponse.json({ error: "appleFailed" }, { status: 502 });
  }
}
