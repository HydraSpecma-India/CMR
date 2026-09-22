import "server-only";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { Errors } from "@/lib/errors";
import { parseTemplate, type TemplateJson } from "@/lib/template/schema";
import { emptyTemplate } from "@/lib/template/defaults";

export interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  template_type: string;
  status: "active" | "archived";
  active_version_id: string | null;
  applicable_companies?: string[];
  applicable_items?: string[];
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateVersionRow {
  id: string;
  template_id: string;
  version_number: number;
  revision: string | null;
  status: "draft" | "published" | "deprecated" | "deleted";
  template_json: TemplateJson;
  background_asset_id: string | null;
  change_note: string | null;
  published_at: string | null;
  published_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type TemplateVersionSummary = Omit<TemplateVersionRow, "template_json">;

const VERSION_SUMMARY_COLS =
  "id, template_id, version_number, revision, status, background_asset_id, change_note, published_at, published_by, created_by, created_at, updated_at";

const uid = (id?: string | null) => (id && /^[0-9a-f-]{36}$/i.test(id) ? id : null);

let cachedTemplates: (TemplateRow & { versions: TemplateVersionSummary[] })[] | null = null;
let lastTemplatesFetch = 0;
const TEMPLATES_CACHE_TTL = 60_000; // 60-second cache

export function invalidateTemplatesCache(): void {
  cachedTemplates = null;
  lastTemplatesFetch = 0;
}

export async function listTemplates(force = false): Promise<(TemplateRow & { versions: TemplateVersionSummary[] })[]> {
  const now = Date.now();
  if (!force && cachedTemplates && now - lastTemplatesFetch < TEMPLATES_CACHE_TTL) {
    return cachedTemplates;
  }

  const db = supabaseAdmin();
  const [tRes, vRes] = await Promise.all([
    db.from("cmr_templates").select("*").order("updated_at", { ascending: false }),
    db
      .from("cmr_template_versions")
      .select(VERSION_SUMMARY_COLS)
      .neq("status", "deleted")
      .order("version_number", { ascending: false }),
  ]);

  if (tRes.error) throw tRes.error;
  if (vRes.error) throw vRes.error;

  const result = (tRes.data as TemplateRow[]).map((t) => ({
    ...t,
    versions: (vRes.data as TemplateVersionSummary[]).filter((v) => v.template_id === t.id),
  }));

  cachedTemplates = result;
  lastTemplatesFetch = now;
  return result;
}

export async function getTemplate(id: string): Promise<(TemplateRow & { versions: TemplateVersionSummary[] }) | null> {
  const db = supabaseAdmin();
  const { data: t, error } = await db.from("cmr_templates").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!t) return null;
  const { data: versions, error: e2 } = await db
    .from("cmr_template_versions")
    .select(VERSION_SUMMARY_COLS)
    .eq("template_id", id)
    .order("version_number", { ascending: false });
  if (e2) throw e2;
  return { ...(t as TemplateRow), versions: versions as TemplateVersionSummary[] };
}

export async function createTemplate(input: {
  name: string;
  description?: string;
  templateType: string;
  applicableCompanies?: string[];
  applicableItems?: string[];
  userId?: string;
  templateJson?: TemplateJson;
}): Promise<{ template: TemplateRow; version: TemplateVersionRow }> {
  const db = supabaseAdmin();
  const { data: t, error } = await db
    .from("cmr_templates")
    .insert({
      name: input.name,
      description: input.description ?? null,
      template_type: input.templateType,
      applicable_companies: input.applicableCompanies && input.applicableCompanies.length > 0 ? input.applicableCompanies : ["ALL"],
      applicable_items: input.applicableItems && input.applicableItems.length > 0 ? input.applicableItems : ["*"],
      created_by: uid(input.userId),
      updated_by: uid(input.userId),
    })
    .select("*")
    .single();
  if (error) throw error;

  const json = parseTemplate({
    ...(input.templateJson ?? emptyTemplate(input.name, input.templateType)),
    templateName: input.name,
    templateType: input.templateType,
    version: 1,
  });
  const { data: v, error: e2 } = await db
    .from("cmr_template_versions")
    .insert({
      template_id: t.id,
      version_number: 1,
      revision: json.revision ?? "Rev 01",
      status: "draft",
      template_json: json,
      created_by: uid(input.userId),
    })
    .select("*")
    .single();
  if (e2) throw e2;
  invalidateTemplatesCache();
  return { template: t as TemplateRow, version: v as TemplateVersionRow };
}

export async function updateTemplate(
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    templateType?: string;
    status?: "active" | "archived";
    applicableCompanies?: string[];
    applicableItems?: string[];
  },
  userId?: string,
): Promise<TemplateRow> {
  const { data, error } = await supabaseAdmin()
    .from("cmr_templates")
    .update({
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.templateType !== undefined && { template_type: patch.templateType }),
      ...(patch.status !== undefined && { status: patch.status }),
      ...(patch.applicableCompanies !== undefined && { applicable_companies: patch.applicableCompanies }),
      ...(patch.applicableItems !== undefined && { applicable_items: patch.applicableItems }),
      updated_by: uid(userId),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  invalidateTemplatesCache();
  return data as TemplateRow;
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: tpl } = await db.from("cmr_templates").select("status").eq("id", id).maybeSingle();
  if (!tpl) throw Errors.notFound("Template");
  // Issued CMRs keep a permanent link to the template version they were rendered from.
  const { count: docs } = await db.from("cmr_documents").select("id", { count: "exact", head: true }).eq("template_id", id);
  if ((docs ?? 0) > 0) {
    throw Errors.conflict(`${docs} CMR document(s) were issued from this template, so it must be kept for audit. It stays archived and hidden from New CMR.`);
  }
  // A live template must be archived (deactivated) before it can be removed.
  const { count } = await db.from("cmr_template_versions").select("id", { count: "exact", head: true }).eq("template_id", id).eq("status", "published");
  if (tpl.status !== "archived" && (count ?? 0) > 0) {
    throw Errors.conflict("This template is published. Archive it first, then delete it.");
  }
  const { error } = await db.from("cmr_templates").delete().eq("id", id);
  if (error) throw error;
  invalidateTemplatesCache();
}

export async function getVersion(templateId: string, versionId: string): Promise<TemplateVersionRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("cmr_template_versions")
    .select("*")
    .eq("id", versionId)
    .eq("template_id", templateId)
    .maybeSingle();
  if (error) throw error;
  return (data as TemplateVersionRow) ?? null;
}

export async function getActiveVersion(templateId: string): Promise<TemplateVersionRow | null> {
  const db = supabaseAdmin();
  const { data: t } = await db.from("cmr_templates").select("active_version_id").eq("id", templateId).maybeSingle();
  if (!t?.active_version_id) return null;
  return getVersion(templateId, t.active_version_id);
}

export async function saveDraft(
  templateId: string,
  versionId: string,
  json: unknown,
  opts: { revision?: string; changeNote?: string; backgroundAssetId?: string | null },
): Promise<TemplateVersionRow> {
  const existing = await getVersion(templateId, versionId);
  if (!existing) throw Errors.notFound("Template version");
  if (existing.status !== "draft") throw Errors.conflict("Only draft versions can be edited. Create a new version.");
  const parsed = parseTemplate({ ...(json as object), version: existing.version_number });
  const { data, error } = await supabaseAdmin()
    .from("cmr_template_versions")
    .update({
      template_json: parsed,
      ...(opts.revision !== undefined && { revision: opts.revision }),
      ...(opts.changeNote !== undefined && { change_note: opts.changeNote }),
      ...(opts.backgroundAssetId !== undefined && { background_asset_id: opts.backgroundAssetId }),
    })
    .eq("id", versionId)
    .select("*")
    .single();
  if (error) throw error;
  invalidateTemplatesCache();
  return data as TemplateVersionRow;
}

export async function createVersion(templateId: string, fromVersionId: string | undefined, userId?: string, changeNote?: string): Promise<TemplateVersionRow> {
  const db = supabaseAdmin();
  const template = await getTemplate(templateId);
  if (!template) throw Errors.notFound("Template");
  const source = fromVersionId
    ? await getVersion(templateId, fromVersionId)
    : (await getActiveVersion(templateId)) ??
      (template.versions[0] ? await getVersion(templateId, template.versions[0].id) : null);
  const next = (template.versions.reduce((m, v) => Math.max(m, v.version_number), 0) || 0) + 1;
  const json = parseTemplate({
    ...(source?.template_json ?? emptyTemplate(template.name, template.template_type)),
    version: next,
    revision: `Rev ${String(next).padStart(2, "0")}`,
  });
  const { data, error } = await db
    .from("cmr_template_versions")
    .insert({
      template_id: templateId,
      version_number: next,
      revision: json.revision,
      status: "draft",
      template_json: json,
      background_asset_id: source?.background_asset_id ?? null,
      change_note: changeNote ?? (source ? `Created from version ${source.version_number}` : null),
      created_by: uid(userId),
    })
    .select("*")
    .single();
  if (error) throw error;
  invalidateTemplatesCache();
  return data as TemplateVersionRow;
}

export async function publishVersion(templateId: string, versionId: string, userId?: string): Promise<TemplateVersionRow> {
  const db = supabaseAdmin();
  const v = await getVersion(templateId, versionId);
  if (!v) throw Errors.notFound("Template version");
  if (v.status !== "draft") throw Errors.conflict("Only draft versions can be published.");
  parseTemplate(v.template_json); // final validation
  // deprecate the currently published version(s)
  const { error: e1 } = await db.from("cmr_template_versions").update({ status: "deprecated" }).eq("template_id", templateId).eq("status", "published");
  if (e1) throw e1;
  const { data, error } = await db
    .from("cmr_template_versions")
    .update({ status: "published", published_at: new Date().toISOString(), published_by: uid(userId) })
    .eq("id", versionId)
    .select("*")
    .single();
  if (error) throw error;
  const { error: e2 } = await db.from("cmr_templates").update({ active_version_id: versionId, updated_by: uid(userId) }).eq("id", templateId);
  if (e2) throw e2;
  invalidateTemplatesCache();
  return data as TemplateVersionRow;
}

export async function deactivateVersion(templateId: string, versionId: string, userId?: string): Promise<void> {
  const db = supabaseAdmin();
  const v = await getVersion(templateId, versionId);
  if (!v) throw Errors.notFound("Template version");
  if (v.status !== "published") throw Errors.conflict("Only the published version can be deactivated.");
  const { error } = await db.from("cmr_template_versions").update({ status: "deprecated" }).eq("id", versionId);
  if (error) throw error;
  await db.from("cmr_templates").update({ active_version_id: null, updated_by: uid(userId) }).eq("id", templateId);
  invalidateTemplatesCache();
}

export async function setVersionStatus(templateId: string, versionId: string, from: TemplateVersionRow["status"], to: TemplateVersionRow["status"]) {
  const v = await getVersion(templateId, versionId);
  if (!v) throw Errors.notFound("Template version");
  if (v.status !== from) throw Errors.conflict(`Version is not in '${from}' status.`);
  const { error } = await supabaseAdmin().from("cmr_template_versions").update({ status: to }).eq("id", versionId);
  if (error) throw error;
  invalidateTemplatesCache();
}

export async function duplicateTemplate(templateId: string, newName: string, userId?: string) {
  const template = await getTemplate(templateId);
  if (!template) throw Errors.notFound("Template");
  const source =
    (await getActiveVersion(templateId)) ??
    (template.versions.find((v) => v.status !== "deleted") ? await getVersion(templateId, template.versions.find((v) => v.status !== "deleted")!.id) : null);
  const json = source ? { ...source.template_json, templateName: newName } : undefined;
  const created = await createTemplate({
    name: newName,
    description: template.description ?? undefined,
    templateType: template.template_type,
    applicableCompanies: template.applicable_companies,
    applicableItems: template.applicable_items,
    userId,
    templateJson: json,
  });
  if (source?.background_asset_id) {
    await supabaseAdmin().from("cmr_template_versions").update({ background_asset_id: source.background_asset_id }).eq("id", created.version.id);
  }
  return created;
}
