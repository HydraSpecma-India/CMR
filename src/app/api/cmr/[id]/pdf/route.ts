import { route } from "@/lib/api/handler";
import { requireCapability, assertCompanyAllowed } from "@/lib/auth/guards";
import { getCmrDocumentById, getGeneratedPdfBytes } from "@/lib/db/repositories/cmr";
import { renderCmrPdf } from "@/lib/render/cmr-renderer";
import { splitSignatures } from "@/lib/cmr/issue";
import { goodsToValues } from "@/lib/cmr/goods";
import { Errors } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";

/**
 * GET /api/cmr/{id}/pdf – the issued 4-copy PDF. `?copy=1..4` returns a single copy (re-rendered from
 * the stored values with the same template version). `?download=1` forces a download.
 */
export const GET = route<{ id: string }>(async (req, { params }) => {
  const session = await requireCapability("viewCmr");
  const found = await getCmrDocumentById(params.id);
  if (!found) throw Errors.notFound("CMR");
  const { doc } = found;
  assertCompanyAllowed(session, doc.company);

  const copy = Number(req.nextUrl.searchParams.get("copy") || 0);
  let bytes: Uint8Array | null = null;
  if (!copy && doc.generated_pdf_path) {
    try {
      bytes = await getGeneratedPdfBytes(doc.generated_pdf_path);
    } catch (e) {
      logger.warn("stored CMR PDF not readable – re-rendering", { id: doc.id, error: (e as Error).message });
    }
  }
  if (!bytes) {
    const { printable, signatures } = splitSignatures(doc.form_values_json);
    bytes = await renderCmrPdf({
      templateVersionId: doc.template_version_id,
      values: { ...printable, ...goodsToValues(doc.goods_json || []), CMRNumber: doc.cmr_number || "" },
      goods: doc.goods_json || [],
      signatures,
      isDraft: doc.status === "CANCELLED",
      pages: copy >= 1 && copy <= 4 ? [copy] : undefined,
    });
  }
  const name = `${doc.cmr_number || doc.id}${copy ? `-copy${copy}` : ""}.pdf`;
  const disposition = req.nextUrl.searchParams.get("download") ? "attachment" : "inline";
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `${disposition}; filename="${name}"`, "Cache-Control": "private, no-store" },
  });
});
