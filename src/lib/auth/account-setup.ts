import "server-only";
import { randomInt, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { hashPassword } from "@/lib/auth/password";
import { invalidateConfigCache } from "@/lib/config";
import { invalidateUsersCache, getUserByEmail, type UserRow } from "@/lib/db/repositories/users";
import { Errors } from "@/lib/errors";

/**
 * First-login / password-reset flow without e-mailing passwords:
 *  1. An admin creates a user without a password (or clicks "New passcode").
 *  2. A 6-digit passcode is generated and shown to the admin on the Users page.
 *  3. The user opens the sign-in page → "New user / set password", enters e-mail + passcode
 *     and chooses a password. The passcode is single-use, expires and locks after 5 wrong tries.
 * Passcodes live in cmr_app_settings under `auth.setup.<userId>` (never returned by /api/settings).
 */

export const SETUP_PREFIX = "auth.setup.";
const VALID_DAYS = 14;
const MAX_ATTEMPTS = 5;
export const MIN_PASSWORD_LENGTH = 6;

export interface SetupRecord {
  code: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  attempts: number;
}

const keyFor = (userId: string) => `${SETUP_PREFIX}${userId}`;

export async function issueSetupPasscode(user: Pick<UserRow, "id" | "email">, opts: { clearPassword?: boolean } = {}): Promise<SetupRecord> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const now = new Date();
  const rec: SetupRecord = {
    code,
    email: user.email.toLowerCase(),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + VALID_DAYS * 86_400_000).toISOString(),
    attempts: 0,
  };
  const db = supabaseAdmin();
  const { error } = await db.from("cmr_app_settings").upsert({
    key: keyFor(user.id),
    value: rec,
    description: "One-time passcode for the user to set a password",
    updated_at: rec.createdAt,
  });
  if (error) throw error;
  if (opts.clearPassword) {
    const { error: e2 } = await db.from("cmr_users").update({ password_hash: null, updated_at: rec.createdAt }).eq("id", user.id);
    if (e2) throw e2;
    invalidateUsersCache();
  }
  invalidateConfigCache();
  return rec;
}

/** All pending passcodes, keyed by user id (admin Users page). */
export async function listSetupPasscodes(): Promise<Record<string, SetupRecord>> {
  const { data, error } = await supabaseAdmin().from("cmr_app_settings").select("key, value").like("key", `${SETUP_PREFIX}%`);
  if (error) return {};
  const out: Record<string, SetupRecord> = {};
  for (const row of data ?? []) out[String(row.key).slice(SETUP_PREFIX.length)] = row.value as SetupRecord;
  return out;
}

async function getSetup(userId: string): Promise<SetupRecord | null> {
  const { data } = await supabaseAdmin().from("cmr_app_settings").select("value").eq("key", keyFor(userId)).maybeSingle();
  return (data?.value as SetupRecord) ?? null;
}

async function clearSetup(userId: string) {
  await supabaseAdmin().from("cmr_app_settings").delete().eq("key", keyFor(userId));
  invalidateConfigCache();
}

/** true when the account exists, is active and still has to choose a password. */
export async function needsPasswordSetup(email: string): Promise<boolean> {
  const user = await getUserByEmail(email).catch(() => null);
  if (!user || !user.active) return false;
  if (!user.password_hash) return true;
  return Boolean(await getSetup(user.id));
}

export async function completePasswordSetup(email: string, code: string, password: string): Promise<UserRow> {
  if (!/^\d{6}$/.test(code)) throw Errors.validation("The passcode is the 6-digit number from your administrator.");
  if (password.length < MIN_PASSWORD_LENGTH) throw Errors.validation(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);

  const user = await getUserByEmail(email);
  const invalid = () => Errors.validation("Email or passcode is not valid. Ask your administrator for a new passcode.");
  if (!user || !user.active) throw invalid();
  const rec = await getSetup(user.id);
  if (!rec) throw invalid();
  if (new Date(rec.expiresAt).getTime() < Date.now()) throw Errors.validation("This passcode has expired. Ask your administrator for a new one.");
  if (rec.attempts >= MAX_ATTEMPTS) throw Errors.validation("Too many wrong attempts. Ask your administrator for a new passcode.");

  const ok = rec.code.length === code.length && timingSafeEqual(Buffer.from(rec.code), Buffer.from(code));
  if (!ok) {
    await supabaseAdmin().from("cmr_app_settings").update({ value: { ...rec, attempts: rec.attempts + 1 } }).eq("key", keyFor(user.id));
    invalidateConfigCache();
    throw Errors.validation(`Wrong passcode (${MAX_ATTEMPTS - rec.attempts - 1} attempt(s) left).`);
  }

  const { error } = await supabaseAdmin()
    .from("cmr_users")
    .update({ password_hash: hashPassword(password), updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) throw error;
  await clearSetup(user.id);
  invalidateUsersCache();
  return user;
}

/** User row as sent to the browser: never the hash, plus password / passcode status for admins. */
export type SafeUser = Omit<UserRow, "password_hash"> & {
  has_password: boolean;
  setup?: { code: string; expiresAt: string; locked: boolean } | null;
};

export function toSafeUser(u: UserRow, setups: Record<string, SetupRecord> = {}): SafeUser {
  const { password_hash, ...rest } = u;
  const s = setups[u.id];
  return {
    ...rest,
    has_password: Boolean(password_hash),
    setup: s ? { code: s.code, expiresAt: s.expiresAt, locked: s.attempts >= MAX_ATTEMPTS || new Date(s.expiresAt).getTime() < Date.now() } : null,
  };
}
