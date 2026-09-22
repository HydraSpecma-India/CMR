import { parseTemplate, type TemplateJson, type TemplateElement } from "./schema";
import { ALL_SLOTS, CMR_COPIES } from "@/lib/cmr/layout";

/**
 * Seed template: the standard 24-box CMR with one field element per box on each of the
 * four copies. Every element is an ordinary template element – the admin can move,
 * restyle or delete it in the designer, or swap the background for a scanned form.
 */
export function buildCmrSeed(backgroundAssetId: string | null, name = "Standard CMR consignment note"): TemplateJson {
  const pages = CMR_COPIES.map((copy, pageIndex) => {
    const elements: TemplateElement[] = ALL_SLOTS().map((s) => {
      const id = `p${pageIndex + 1}-${s.field}`;
      if (s.kind === "checkbox") {
        return { id, type: "checkbox", fieldName: s.field, x: s.x, y: s.y, width: s.w, height: s.h, binding: {} } as unknown as TemplateElement;
      }
      if (s.kind === "signature") {
        return { id, type: "signature", fieldName: s.field, x: s.x, y: s.y, width: s.w, height: s.h, binding: {} } as unknown as TemplateElement;
      }
      return {
        id,
        type: "field",
        fieldName: s.field,
        x: s.x,
        y: s.y,
        width: s.w,
        height: s.h,
        binding: {},
        style: {
          fontFamily: "Helvetica",
          fontSize: s.fontSize ?? 9,
          bold: Boolean(s.bold),
          align: s.align ?? "left",
          valign: s.multiline ? "top" : "middle",
          padding: 1,
          wrap: Boolean(s.multiline),
          overflow: "shrink",
          lineHeight: 1.15,
        },
      } as unknown as TemplateElement;
    });
    return {
      id: `page-copy-${copy.no}`,
      name: `${copy.no} – ${copy.en}`,
      background: backgroundAssetId ? { assetId: backgroundAssetId, pageIndex, opacity: 1 } : null,
      elements,
    };
  });

  return parseTemplate({
    schemaVersion: 1,
    templateName: name,
    templateType: "CMR",
    version: 1,
    revision: "UNECE 1956",
    page: { size: "A4", orientation: "portrait", width: 595.28, height: 841.89 },
    settings: { defaultFont: "Helvetica", signatureRequired: true, allowDateOverride: true, fileNamePattern: "{CMRNumber}.pdf" },
    fonts: [],
    pages,
  });
}
