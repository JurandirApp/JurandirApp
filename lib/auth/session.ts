import "server-only";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  THIRTY_DAYS,
  signSession,
  verifySession,
  type SessionPayload,
} from "./jwt";

export async function createSession(p: SessionPayload, remember: boolean): Promise<void> {
  const token = await signSession(p, THIRTY_DAYS);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    // "Continuar conectado" → persistent; otherwise a session cookie.
    ...(remember ? { maxAge: THIRTY_DAYS } : {}),
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  return token ? verifySession(token) : null;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
