"use server";

import { redirect } from "@/i18n/navigation";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { destForRole } from "@/lib/auth/jwt";
import { loginSchema } from "@/lib/validation";

export type LoginResult =
  | { ok: true; dest: string }
  | { ok: false; error: string };

/** Real login: validates against the DB (bcrypt) and sets the JWT session cookie. */
export async function login(
  email: string,
  password: string,
  remember: boolean,
): Promise<LoginResult> {
  const parsed = loginSchema.safeParse({ email, password, remember });
  if (!parsed.success) return { ok: false, error: "invalidCredentials" };

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.trim().toLowerCase() },
  });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    // Error is a message key — LoginScreen translates it (see messages `auth`).
    return { ok: false, error: "invalidCredentials" };
  }

  await createSession(
    {
      sub: user.id,
      role: user.role,
      establishmentId: user.establishmentId,
      name: user.name,
    },
    parsed.data.remember,
  );

  return { ok: true, dest: destForRole(user.role) };
}

export async function logout(locale: string): Promise<void> {
  await destroySession();
  redirect({ href: "/login", locale });
}
