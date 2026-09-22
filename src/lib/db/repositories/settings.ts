import "server-only";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { fetchAllDbSettings, invalidateConfigCache } from "@/lib/config";

export interface SettingRow { key: string; value: unknown; description: string | null; updated_at: string }

export async function getAllSettings(): Promise<SettingRow[]> {
  const { data, error } = await supabaseAdmin().from("cmr_app_settings").select("*").order("key");
  if (error) throw error;
  // one-time user passcodes are only shown on the Users page
  return (data as SettingRow[]).filter((r) => !r.key.startsWith("auth.setup."));
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const all = await fetchAllDbSettings();
  if (key in all && all[key] !== undefined && all[key] !== null) {
    return all[key] as T;
  }
  return fallback;
}

export async function setSetting(key: string, value: unknown, userId?: string): Promise<void> {
  const { error } = await supabaseAdmin().from("cmr_app_settings").upsert({
    key, value, updated_by: userId && /^[0-9a-f-]{36}$/i.test(userId) ? userId : null, updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  invalidateConfigCache();
}
