import "server-only";
import { renderCmrPdf } from "@/lib/render/cmr-renderer";
import {
  logProcessStep, sha256, updateCmrDocument, uploadGeneratedPdf, type CmrDocumentRow,
} from "@/lib/db/repositories/cmr";
import { TeamsService } from "@/lib/integrations/teams/service";
import { getActiveConfig } from "@/lib/config";
import { logger } from "@/lib/logging/logger";
import { goodsToValues, goodsTotals, fmt } from "@/lib/cmr/goods";

export const SIGNATURE_FIELDS = ["SenderSignature", "CarrierSignature"] as const;

/** Splits stored form values into printable values and signature images. */
export function splitSignatures(values: Record<string, string>) {
  const printable: Record<string, string> = {};
  const signatures: Record<string, string> = {};
  for (const [k, v] of Object.entries(values || {})) {
    if ((SIGNATURE_FIELDS as readonly string[]).includes(k)) {
      if (v?.startsWith("data:image/")) signatures[k] = v;
    } else printable[k] = v;
  }
  return { printable, signatures };
}

/**
 * Renders the final 4-copy CMR for a stored document, uploads it and advances the status.
 * Used by "issue" and "retry". Never throws for storage / Teams problems – they are recorded
 * as process steps and in last_error so the user can retry.
 */
export async function renderAndStore(doc: CmrDocumentRow, opts: { issuedBy?: string; notifyTeams?: boolean } = {}) {
  const { printable, signatures } = splitSignatures(doc.form_values_json);
  const goods = doc.goods_json || [];
  const values: Record<string, string> = { ...printable, ...goodsToValues(goods), CMRNumber: doc.cmr_number || "" };

  const t0 = Date.now();
  let pdf: Uint8Array;
  try {
    pdf = await renderCmrPdf({ templateVersionId: doc.template_version_id, values, signatures, goods, isDraft: false });
  } catch (e) {
    await logProcessStep(doc.id, "RENDER", "FAILED", {}, (e as Error).message);
    await updateCmrDocument(doc.id, { last_error: `Render failed: ${(e as Error).message}` });
    throw e;
  }
  const hash = sha256(pdf);
  await logProcessStep(doc.id, "RENDER", "OK", { bytes: pdf.length, ms: Date.now() - t0, pages: "4 copies" });
  await updateCmrDocument(doc.id, { status: "PDF_GENERATED", pdf_sha256: hash, last_error: null });

  let storagePath: string | null = null;
  let status: CmrDocumentRow["status"] = "PDF_GENERATED";
  try {
    storagePath = await uploadGeneratedPdf(doc.company, doc.cmr_number || doc.id, pdf);
    await logProcessStep(doc.id, "SP_UPLOAD", "OK", { storagePath });
    status = "UPLOADED";
    await updateCmrDocument(doc.id, { status, generated_pdf_path: storagePath, last_error: null });
  } catch (e) {
    const msg = (e as Error).message;
    logger.error("CMR PDF upload failed", { cmr: doc.cmr_number, error: msg });
    await logProcessStep(doc.id, "SP_UPLOAD", "FAILED", {}, msg);
    status = "UPLOAD_FAILED";
    await updateCmrDocument(doc.id, { status, last_error: `Storage upload failed: ${msg}` });
  }

  const cfg = await getActiveConfig();
  if (opts.notifyTeams !== false && cfg.teams.enabled) {
    try {
      const t = goodsTotals(goods);
      const res = await TeamsService.sendCmrToTeams({
        cmrId: doc.id,
        cmrNumber: doc.cmr_number || doc.id,
        company: doc.company,
        packingSlipId: doc.packing_slip_id,
        salesOrder: doc.sales_order,
        consigneeName: values.ConsigneeName,
        deliveryPlace: values.DeliveryPlace,
        carrierName: values.CarrierName,
        vehicleRegistration: values.VehicleRegistration,
        takingOverDate: values.TakingOverDate,
        totalPackages: fmt(t.packages, 0),
        totalGrossWeight: fmt(t.weight),
        issuedBy: opts.issuedBy,
        pdfBytes: pdf,
        storagePath,
      });
      await logProcessStep(doc.id, "TEAMS_WEBHOOK", res.ok ? "OK" : "FAILED", { status: res.status, message: res.message });
    } catch (e) {
      await logProcessStep(doc.id, "TEAMS_WEBHOOK", "FAILED", {}, (e as Error).message);
    }
  }
  return { pdf, status, storagePath, hash };
}
