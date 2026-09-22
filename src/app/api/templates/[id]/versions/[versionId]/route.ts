import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireAdmin, requireCapability } from "@/lib/auth/guards";
import { getVersion, saveDraft, setVersionStatus } from "@/lib/db/repositories/templates";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit/audit";

type P = { id: string; versionId: string };

export const GET = route<P>(async (_req, { params }) => {
  await requireCapability("viewTemplates");
  const version = await getVersion(params.id, params.versionId);
  if (!version) throw Errors.notFound("Template version");
  return json({ version });
});

const PutSchema = z.object({
  templateJson: z.unknown(),
  revision: z.string().max(40).optional(),
  changeNote: z.string().max(500).optional(),
  backgroundAssetId: z.string().nullable().optional(),
});

export const PUT = route<P>(async (req, { params }) => {
  const session = await requireCapability("manageTemplates");
  const body = PutSchema.parse(await req.json());

  // Normalize backgroundAssetId: map built-in fallbacks or invalid strings safely
  let bgAssetId = body.backgroundAssetId?.trim() || null;
  if (
    bgAssetId === "builtin-hydraspecma" ||
    bgAssetId === "default" ||
    bgAssetId === "00000000-0000-0000-0000-000000000001"
  ) {
    bgAssetId = "00000000-0000-0000-0000-000000000001";
  } else if (
    bgAssetId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bgAssetId)
  ) {
    bgAssetId = null;
  }

  const version = await saveDraft(params.id, params.versionId, body.templateJson, {
    ...body,
    backgroundAssetId: bgAssetId,
  });
  await audit({ entityType: "template_version", entityId: version.id, action: "EDITED", user: session.user, details: { templateId: params.id, versionNumber: version.version_number } });
  return json({ version });
});

/** Soft delete of a draft (restorable). */
export const DELETE = route<P>(async (_req, { params }) => {
  const session = await requireAdmin();
  await setVersionStatus(params.id, params.versionId, "draft", "deleted");
  await audit({ entityType: "template_version", entityId: params.versionId, action: "DELETED", user: session.user });
  return json({ ok: true });
});
