import NextAuth, { type NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import { adminEmails, devBypassEnabled, env } from "@/lib/env";
import { isRole, type Role } from "@/lib/auth/roles";
import { upsertUserOnSignIn } from "@/lib/db/repositories/users";
import { getCapabilitiesForRole } from "@/lib/db/repositories/roles";
import { logger } from "@/lib/logging/logger";

declare module "next-auth" {
  interface Session {
    user: {
      id: string; // users.id (Supabase)
      email: string;
      name?: string | null;
      role: Role;
      isDev?: boolean;
      allowedCompanies?: string[];
      capabilities?: string[];
    };
  }
}

/**
 * Role resolution order:
 *  1. Entra App Role claim ("roles") when present
 *  2. users.role from Supabase
 *  3. ADMIN_EMAILS bootstrap
 *  4. Viewer
 */
function roleFromClaims(claims: unknown): Role | undefined {
  const roles = (claims as { roles?: unknown })?.roles;
  if (Array.isArray(roles)) {
    for (const r of roles) if (isRole(r)) return r;
  }
  return undefined;
}

const providers: NextAuthConfig["providers"] = [];

if (env().AUTH_MICROSOFT_ENTRA_ID_ID) {
  providers.push(
    MicrosoftEntraID({
      clientId: env().AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: env().AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: env().AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      authorization: { params: { scope: "openid profile email User.Read" } },
    }),
  );
}

import { verifyUserCredentials } from "@/lib/db/repositories/users";
import { supabaseAdmin } from "@/lib/db/supabase-admin";

// 1. Password Credentials Provider
providers.push(
  Credentials({
    id: "credentials",
    name: "Email and Password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(c) {
      const email = String(c?.email || "").trim().toLowerCase();
      const password = String(c?.password || "");
      if (!email || !password) return null;

      try {
        const user = await verifyUserCredentials(email, password);
        if (user) {
          // Asynchronously update last_login_at in the background without blocking the login response
          supabaseAdmin()
            .from("cmr_users")
            .update({ last_login_at: new Date().toISOString() })
            .eq("id", user.id)
            .then(() => {}, (e) => logger.warn("Failed to update last_login_at", { error: (e as Error).message }));

          return {
            id: user.id,
            email: user.email,
            name: user.display_name || user.email,
            role: user.role,
            allowed_companies: user.allowed_companies || ["ALL"],
          } as never;
        }
      } catch (err) {
        logger.error("credentials login error", { email, error: (err as Error).message });
      }
      return null;
    },
  }),
);

// 2. Local development provider – signs in WITHOUT a password, so it is only registered when
//    AUTH_DEV_BYPASS=true is set explicitly (never in production).
if (env().AUTH_DEV_BYPASS === "true") providers.push(
  Credentials({
    id: "dev",
    name: "Local user sign-in",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
      name: { label: "Name", type: "text" },
      role: { label: "Role", type: "text" },
    },
    async authorize(c) {
      const email = String(c?.email || "manigandan.parthasarathi@hydraspecma.com").trim().toLowerCase();
      const password = String(c?.password || "");
      if (password) {
        const user = await verifyUserCredentials(email, password);
        if (user) {
          return {
            id: user.id,
            email: user.email,
            name: user.display_name || user.email,
            role: user.role,
            allowed_companies: user.allowed_companies || ["ALL"],
          } as never;
        }
      }
      // Guaranteed Admin role for manigandan.parthasarathi@hydraspecma.com
      const role = email === "manigandan.parthasarathi@hydraspecma.com" ? "Admin" : (isRole(c?.role) ? c.role : "Admin");
      const name = String(c?.name || (email.includes("manigandan") ? "Manigandan Parthasarathi" : "Admin User"));
      return { id: `local:${email}`, email, name, role, isDev: true, allowed_companies: ["ALL"] } as never;
    },
  }),
);

export const authConfig: NextAuthConfig = {
  providers,
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/signin" },
  trustHost: true,
  callbacks: {
    async redirect({ url, baseUrl }) {
      const publicBase = process.env.APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL;
      const cleanBase = publicBase ? publicBase.replace(/\/$/, "") : "";

      if (url.startsWith("/")) {
        return cleanBase ? `${cleanBase}${url}` : url;
      }

      try {
        const parsed = new URL(url);
        // If the URL has an internal container hostname or internal port like 8080
        if (parsed.port === "8080" || !parsed.hostname.includes(".")) {
          return cleanBase ? `${cleanBase}${parsed.pathname}${parsed.search}` : `${parsed.pathname}${parsed.search}`;
        }
        return url;
      } catch {
        return cleanBase || baseUrl || "/";
      }
    },
    async jwt({ token, user, account, profile, trigger }) {
      // First sign-in: persist the user and resolve the role.
      if (user && (account || trigger === "signIn")) {
        const email = (user.email || token.email || "").toLowerCase();
        const claimRole = roleFromClaims(profile);
        const isDev = (user as { isDev?: boolean }).isDev === true;
        const devRole = (user as { role?: Role }).role;
        const userAllowedCompanies = (user as { allowed_companies?: string[] }).allowed_companies;

        // Fast path for credentials login: user is already verified & loaded from DB
        if (account?.provider === "credentials" && user.id && !user.id.startsWith("local:")) {
          token.uid = user.id;
          token.role = (user as { role?: Role }).role || "Viewer";
          token.active = true;
          token.allowed_companies = userAllowedCompanies || ["ALL"];
          token.capabilities = await getCapabilitiesForRole(String(token.role));
          token.isDev = false;
          token.email = email;
          return token;
        }

        try {
          const dbUser = await upsertUserOnSignIn({
            entraObjectId: (profile as { oid?: string })?.oid ?? (isDev ? user.id : undefined),
            email,
            displayName: user.name ?? undefined,
            roleHint: isDev ? devRole : claimRole,
            bootstrapAdmin: adminEmails().includes(email),
          });
          token.uid = dbUser.id;
          token.role = dbUser.role;
          token.active = dbUser.active;
          token.allowed_companies = dbUser.allowed_companies || ["ALL"];
          token.capabilities = await getCapabilitiesForRole(dbUser.role);
        } catch (err) {
          // Supabase not reachable: allow sign-in with a minimal, non-persisted identity
          logger.error("user upsert failed during sign-in", { email, error: (err as Error).message });
          token.uid = user.id;
          token.role = isDev ? devRole : claimRole ?? (adminEmails().includes(email) ? "Admin" : "Viewer");
          token.active = true;
          token.allowed_companies = ["ALL"];
          token.capabilities = await getCapabilitiesForRole(String(token.role));
        }
        token.isDev = isDev;
        token.email = email;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = String(token.uid ?? "");
      session.user.email = String(token.email ?? "");
      session.user.role = isRole(token.role) ? token.role : "Viewer";
      session.user.isDev = token.isDev === true;
      session.user.allowedCompanies = Array.isArray(token.allowed_companies)
        ? (token.allowed_companies as string[])
        : ["ALL"];
      session.user.capabilities = Array.isArray(token.capabilities)
        ? (token.capabilities as string[])
        : await getCapabilitiesForRole(session.user.role);
      if (token.active === false) {
        // Deactivated users get a Viewer session with no id → every guard fails.
        session.user.role = "Viewer";
        session.user.id = "";
        session.user.capabilities = [];
      }
      return session;
    },
  },
  logger: {
    error: (e) => logger.error("auth error", { error: e.message }),
    warn: (code) => logger.warn("auth warning", { code }),
    debug: () => {},
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

export const hasSignInProvider = () => providers.length > 0;
export const hasEntraProvider = () => Boolean(env().AUTH_MICROSOFT_ENTRA_ID_ID);
