import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

const KNOWN_URL = "https://ollhtyeflpggdazrsqsq.supabase.co";
const KNOWN_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sbGh0eWVmbHBnZ2RhenJzcXNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5NTQwMDEsImV4cCI6MjA5NzUzMDAwMX0.b7Dk8ZZjQrfj4S9GAWxIwKsqciA3byxVgw3i0pajLVc";

let client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (client) return client;
  const e = env();
  const url: string = (e.SUPABASE_URL && e.SUPABASE_URL.startsWith("http") ? e.SUPABASE_URL : KNOWN_URL) as string;

  // Prefer service_role key if provided and valid (JWT starts with "ey");
  // otherwise fallback to anon key or verified project key.
  let key: string = KNOWN_KEY;
  if (e.SUPABASE_SERVICE_ROLE_KEY && e.SUPABASE_SERVICE_ROLE_KEY.startsWith("ey")) {
    key = e.SUPABASE_SERVICE_ROLE_KEY;
  } else if (e.SUPABASE_ANON_KEY && e.SUPABASE_ANON_KEY.startsWith("ey")) {
    key = e.SUPABASE_ANON_KEY;
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
