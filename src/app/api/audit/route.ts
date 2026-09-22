import { route, json } from "@/lib/api/handler";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { supabaseAdmin } from "@/lib/db/supabase-admin";

export const GET = route(async (req) => {
  const session = await requireSession();
  requireRole(session, ["Admin", "Logistics"]);

  const q = req.nextUrl.searchParams.get("q") || "";
  const sb = supabaseAdmin();
  let query = sb.from("cmr_audit_logs").select("*").order("created_at", { ascending: false }).limit(100);

  if (q) {
    query = query.or(`action.ilike.%${q}%,entity_type.ilike.%${q}%,user_email.ilike.%${q}%,cmr_number.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return json({ ok: true, logs: data || [] });
});
