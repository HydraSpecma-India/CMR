"use client";

import { signOut } from "next-auth/react";

/**
 * Resolve the sign-in page URL the browser should land on after sign-out / session timeout.
 *
 *  • Admin-configured "Login redirect URL" (System Settings → Application Rules) wins.
 *    It may be absolute (https://cmr.hydraspecma.com/signin) or relative (/signin).
 *  • Otherwise the current browser origin is used – never the server's internal host
 *    name (Azure App Service containers report e.g. http://localhost:8080 / *.azurewebsites.net).
 */
export function resolveLoginUrl(configured: string | undefined, reason?: "inactivity" | "signout"): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  let url: URL;
  try {
    const raw = (configured || "").trim();
    url = raw ? new URL(raw, origin || undefined) : new URL("/signin", origin || "http://localhost");
  } catch {
    url = new URL("/signin", origin || "http://localhost");
  }
  if (reason === "inactivity" && !url.searchParams.has("reason")) url.searchParams.set("reason", "inactivity");
  return url.toString();
}

/** Sign out without letting NextAuth build the redirect, then go to the configured login page. */
export async function signOutToLogin(configured: string | undefined, reason?: "inactivity" | "signout") {
  const target = resolveLoginUrl(configured, reason);
  try {
    await signOut({ redirect: false });
  } catch {
    /* even if the sign-out call fails the cookie is cleared server-side on next request */
  }
  window.location.replace(target);
}
