import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { publishVersion } from "@/lib/db/repositories/templates";
import { audit } from "@/lib/audit/audit";

export const POST = route<{ id: string; versionId: string }>(async (_req, { params }) => {
  const session = await requireCapability("manageTemplates");
  const version = await publishVersion(params.id, params.versionId, session.user.id);
  await audit({ entityType: "template_version", entityId: version.id, action: "PUBLISHED", user: session.user, details: { templateId: params.id, versionNumber: version.version_number } });
  return json({ version });
});
