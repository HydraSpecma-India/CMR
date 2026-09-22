import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireCapability, requireSession, assertCompanyAllowed, allowedCompanies } from "@/lib/auth/guards";
import { getPackingSlipPrefill } from "@/lib/integrations/d365/packing-slips";
import {
  createCmrDocument, findActiveCmrForPackingSlip, listCmrDocuments, logProcessStep, saveDocumentValues,
} from "@/lib/db/repositories/cmr";
import { resolveCmrTemplate } from "@/lib/cmr/template-resolve";
import { renderAndStore } from "@/lib/cmr/issue";
import { GoodsLineSchema, ValuesSchema, SignatureSchema, CompanySchema } from "@/lib/cmr/schemas";
import { REQUIRED_FIELDS, labelFor } from "@/lib/cmr/layout";
import { getActiveConfig } from "@/lib/config";
import { audit } from "@/lib/audit/audit";
import { Errors } from "@/lib/errors";

const CreateSchema = z.object({
  company: CompanySchema,
  packingSlipId: z.string().trim().min(1).max(40),
  salesOrder: z.string().max(40).optional(),
  templateId: z.string().uuid().optional(),
  values: ValuesSchema,
  sources: z.record(z.string(), z.string()).default({}),
  goods: z.array(GoodsLineSchema).min(1, "Add at least one goods line (boxes 6–12)").max(200),
  senderSignature: SignatureSchema,
  carrierSignature: SignatureSchema,
});

export const GET = route(async (req) => {
  const session = await requireSession();
  await requireCapability("viewCmr");
  const sp = req.nextUrl.searchParams;
  const int = (k: string, d: number) => {
    const n = Number.parseInt(sp.get(k) || "", 10);
    return Number.isFinite(n) ? n : d;
  };
  const limit = Math.min(100, Math.max(1, int("limit", 50)));
  const offset = Math.max(0, int("offset", 0));
  const iso = (v: string | null) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined);
  const docs = await listCmrDocuments({
    query: (sp.get("q") || "").slice(0, 60),
    company: sp.get("company") || undefined,
    status: sp.get("status") || undefined,
    from: iso(sp.get("from")),
    to: iso(sp.get("to")),
    limit,
    offset,
    companies: allowedCompanies(session) ?? undefined,
  });
  return json({ ok: true, documents: docs, hasMore: docs.length === limit });
});

/** POST /api/cmr – issue the CMR for one packing slip (reserves the number, renders the 4 copies, stores the PDF). */
export const POST = route(async (req) => {
  const session = await requireCapability("createCmr");
  const body = CreateSchema.parse(await req.json());
  const company = body.company.toUpperCase();
  assertCompanyAllowed(session, company);
  const cfg = await getActiveConfig();

  if (cfg.app.oneCmrPerPackingSlip) {
    const existing = await findActiveCmrForPackingSlip(company, body.packingSlipId);
    if (existing) {
      throw Errors.conflict(
        `CMR ${existing.cmr_number ?? ""} has already been issued for packing slip ${body.packingSlipId}. Cancel it first if the CMR must be re-issued.`,
      );
    }
  }

  // D365 stays the source of truth: the packing slip must exist; its raw records are stored for traceability.
  const prefill = await getPackingSlipPrefill({ company, packingSlipId: body.packingSlipId, salesOrder: body.salesOrder, userName: session.user.name || session.user.email });
  if (!prefill) throw Errors.notFound(`Packing slip ${body.packingSlipId} in ${company}`);

  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.values)) values[k] = String(v ?? "").trim();
  const missing = REQUIRED_FIELDS.filter((f) => !values[f]);
  if (!body.goods.some((g) => g.nature.trim())) missing.push("Goods description (box 9)" as never);
  if (!body.goods.some((g) => Number(String(g.grossWeight).replace(",", ".")) > 0)) missing.push("Gross weight (box 11)" as never);
  if (missing.length) {
    throw Errors.validation(`Required CMR contents missing: ${missing.map((m) => labelFor(m)).join(", ")}`, { missing });
  }
  if (cfg.app.signatureRequired && !body.senderSignature) throw Errors.validation("The sender's signature (box 22) is required.");

  const template = await resolveCmrTemplate(company, body.templateId);
  if (body.senderSignature) values.SenderSignature = body.senderSignature;
  if (body.carrierSignature) values.CarrierSignature = body.carrierSignature;

  const doc = await createCmrDocument({
    company,
    packingSlipId: prefill.packingSlip.packingSlipId,
    salesOrder: prefill.packingSlip.salesOrder,
    customerAccount: prefill.packingSlip.customerAccount,
    templateId: template?.templateId,
    templateVersionId: template?.templateVersionId,
    templateVersionNumber: template?.versionNumber,
    values: { ...values, CustomerRef: prefill.packingSlip.customerRef || "" },
    goods: body.goods,
    context: { ...prefill.context, customerRef: prefill.packingSlip.customerRef, warnings: prefill.warnings },
    dataMode: prefill.mode,
    incoterms: prefill.packingSlip.deliveryTerms,
    userId: session.user.id,
  });

  await logProcessStep(doc.id, "D365_FETCH", "OK", { mode: prefill.mode, packingSlip: prefill.packingSlip.packingSlipId, lines: prefill.goods.length });
  await logProcessStep(doc.id, "VALIDATE", "OK", { goodsLines: body.goods.length });

  const sources: Record<string, string> = { ...body.sources };
  for (const [k, v] of Object.entries(values)) if (!sources[k]) sources[k] = prefill.values[k] === v ? prefill.sources[k] || "MANUAL" : "MANUAL";
  await saveDocumentValues(
    doc.id,
    Object.fromEntries(Object.entries(values).filter(([k]) => !k.endsWith("Signature"))),
    sources,
  ).catch(() => undefined);

  const result = await renderAndStore(doc, { issuedBy: session.user.name || session.user.email });

  await audit({
    entityType: "cmr_document",
    entityId: doc.id,
    action: "GENERATED",
    user: { id: session.user.id, email: session.user.email },
    cmrNumber: doc.cmr_number ?? undefined,
    details: { company, packingSlip: doc.packing_slip_id, salesOrder: doc.sales_order, status: result.status, mode: prefill.mode, template: template?.name ?? "built-in" },
  });

  return json({ ok: true, id: doc.id, cmrNumber: doc.cmr_number, status: result.status }, { status: 201 });
});
