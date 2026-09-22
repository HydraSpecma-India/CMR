import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { createVersion } from "@/lib/db/repositories/templates";
import { audit } from "@/lib/audit/audit";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const session = await requireCapability("manageTemplates");
  const body = z.object({ fromVersionId: z.string().uuid().optional(), changeNote: z.string().max(500).optional() }).parse(await req.json().catch(() => ({})));
  const version = await createVersion(params.id, body.fromVersionId, session.user.id, body.changeNote);
  await audit({ entityType: "template_version", entityId: version.id, action: "VERSION_CREATED", user: session.user, details: { templateId: params.id, versionNumber: version.version_number } });
  return json({ version }, { status: 201 });
});
