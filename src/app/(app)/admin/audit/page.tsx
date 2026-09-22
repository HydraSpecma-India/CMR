import { requireCapability } from "@/lib/auth/guards";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { AuditClient } from "./audit-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit Trail" };

export default async function AuditPage() {
  await requireCapability("viewAudit");
  const { data } = await supabaseAdmin()
    .from("cmr_audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  return <AuditClient initialLogs={data || []} />;
}
