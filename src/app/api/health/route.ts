import { NextResponse } from "next/server";
import { env, devBypassEnabled } from "@/lib/env";

/** Public, secret-free health/config summary. */
export function GET() {
  const e = env();
  return NextResponse.json({
    ok: true,
    app: e.APP_NAME,
    d365Mode: e.D365_MODE,
    storageMode: e.STORAGE_MODE,
    entraSignIn: Boolean(e.AUTH_MICROSOFT_ENTRA_ID_ID),
    devSignIn: devBypassEnabled(),
    supabase: Boolean(e.SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY),
  });
}
