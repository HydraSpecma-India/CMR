import "server-only";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { Errors } from "@/lib/errors";
import { DEFAULT_ROLE_CAPABILITIES, normalizePermissions } from "@/lib/auth/roles";

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  capabilities: string[];
  created_at: string;
  updated_at: string;
  user_count?: number;
}

// In-memory cache for fast capability checks & roles listing
let cachedCapabilities: Record<string, string[]> | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

let cachedRolesList: RoleRow[] | null = null;
let lastRolesListFetch = 0;
const ROLES_LIST_CACHE_TTL = 30_000; // 30 seconds

export function invalidateRolesCache(): void {
  cachedRolesList = null;
  lastRolesListFetch = 0;
  cachedCapabilities = null;
  lastCacheTime = 0;
}

export async function getAllRoleCapabilitiesMap(force = false): Promise<Record<string, string[]>> {
  const now = Date.now();
  if (!force && cachedCapabilities && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedCapabilities;
  }

  try {
    const { data, error } = await supabaseAdmin()
      .from("cmr_roles")
      .select("name, capabilities");

    if (error || !data) {
      return DEFAULT_ROLE_CAPABILITIES;
    }

    const map: Record<string, string[]> = { ...DEFAULT_ROLE_CAPABILITIES };
    for (const r of data) {
      if (r.name && Array.isArray(r.capabilities)) {
        map[r.name] = normalizePermissions(r.capabilities as string[]);
      }
    }

    cachedCapabilities = map;
    lastCacheTime = now;
    return map;
  } catch {
    return DEFAULT_ROLE_CAPABILITIES;
  }
}

export async function getCapabilitiesForRole(roleName: string): Promise<string[]> {
  if (!roleName) return [];
  const map = await getAllRoleCapabilitiesMap();
  if (map[roleName]) return map[roleName];

  // Case-insensitive lookup fallback
  const lower = roleName.toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    if (k.toLowerCase() === lower) return v;
  }

  // Built-in fallback
  if (DEFAULT_ROLE_CAPABILITIES[roleName]) {
    return DEFAULT_ROLE_CAPABILITIES[roleName];
  }

  return [];
}

export async function listRoles(force = false): Promise<RoleRow[]> {
  const now = Date.now();
  if (!force && cachedRolesList && now - lastRolesListFetch < ROLES_LIST_CACHE_TTL) {
    return cachedRolesList;
  }

  const sb = supabaseAdmin();
  const [{ data: roles, error: rolesErr }, { data: users, error: usersErr }] = await Promise.all([
    sb.from("cmr_roles").select("*").order("is_system", { ascending: false }).order("name", { ascending: true }),
    sb.from("cmr_users").select("role"),
  ]);

  if (rolesErr) throw rolesErr;

  const counts: Record<string, number> = {};
  if (users) {
    for (const u of users) {
      if (u.role) {
        counts[u.role] = (counts[u.role] || 0) + 1;
      }
    }
  }

  const result = (roles || []).map((r) => ({
    ...r,
    capabilities: normalizePermissions(r.capabilities || []),
    user_count: counts[r.name] || 0,
  })) as RoleRow[];

  cachedRolesList = result;
  lastRolesListFetch = now;
  return result;
}

export async function getRoleById(id: string): Promise<RoleRow | null> {
  const { data, error } = await supabaseAdmin().from("cmr_roles").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    capabilities: normalizePermissions(data.capabilities || []),
  } as RoleRow;
}

export async function getRoleByName(name: string): Promise<RoleRow | null> {
  const { data, error } = await supabaseAdmin().from("cmr_roles").select("*").eq("name", name).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    capabilities: normalizePermissions(data.capabilities || []),
  } as RoleRow;
}

export async function createCustomRole(input: {
  name: string;
  description?: string;
  capabilities: string[];
}): Promise<RoleRow> {
  const cleanName = input.name.trim();
  if (!cleanName) {
    throw Errors.validation("Role name is required.");
  }

  const existing = await getRoleByName(cleanName);
  if (existing) {
    throw Errors.conflict(`A role named "${cleanName}" already exists.`);
  }

  const normalizedCaps = normalizePermissions(input.capabilities);

  const { data, error } = await supabaseAdmin()
    .from("cmr_roles")
    .insert({
      name: cleanName,
      description: input.description?.trim() || null,
      is_system: false,
      capabilities: normalizedCaps,
    })
    .select("*")
    .single();

  if (error) throw error;

  // Invalidate cache
  invalidateRolesCache();

  return {
    ...data,
    capabilities: normalizedCaps,
  } as RoleRow;
}

export async function updateRole(
  id: string,
  patch: {
    name?: string;
    description?: string;
    capabilities?: string[];
  }
): Promise<RoleRow> {
  const role = await getRoleById(id);
  if (!role) throw Errors.notFound("Role not found.");

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (patch.name !== undefined && !role.is_system) {
    const cleanName = patch.name.trim();
    if (!cleanName) throw Errors.validation("Role name cannot be empty.");
    updates.name = cleanName;
  }

  if (patch.description !== undefined) {
    updates.description = patch.description.trim() || null;
  }

  if (patch.capabilities !== undefined) {
    updates.capabilities = normalizePermissions(patch.capabilities);
  }

  const { data, error } = await supabaseAdmin()
    .from("cmr_roles")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;

  // Invalidate cache
  invalidateRolesCache();

  return {
    ...data,
    capabilities: normalizePermissions(data.capabilities || []),
  } as RoleRow;
}

export async function deleteRole(id: string): Promise<void> {
  const role = await getRoleById(id);
  if (!role) throw Errors.notFound("Role not found.");

  if (role.is_system) {
    throw Errors.validation("System default roles cannot be deleted.");
  }

  // Check if any users are assigned to this role
  const { count, error: countErr } = await supabaseAdmin()
    .from("cmr_users")
    .select("id", { count: "exact", head: true })
    .eq("role", role.name);

  if (countErr) throw countErr;

  if (count && count > 0) {
    throw Errors.conflict(
      `Cannot delete role "${role.name}" because ${count} user(s) are currently assigned to it. Please reassign the users first.`
    );
  }

  const { error } = await supabaseAdmin().from("cmr_roles").delete().eq("id", id);
  if (error) throw error;

  // Invalidate cache
  invalidateRolesCache();
}
