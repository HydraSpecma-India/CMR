import { z } from "zod";
import { route } from "@/lib/api/handler";
import { requireCapability, assertCompanyAllowed } from "@/lib/auth/guards";
import { renderCmrPdf } from "@/lib/render/cmr-renderer";
import { resolveCmrTemplate } from "@/lib/cmr/template-resolve";
import { goodsToValues } from "@/lib/cmr/goods";
import { GoodsLineSchema, ValuesSchema, SignatureSchema, CompanySchema } from "@/lib/cmr/schemas";

const PreviewSchema = z.object({
  company: CompanySchema,
  templateId: z.string().uuid().optional(),
  values: ValuesSchema,
  goods: z.array(GoodsLineSchema).max(200).default([]),
  senderSignature: SignatureSchema,
  carrierSignature: SignatureSchema,
  /** 1-based copy numbers; default: copy 1 only (fast preview) */
  pages: z.array(z.number().int().min(1).max(4)).max(4).optional(),
});

/** POST /api/cmr/preview – DRAFT-watermarked PDF, nothing is stored and no number is reserved. */
export const POST = route(async (req) => {
  const session = await requireCapability("createCmr");
  const body = PreviewSchema.parse(await req.json());
  assertCompanyAllowed(session, body.company);
  const template = await resolveCmrTemplate(body.company, body.templateId);
  const pdf = await renderCmrPdf({
    templateVersionId: template?.templateVersionId,
    values: { ...body.values, ...goodsToValues(body.goods), CMRNumber: body.values.CMRNumber || "(assigned on issue)" },
    goods: body.goods,
    signatures: { SenderSignature: body.senderSignature, CarrierSignature: body.carrierSignature },
    isDraft: true,
    pages: body.pages ?? [1],
  });
  return new Response(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="CMR-preview.pdf"', "Cache-Control": "no-store" },
  });
});
