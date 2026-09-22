import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { uploadAsset } from "@/lib/db/repositories/assets";
import { createTemplate, publishVersion } from "@/lib/db/repositories/templates";
import { parseTemplate } from "@/lib/template/schema";
import { buildCmrSeed } from "@/lib/template/seed-cmr";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { PDFDocument } from "pdf-lib";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit/audit";

export const POST = route(async (req) => {
  const session = await requireCapability("manageTemplates");

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const name = (formData.get("name") as string | null)?.trim() || "Uploaded CMR form";
  const description = (formData.get("description") as string | null)?.trim() || "Created from uploaded PDF";
  const revision = (formData.get("revision") as string | null)?.trim() || "Rev 01";
  const publishParam = formData.get("publish");
  const shouldPublish = publishParam === null || publishParam === "true" || publishParam === "1";
  const applicableCompaniesRaw = (formData.get("applicableCompanies") as string | null)?.trim();
  const applicableItemsRaw = (formData.get("applicableItems") as string | null)?.trim();
  const applicableCompanies = applicableCompaniesRaw
    ? applicableCompaniesRaw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    : ["ALL"];
  const applicableItems = applicableItemsRaw
    ? applicableItemsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : ["*"];

  if (!file) {
    throw Errors.validation("A PDF file is required.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);

  // Validate PDF and inspect pages
  let pageCount = 1;
  let widthPt = 595.56;
  let heightPt = 842.04;

  try {
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    pageCount = pdfDoc.getPageCount();
    if (pageCount > 0) {
      const p1 = pdfDoc.getPage(0).getSize();
      widthPt = p1.width;
      heightPt = p1.height;
    }
  } catch {
    throw Errors.validation("Failed to parse PDF. Please ensure the file is a valid, unencrypted PDF.");
  }

  // Upload asset to storage and DB
  const asset = await uploadAsset({
    kind: "background",
    fileName: file.name,
    mimeType: "application/pdf",
    bytes,
    userId: session.user.id,
  });

  // Standard CMR field layout on top of the uploaded (pre-printed) form. One page per copy:
  // a 4-page PDF maps page n → copy n, a 1-page PDF is reused for all 4 copies.
  const seed = buildCmrSeed(asset.id, name);
  const templateJson = parseTemplate({
    ...seed,
    revision,
    page: { ...seed.page, width: widthPt, height: heightPt },
    pages: seed.pages.map((pg, i) => ({
      ...pg,
      background: pg.background ? { ...pg.background, assetId: asset.id, pageIndex: Math.min(i, pageCount - 1) } : pg.background,
    })),
  });

  // Create template in database
  const created = await createTemplate({
    name,
    description,
    templateType: "CMR",
    applicableCompanies,
    applicableItems,
    userId: session.user.id,
    templateJson,
  });

  const sb = supabaseAdmin();
  await sb
    .from("cmr_template_versions")
    .update({ background_asset_id: asset.id, revision })
    .eq("id", created.version.id);

  let finalVersion = created.version;
  let activeVersionId: string | null = null;

  if (shouldPublish) {
    finalVersion = await publishVersion(created.template.id, created.version.id, session.user.id);
    activeVersionId = finalVersion.id;
  }

  await audit({
    entityType: "template",
    entityId: created.template.id,
    action: "CREATED",
    user: session.user,
    details: { source: "uploaded_pdf", fileName: file.name, pageCount },
  });

  return json({
    ok: true,
    template: {
      ...created.template,
      active_version_id: activeVersionId,
      active_version_number: finalVersion.version_number,
    },
    version: finalVersion,
    asset,
  }, { status: 201 });
});
