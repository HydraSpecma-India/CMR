import "server-only";
import { createHash } from "node:crypto";
import { supabaseAdmin, Buckets } from "@/lib/db/supabase-admin";
import { reserveCompanyCmrNumber, normCompany } from "@/lib/sequences/cmr-numbers";
import type { CmrGoodsLine } from "@/lib/cmr/types";
import { num } from "@/lib/cmr/goods";

export type CmrStatus = "DRAFT" | "PDF_GENERATED" | "UPLOAD_FAILED" | "UPLOADED" | "COMPLETED" | "CANCELLED";

export interface CmrDocumentRow {
  id: string;
  cmr_number: string | null;
  company: string;
  template_id: string | null;
  template_version_id: string | null;
  template_version_number: number | null;
  packing_slip_id: string;
  sales_order: string | null;
  customer_account: string | null;
  customer_ref: string | null;
  consignee_name: string | null;
  delivery_place: string | null;
  taking_over_date: string | null;
  carrier_name: string | null;
  vehicle_registration: string | null;
  incoterms: string | null;
  total_packages: number | null;
  total_gross_weight_kg: number | null;
  total_volume_m3: number | null;
  status: CmrStatus;
  form_values_json: Record<string, string>;
  goods_json: CmrGoodsLine[];
  d365_context_json: Record<string, unknown> | null;
  data_mode: "live" | "mock";
  generated_pdf_path: string | null;
  pdf_sha256: string | null;
  sharepoint_url: string | null;
  sharepoint_item_id: string | null;
  last_error: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_by: string | null;
  completed_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
}

export type CmrListRow = Omit<CmrDocumentRow, "form_values_json" | "goods_json" | "d365_context_json">;

export interface CmrProcessStepRow {
  id: string;
  cmr_document_id: string;
  step: "D365_FETCH" | "VALIDATE" | "RENDER" | "SP_UPLOAD" | "D365_UPDATE" | "TEAMS_WEBHOOK" | "CANCEL";
  status: "STARTED" | "OK" | "FAILED";
  attempt: number;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  error: string | null;
  details: Record<string, unknown> | null;
}

const LIST_COLS =
  "id,cmr_number,company,template_id,template_version_id,template_version_number,packing_slip_id,sales_order,customer_account,customer_ref,consignee_name,delivery_place,taking_over_date,carrier_name,vehicle_registration,incoterms,total_packages,total_gross_weight_kg,total_volume_m3,status,data_mode,generated_pdf_path,pdf_sha256,sharepoint_url,sharepoint_item_id,last_error,cancel_reason,created_by,created_at,updated_at,completed_by,completed_at,cancelled_by,cancelled_at";

const uuidOrNull = (v?: string | null) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const isoDateOrNull = (v?: string | null) => {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const eu = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(v.trim());
  if (eu) return `${eu[3]}-${eu[2].padStart(2, "0")}-${eu[1].padStart(2, "0")}`;
  return null;
};
/** Strip characters that would break a PostgREST `or=` filter. */
const safeLike = (s: string) => s.replace(/[%,()*\\]/g, " ").trim();

/** Returns the non-cancelled CMR for a packing slip, if any. */
export async function findActiveCmrForPackingSlip(company: string, packingSlipId: string) {
  const { data, error } = await supabaseAdmin()
    .from("cmr_documents")
    .select("id,cmr_number,status")
    .eq("company", normCompany(company))
    .eq("packing_slip_id", packingSlipId)
    .neq("status", "CANCELLED")
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; cmr_number: string | null; status: CmrStatus } | null;
}

/** Existing (non-cancelled) CMRs for many packing slips – used to badge search results. */
export async function mapCmrsForPackingSlips(company: string, ids: string[]) {
  const out = new Map<string, { id: string; cmr_number: string | null }>();
  if (!ids.length) return out;
  const { data, error } = await supabaseAdmin()
    .from("cmr_documents")
    .select("id,cmr_number,packing_slip_id")
    .eq("company", normCompany(company))
    .in("packing_slip_id", ids.slice(0, 200))
    .neq("status", "CANCELLED");
  if (error) throw error;
  for (const r of data || []) out.set(r.packing_slip_id as string, { id: r.id as string, cmr_number: r.cmr_number as string | null });
  return out;
}

export async function createCmrDocument(input: {
  company: string;
  packingSlipId: string;
  salesOrder?: string;
  customerAccount?: string;
  templateId?: string | null;
  templateVersionId?: string | null;
  templateVersionNumber?: number | null;
  values: Record<string, string>;
  goods: CmrGoodsLine[];
  context?: Record<string, unknown>;
  dataMode: "live" | "mock";
  incoterms?: string;
  userId?: string;
}): Promise<CmrDocumentRow> {
  const company = normCompany(input.company);
  const cmrNumber = await reserveCompanyCmrNumber(company);
  const v = input.values;
  const totals = {
    packages: input.goods.reduce((s, g) => s + num(g.packages), 0),
    weight: input.goods.reduce((s, g) => s + num(g.grossWeight), 0),
    volume: input.goods.reduce((s, g) => s + num(g.volume), 0),
  };
  const values = { ...v, CMRNumber: cmrNumber };

  const { data, error } = await supabaseAdmin()
    .from("cmr_documents")
    .insert({
      cmr_number: cmrNumber,
      company,
      template_id: uuidOrNull(input.templateId),
      template_version_id: uuidOrNull(input.templateVersionId),
      template_version_number: input.templateVersionNumber ?? null,
      packing_slip_id: input.packingSlipId,
      sales_order: input.salesOrder || null,
      customer_account: input.customerAccount || null,
      customer_ref: v.CustomerRef || (input.context?.customerRef as string) || null,
      consignee_name: v.ConsigneeName || null,
      delivery_place: v.DeliveryPlace || null,
      taking_over_date: isoDateOrNull(v.TakingOverDate),
      carrier_name: v.CarrierName || null,
      vehicle_registration: v.VehicleRegistration || null,
      incoterms: input.incoterms || null,
      total_packages: totals.packages || null,
      total_gross_weight_kg: totals.weight || null,
      total_volume_m3: totals.volume || null,
      status: "DRAFT",
      form_values_json: values,
      goods_json: input.goods,
      d365_context_json: input.context ?? {},
      data_mode: input.dataMode,
      created_by: uuidOrNull(input.userId),
    })
    .select()
    .single();
  if (error) throw error;
  return data as CmrDocumentRow;
}

export async function updateCmrDocument(id: string, patch: Partial<CmrDocumentRow>) {
  const { error } = await supabaseAdmin().from("cmr_documents").update(patch).eq("id", id);
  if (error) throw error;
}

/** Stores the resolved value of every form field (reporting / traceability). */
export async function saveDocumentValues(id: string, values: Record<string, string>, sources: Record<string, string>) {
  const rows = Object.entries(values)
    .filter(([, val]) => val !== undefined && val !== null && String(val) !== "")
    .map(([field, val]) => ({
      cmr_document_id: id,
      field_name: field,
      source_type: sources[field] || "MANUAL",
      value_text: String(val).slice(0, 4000),
    }));
  if (!rows.length) return;
  const { error } = await supabaseAdmin().from("cmr_document_values").upsert(rows, { onConflict: "cmr_document_id,field_name" });
  if (error) throw error;
}

export async function logProcessStep(
  cmrId: string,
  step: CmrProcessStepRow["step"],
  status: CmrProcessStepRow["status"],
  details?: Record<string, unknown>,
  error?: string,
): Promise<void> {
  await supabaseAdmin().from("cmr_process_steps").insert({
    cmr_document_id: cmrId,
    step,
    status,
    details: details || {},
    error: error || null,
    finished_at: status !== "STARTED" ? new Date().toISOString() : null,
  });
}

export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export async function uploadGeneratedPdf(company: string, cmrNumber: string, pdfBytes: Uint8Array): Promise<string> {
  const safe = cmrNumber.replace(/[^A-Za-z0-9._-]+/g, "_");
  const storagePath = `${normCompany(company)}/${new Date().getFullYear()}/${safe}.pdf`;
  const { error } = await supabaseAdmin().storage.from(Buckets.cmrGenerated).upload(storagePath, pdfBytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw error;
  return storagePath;
}

export async function getGeneratedPdfBytes(storagePath: string): Promise<Uint8Array> {
  const { data, error } = await supabaseAdmin().storage.from(Buckets.cmrGenerated).download(storagePath);
  if (error || !data) throw new Error(error?.message || "Failed to download PDF");
  return new Uint8Array(await data.arrayBuffer());
}

export async function listCmrDocuments(opts: {
  query?: string;
  company?: string;
  status?: string;
  limit?: number;
  offset?: number;
  from?: string;
  to?: string;
  /** restrict to these companies (user's allowed companies); empty = all */
  companies?: string[];
} = {}): Promise<CmrListRow[]> {
  let q = supabaseAdmin().from("cmr_documents").select(LIST_COLS).order("created_at", { ascending: false });
  if (opts.company) q = q.eq("company", normCompany(opts.company));
  if (opts.companies?.length) q = q.in("company", opts.companies.map(normCompany));
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.from) q = q.gte("created_at", opts.from);
  if (opts.to) q = q.lte("created_at", opts.to);
  const s = opts.query ? safeLike(opts.query) : "";
  if (s) {
    q = q.or(
      ["cmr_number", "packing_slip_id", "sales_order", "customer_account", "customer_ref", "consignee_name", "carrier_name", "vehicle_registration"]
        .map((c) => `${c}.ilike.%${s}%`)
        .join(","),
    );
  }
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  q = q.range(offset, offset + limit - 1);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as unknown as CmrListRow[];
}

export async function getCmrDocumentById(id: string): Promise<{ doc: CmrDocumentRow; steps: CmrProcessStepRow[] } | null> {
  const sb = supabaseAdmin();
  const { data: doc, error } = await sb.from("cmr_documents").select("*").eq("id", id).maybeSingle();
  if (error || !doc) return null;
  const { data: steps } = await sb.from("cmr_process_steps").select("*").eq("cmr_document_id", id).order("started_at", { ascending: true });
  return { doc: doc as CmrDocumentRow, steps: (steps || []) as CmrProcessStepRow[] };
}

/** Dashboard counters. */
export async function cmrStats(companies?: string[]) {
  const sb = supabaseAdmin();
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const base = () => {
    let q = sb.from("cmr_documents").select("id", { count: "exact", head: true });
    if (companies?.length) q = q.in("company", companies.map(normCompany));
    return q;
  };
  const [all, last30, cancelled, failed] = await Promise.all([
    base().neq("status", "CANCELLED"),
    base().neq("status", "CANCELLED").gte("created_at", since.toISOString()),
    base().eq("status", "CANCELLED"),
    base().eq("status", "UPLOAD_FAILED"),
  ]);
  return { issued: all.count ?? 0, last30: last30.count ?? 0, cancelled: cancelled.count ?? 0, failed: failed.count ?? 0 };
}
