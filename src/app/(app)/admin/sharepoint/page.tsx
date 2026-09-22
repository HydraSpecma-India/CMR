import Link from "next/link";
import { requireCapability } from "@/lib/auth/guards";
import { getActiveConfig } from "@/lib/config";
import { PageHeader, Card, CardHeader, CardBody, Badge, Button } from "@/components/ui";
import { Share2, ArrowRight, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "SharePoint Integration" };

export default async function SharePointPage() {
  await requireCapability("manageSettings");
  const config = (await getActiveConfig()).sharepoint;

  const isConfigured = Boolean(
    config.tenantId && config.clientId && config.siteId && config.driveId
  );

  return (
    <div className="w-full pb-16">
      <PageHeader
        title="SharePoint Document Integration"
        description="Configure automated archiving of finalized CMR consignment note PDFs directly into your Microsoft 365 SharePoint document libraries."
        actions={
          <Link href="/admin/settings">
            <Button size="sm">
              Configure in Settings <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        }
      />

      <div className="grid gap-6 md:grid-cols-2 mb-6">
        <Card>
          <CardHeader title="Current Storage Mode" />
          <CardBody className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Active Mode:</span>
              <Badge tone={config.mode === "live" ? "success" : "info"}>
                {config.mode === "live" ? "LIVE SharePoint (Microsoft Graph)" : "HydraSpecma Cloud Storage"}
              </Badge>
            </div>
            <p className="text-xs text-ink-600">
              {config.mode === "live"
                ? "CMR PDFs are uploaded automatically to the specified SharePoint Document Library via Microsoft Graph."
                : "CMR PDFs are preserved in Supabase private Storage bucket (cmr-generated) with secure timed download links."}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Graph API Credentials Status" />
          <CardBody className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-ink-100">
              <span className="text-ink-500">Azure Tenant ID:</span>
              <span className="font-mono">{config.tenantId ? `${config.tenantId.slice(0, 8)}...` : "Not set"}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-ink-100">
              <span className="text-ink-500">Client ID:</span>
              <span className="font-mono">{config.clientId ? `${config.clientId.slice(0, 8)}...` : "Not set"}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-ink-100">
              <span className="text-ink-500">Site ID:</span>
              <span className="font-mono">{config.siteId ? `${config.siteId.slice(0, 16)}...` : "Not set"}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-ink-500">Root Folder:</span>
              <span className="font-semibold text-ink-800">{config.rootFolder || "CMR"}</span>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Folder Hierarchy & File Naming Pattern" />
        <CardBody className="space-y-3 text-sm text-ink-600">
          <p>
            When a CMR is generated, the platform creates an automated folder structure within your SharePoint document library:
          </p>
          <div className="rounded bg-ink-900 p-3 font-mono text-xs text-brand-400">
            {config.rootFolder}/&#123;Year&#125;/&#123;ItemNumber&#125;/&#123;CMRNumber&#125;.pdf
          </div>
          <p className="text-xs text-ink-500">
            Example: <code className="text-ink-800">CMR/2026/HS-HOSE-050-2SN/CMR-2026-0001.pdf</code>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
