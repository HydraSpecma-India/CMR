import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { uploadAsset } from "@/lib/db/repositories/assets";
import { createTemplate } from "@/lib/db/repositories/templates";
import { buildCmrSeed } from "@/lib/template/seed-cmr";
import { buildCmrFormPdf } from "@/lib/cmr/form-pdf";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { audit } from "@/lib/audit/audit";

/**
 * Creates the "Standard CMR consignment note" template: the blank 24-box UNECE form
 * (4 copies, generated as vector PDF) as background, with one field placed in every box.
 */
export const POST = route(async () => {
  const session = await requireCapability("manageTemplates");
  const bytes = Buffer.from(await buildCmrFormPdf());
  const asset = await uploadAsset({
    kind: "background",
    fileName: "CMR-standard-form-4-copies.pdf",
    mimeType: "application/pdf",
    bytes,
    userId: session.user.id,
  });

  const tpl = buildCmrSeed(asset.id);
  const created = await createTemplate({
    name: tpl.templateName,
    description: "Standard 24-box CMR (UNECE 1956) – copies for sender, consignee, carrier and administration.",
    templateType: "CMR",
    userId: session.user.id,
    templateJson: tpl,
  });
  await supabaseAdmin().from("cmr_template_versions").update({ background_asset_id: asset.id, revision: "UNECE 1956" }).eq("id", created.version.id);
  await audit({ entityType: "template", entityId: created.template.id, action: "CREATED", user: session.user, details: { seed: "standard-cmr" } });
  return json(created, { status: 201 });
});
