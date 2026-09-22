import { route, json } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/auth/guards";
import { deactivateVersion } from "@/lib/db/repositories/templates";
import { audit } from "@/lib/audit/audit";

export const POST = route<{ id: string; versionId: string }>(async (_req, { params }) => {
  const session = await requireAdmin();
  await deactivateVersion(params.id, params.versionId, session.user.id);
  await audit({ entityType: "template_version", entityId: params.versionId, action: "DEACTIVATED", user: session.user, details: { templateId: params.id } });
  return json({ ok: true });
});
