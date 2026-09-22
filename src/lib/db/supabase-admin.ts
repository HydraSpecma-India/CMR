import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let client: SupabaseClient | null = null;

/**
 * Server-side Supabase client with the service-role key (RLS is on with no policies, so only this
 * client can read/write the cmr_* tables). Keys come from the environment only – never hardcoded.
 */
export function supabaseAdmin(): SupabaseClient {
  if (client) return client;
  const e = env();
  const url = e.SUPABASE_URL;
  const key = e.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.");
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-application-name": "cmr-platform" } },
  });
  return client;
}

export const Buckets = {
  templateAssets: "cmr-template-assets",
  signatures: "cmr-signatures",
  cmrGenerated: "cmr-generated",
} as const;
