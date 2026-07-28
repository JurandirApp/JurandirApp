import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@prisma/client";

// Pure JWT layer — no next/headers, so it is unit-testable in Node/Vitest.
// The cookie wrappers live in ./session (server-only).

export const SESSION_COOKIE = "jur_session";
export const THIRTY_DAYS = 60 * 60 * 24 * 30;

export type SessionPayload = {
  sub: string;
  role: Role;
  establishmentId: string | null;
  name: string;
};

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

/** Sign a session JWT (HS256). */
export async function signSession(
  p: SessionPayload,
  maxAgeSec = THIRTY_DAYS,
): Promise<string> {
  return new SignJWT({ role: p.role, establishmentId: p.establishmentId, name: p.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSec}s`)
    .sign(secret());
}

/** Verify a session JWT. Returns null on any failure. */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.sub !== "string" || typeof payload.role !== "string") return null;
    return {
      sub: payload.sub,
      role: payload.role as Role,
      establishmentId: (payload.establishmentId as string | null) ?? null,
      name: (payload.name as string) ?? "",
    };
  } catch {
    return null;
  }
}

export function destForRole(role: Role): string {
  return role === "ADMIN" ? "/admin" : "/painel";
}
