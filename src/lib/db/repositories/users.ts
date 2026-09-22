import "server-only";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import type { Role } from "@/lib/auth/roles";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { Errors } from "@/lib/errors";
import { invalidateRolesCache } from "./roles";

export interface UserRow {
  id: string;
  entra_object_id: string | null;
  email: string;
  display_name: string | null;
  role: Role;
  active: boolean;
  password_hash?: string | null;
  last_login_at: string | null;
  created_at: string;
  allowed_companies?: string[] | null;
}

let cachedUsersList: UserRow[] | null = null;
let lastUsersFetch = 0;
const USERS_CACHE_TTL = 30_000; // 30 seconds

export function invalidateUsersCache(): void {
  cachedUsersList = null;
  lastUsersFetch = 0;
  try {
    invalidateRolesCache();
  } catch {}
}

export async function upsertUserOnSignIn(input: {
  entraObjectId?: string;
  email: string;
  displayName?: string;
  roleHint?: Role;
  bootstrapAdmin: boolean;
}): Promise<UserRow> {
  const db = supabaseAdmin();
  const email = input.email.trim().toLowerCase();
  const { data: existing } = await db.from("cmr_users").select("*").eq("email", email).maybeSingle();

  if (existing) {
    const patch: Record<string, unknown> = {
      last_login_at: new Date().toISOString(),
      display_name: input.displayName ?? existing.display_name,
      entra_object_id: input.entraObjectId ?? existing.entra_object_id,
    };
    // Only update role if Entra gave a specific app role claim and not a local dev fallback
    if (input.roleHint && input.entraObjectId && !input.entraObjectId.startsWith("local:")) {
      patch.role = input.roleHint;
    }
    const { data, error } = await db.from("cmr_users").update(patch).eq("id", existing.id).select("*").single();
    if (error) throw error;
    invalidateUsersCache();
    return data as UserRow;
  }

  const role: Role = input.roleHint ?? (input.bootstrapAdmin ? "Admin" : "Viewer");
  const { data, error } = await db
    .from("cmr_users")
    .insert({
      entra_object_id: input.entraObjectId ?? null,
      email,
      display_name: input.displayName ?? null,
      role,
      active: true,
      last_login_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  invalidateUsersCache();
  return data as UserRow;
}

export async function listUsers(force = false): Promise<UserRow[]> {
  const now = Date.now();
  if (!force && cachedUsersList && now - lastUsersFetch < USERS_CACHE_TTL) {
    return cachedUsersList;
  }
  const { data, error } = await supabaseAdmin().from("cmr_users").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  const res = (data as UserRow[]) || [];
  cachedUsersList = res;
  lastUsersFetch = now;
  return res;
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const { data, error } = await supabaseAdmin().from("cmr_users").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as UserRow) || null;
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const { data, error } = await supabaseAdmin().from("cmr_users").select("*").eq("email", email.trim().toLowerCase()).maybeSingle();
  if (error) throw error;
  return (data as UserRow) || null;
}

export async function createUser(input: {
  email: string;
  displayName?: string;
  role: Role;
  password?: string;
  active?: boolean;
  allowed_companies?: string[];
}): Promise<UserRow> {
  const db = supabaseAdmin();
  const email = input.email.trim().toLowerCase();

  const { data: existing } = await db.from("cmr_users").select("id").eq("email", email).maybeSingle();
  if (existing) {
    throw Errors.conflict(`A user with email ${email} already exists.`);
  }

  const passwordHash = input.password ? hashPassword(input.password) : null;

  const { data, error } = await db
    .from("cmr_users")
    .insert({
      email,
      display_name: input.displayName?.trim() || null,
      role: input.role,
      active: input.active !== false,
      password_hash: passwordHash,
      last_login_at: null,
      allowed_companies: input.allowed_companies && input.allowed_companies.length > 0 ? input.allowed_companies : ["ALL"],
    })
    .select("*")
    .single();

  if (error) throw error;
  invalidateUsersCache();
  return data as UserRow;
}

export async function updateUser(
  id: string,
  patch: { displayName?: string; role?: Role; active?: boolean; allowed_companies?: string[] }
): Promise<UserRow> {
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.displayName !== undefined) updates.display_name = patch.displayName.trim();
  if (patch.role !== undefined) updates.role = patch.role;
  if (patch.active !== undefined) updates.active = patch.active;
  if (patch.allowed_companies !== undefined) updates.allowed_companies = patch.allowed_companies;

  const { data, error } = await supabaseAdmin().from("cmr_users").update(updates).eq("id", id).select("*").single();
  if (error) throw error;
  invalidateUsersCache();
  return data as UserRow;
}

export async function resetUserPassword(id: string, newPassword: string): Promise<void> {
  if (!newPassword || newPassword.length < 6) {
    throw Errors.validation("Password must be at least 6 characters long.");
  }
  const passwordHash = hashPassword(newPassword);
  const { error } = await supabaseAdmin()
    .from("cmr_users")
    .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  invalidateUsersCache();
}

export async function deleteUser(id: string): Promise<void> {
  const { error } = await supabaseAdmin().from("cmr_users").delete().eq("id", id);
  if (error) throw error;
  invalidateUsersCache();
}

export async function verifyUserCredentials(email: string, password: string): Promise<UserRow | null> {
  const cleanEmail = email.trim().toLowerCase();
  const db = supabaseAdmin();
  const { data: user } = await db.from("cmr_users").select("*").eq("email", cleanEmail).maybeSingle();

  if (!user) return null;
  if (!user.active) {
    throw new Error("Account is deactivated. Please contact your administrator.");
  }

  // If user has a password_hash, verify it
  if (user.password_hash) {
    const valid = verifyPassword(password, user.password_hash);
    if (valid) return user as UserRow;
    return null;
  }

  return null;
}
