import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { listAssets, uploadAsset, type AssetKind } from "@/lib/db/repositories/assets";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit/audit";

const KINDS: AssetKind[] = ["background", "logo", "image", "font"];

export const GET = route(async (req) => {
  await requireCapability("viewTemplates");
  const kind = req.nextUrl.searchParams.get("kind") as AssetKind | null;
  const assets = await listAssets(kind && KINDS.includes(kind) ? kind : undefined);
  return json({ assets });
});

/** multipart/form-data: file, kind, templateId? */
export const POST = route(async (req) => {
  const session = await requireCapability("manageTemplates");
  const form = await req.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") || "image") as AssetKind;
  const templateId = form.get("templateId") ? String(form.get("templateId")) : null;
  if (!(file instanceof File)) throw Errors.validation("No file was uploaded.");
  if (!KINDS.includes(kind)) throw Errors.validation("Unknown asset kind.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const asset = await uploadAsset({ kind, fileName: file.name, mimeType: file.type || "application/octet-stream", bytes, templateId, userId: session.user.id });
  await audit({ entityType: "asset", entityId: asset.id, action: kind === "background" ? "BACKGROUND_UPLOADED" : "CREATED", user: session.user, details: { fileName: file.name, kind, templateId } });
  return json({ asset }, { status: 201 });
});
