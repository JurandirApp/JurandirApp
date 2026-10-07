import { createSign } from "crypto";
import { deleteDeviceToken } from "@/lib/db/devices";

type ServiceAccount = { client_email: string; private_key: string; project_id: string };

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try { return JSON.parse(raw) as ServiceAccount; } catch { return null; }
}
const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

let cached: { token: string; exp: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    signal: AbortSignal.timeout(5000),
  });
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error("FCM OAuth falhou");
  cached = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return j.access_token;
}

/** Envia push pra cada token (FCM HTTP v1). Best-effort; remove tokens inválidos. */
export async function sendPush(tokens: string[], title: string, body: string): Promise<void> {
  const sa = serviceAccount();
  if (!sa || tokens.length === 0) return;
  const pid = process.env.FCM_PROJECT_ID || sa.project_id;
  let at: string;
  try { at = await accessToken(sa); } catch (e) {
    console.error("[fcm] OAuth falhou:", e instanceof Error ? e.message : e);
    return;
  }
  const sendOne = async (token: string): Promise<void> => {
    try {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${pid}/messages:send`, {
        method: "POST",
        signal: AbortSignal.timeout(5000),
        headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token, notification: { title, body },
            android: { priority: "high", notification: { channel_id: "jurandir_chamados", sound: "default" } },
            apns: { payload: { aps: { sound: "default" } } },
          },
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        if (res.status === 404 || /UNREGISTERED/i.test(t)) await deleteDeviceToken(token);
        else console.error("[fcm] send falhou:", res.status, t.slice(0, 200));
      }
    } catch { /* best-effort */ }
  };
  await Promise.allSettled(tokens.map((token) => sendOne(token)));
}
