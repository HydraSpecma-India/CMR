import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { setVersionStatus } from "@/lib/db/repositories/templates";
import { audit } from "@/lib/audit/audit";

export const POST = route<{ id: string; versionId: string }>(async (_req, { params }) => {
  const session = await requireCapability("manageTemplates");
  await setVersionStatus(params.id, params.versionId, "deleted", "draft");
  await audit({ entityType: "template_version", entityId: params.versionId, action: "RESTORED", user: session.user });
  return json({ ok: true });
});
