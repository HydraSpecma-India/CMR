import Link from "next/link";
import { ArrowRight, FilePlus2, FileText, History, Settings } from "lucide-react";
import { requireSession, allowedCompanies } from "@/lib/auth/guards";
import { can } from "@/lib/auth/roles";
import { Badge, Card, CardBody, PageHeader } from "@/components/ui";
import { cmrStats, listCmrDocuments } from "@/lib/db/repositories/cmr";
import { getActiveConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const session = await requireSession();
  const caps = session.user.capabilities;
  const companies = allowedCompanies(session) ?? undefined;
  const cfg = await getActiveConfig().catch(() => null);
  let stats = { issued: 0, last30: 0, cancelled: 0, failed: 0 };
  let recent: Awaited<ReturnType<typeof listCmrDocuments>> = [];
  let dbError: string | null = null;
  try {
    [stats, recent] = await Promise.all([cmrStats(companies), listCmrDocuments({ limit: 8, companies })]);
  } catch (e) {
    dbError = (e as Error).message;
  }

  const kpis = [
    { label: "CMRs issued", value: stats.issued, hint: "valid (not cancelled)" },
    { label: "Last 30 days", value: stats.last30, hint: "issued" },
    { label: "Cancelled", value: stats.cancelled, hint: "numbers kept for audit" },
    { label: "Storage failed", value: stats.failed, hint: stats.failed ? "retry from the CMR page" : "all PDFs stored" },
  ];

  const tile = (href: string, Icon: typeof FileText, title: string, text: string, cta: string) => (
    <Link href={href} className="group rounded-lg border border-ink-200 bg-white p-5 transition-all hover:border-brand-500 hover:shadow-sm">
      <Icon className="h-6 w-6 text-brand-600" />
      <div className="mt-3 font-semibold text-ink-900">{title}</div>
      <div className="mt-1 text-sm text-ink-500">{text}</div>
      <div className="mt-3 flex items-center gap-1 text-xs font-medium text-brand-700 group-hover:underline">
        {cta} <ArrowRight className="h-3 w-3" />
      </div>
    </Link>
  );

  return (
    <div className="w-full pb-16">
      <PageHeader
        title={`Welcome, ${session.user.name || session.user.email}`}
        description="CMR consignment notes (UNECE CMR Convention) from Dynamics 365 packing slips."
        actions={cfg ? <Badge tone={cfg.d365.mode === "live" ? "success" : "warning"}>D365 {cfg.d365.mode === "live" ? "live" : "mock (DEMO data)"}</Badge> : null}
      />

      {dbError && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <div className="font-semibold">Supabase is not reachable</div>
          <div className="mt-0.5">{dbError}</div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardBody>
              <div className="text-xs font-medium uppercase tracking-wide text-ink-500">{k.label}</div>
              <div className="mt-1 text-3xl font-semibold">{k.value}</div>
              <div className="mt-1 text-xs text-ink-500">{k.hint}</div>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {can(session.user.role, "createCmr", caps) &&
          tile("/cmr/new", FilePlus2, "Create a CMR", "Pick a posted packing slip, check boxes 1–24, sign and print the 4 copies.", "Start wizard")}
        {can(session.user.role, "viewCmr", caps) &&
          tile("/cmr/history", History, "CMR register", "Search issued CMRs by number, packing slip, consignee, carrier or plate.", "Open register")}
        {can(session.user.role, "viewTemplates", caps) &&
          tile("/admin/templates", FileText, "CMR layout", "Adjust the standard 24-box form or upload your pre-printed CMR as background.", "Open designer")}
        {can(session.user.role, "manageSettings", caps) &&
          tile("/admin/settings", Settings, "Settings", "D365 connection, entities, CMR defaults, numbering and Teams.", "Configure")}
      </div>

      {recent.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">Recent CMRs</h2>
          <div className="divide-y divide-ink-100 rounded-lg border border-ink-200 bg-white">
            {recent.map((d) => (
              <Link key={d.id} href={`/cmr/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ink-50">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink-900">
                    {d.cmr_number} <span className="font-normal text-ink-500">· {d.packing_slip_id}</span>
                  </div>
                  <div className="truncate text-xs text-ink-500">
                    {d.consignee_name} · {d.delivery_place} · {d.carrier_name || "carrier –"}
                  </div>
                </div>
                <Badge tone={d.status === "CANCELLED" ? "warning" : d.status === "UPLOAD_FAILED" ? "danger" : "success"}>
                  {d.status === "UPLOADED" ? "Issued" : d.status.replace("_", " ").toLowerCase()}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
