import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { createVersion, createTemplate } from "@/lib/db/repositories/templates";
import { buildCmrSeed } from "@/lib/template/seed-cmr";
import { buildCmrFormPdf } from "@/lib/cmr/form-pdf";
import { uploadAsset } from "@/lib/db/repositories/assets";
import { Errors } from "@/lib/errors";

const EnsureDraftSchema = z.object({
  templateId: z.string().min(1),
});

export const POST = route(async (req) => {
  const session = await requireSession();
  const { templateId } = EnsureDraftSchema.parse(await req.json());
  const sb = supabaseAdmin();

  let targetTemplateId = templateId;

  // If dummy fallback ID, find or create real template
  const isFallback =
    templateId === "00000000-0000-0000-0000-000000000001" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(templateId);

  if (isFallback) {
    // 1. Check exact standard ID
    const { data: standardById } = await sb
      .from("cmr_templates")
      .select("id")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .maybeSingle();

    if (standardById) {
      targetTemplateId = standardById.id;
    } else {
      // 2. Check by name
      const { data: standardByName } = await sb
        .from("cmr_templates")
        .select("id")
        .ilike("name", "%CMR%")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (standardByName) {
        targetTemplateId = standardByName.id;
      } else {
        // 3. Seed the standard CMR template
        const asset = await uploadAsset({
          kind: "background",
          fileName: "CMR-standard-form-4-copies.pdf",
          mimeType: "application/pdf",
          bytes: Buffer.from(await buildCmrFormPdf()),
          userId: session.user.id,
        });
        const seedJson = buildCmrSeed(asset.id);
        const created = await createTemplate({
          name: seedJson.templateName,
          description: "Standard 24-box CMR (UNECE 1956)",
          templateType: "CMR",
          userId: session.user.id,
          templateJson: seedJson,
        });

        await sb
          .from("cmr_template_versions")
          .update({ background_asset_id: asset.id, revision: "UNECE 1956" })
          .eq("id", created.version.id);

        return json({
          ok: true,
          templateId: created.template.id,
          versionId: created.version.id,
        });
      }
    }
  }

  // Check existing versions for this template
  const { data: versions, error } = await sb
    .from("cmr_template_versions")
    .select("id, status, version_number")
    .eq("template_id", targetTemplateId)
    .order("version_number", { ascending: false });

  if (error || !versions || versions.length === 0) {
    throw Errors.notFound("Template versions");
  }

  // If a draft version already exists, use it
  const existingDraft = versions.find((v) => v.status === "draft");
  if (existingDraft) {
    return json({
      ok: true,
      templateId: targetTemplateId,
      versionId: existingDraft.id,
    });
  }

  // All versions are published or deprecated: create a new draft version
  const newVersion = await createVersion(
    targetTemplateId,
    undefined,
    session.user.id,
    "Draft for customization"
  );

  return json({
    ok: true,
    templateId: targetTemplateId,
    versionId: newVersion.id,
  });
});
