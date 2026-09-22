import "server-only";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { logger } from "@/lib/logging/logger";

export interface ResolvedTemplate {
  templateId: string;
  templateVersionId: string;
  versionNumber: number;
  name: string;
}

/**
 * Picks the CMR layout for a company: an active template whose published version is set and whose
 * applicable companies contain the company (a company-specific template wins over "ALL").
 * Returns null when none exists – the renderer then uses the built-in standard CMR form.
 */
export async function resolveCmrTemplate(company: string, templateId?: string | null): Promise<ResolvedTemplate | null> {
  try {
    const sb = supabaseAdmin();
    let q = sb
      .from("cmr_templates")
      .select("id,name,active_version_id,applicable_companies,updated_at")
      .eq("status", "active")
      .not("active_version_id", "is", null)
      .order("updated_at", { ascending: false });
    if (templateId) q = q.eq("id", templateId);
    const { data, error } = await q;
    if (error) throw error;
    const c = company.trim().toUpperCase();
    const rows = (data || []) as Array<{ id: string; name: string; active_version_id: string; applicable_companies: string[] | null }>;
    const comps = (r: (typeof rows)[number]) => (r.applicable_companies?.length ? r.applicable_companies : ["ALL"]).map((x) => x.toUpperCase());
    const chosen = rows.find((r) => comps(r).includes(c)) ?? rows.find((r) => comps(r).includes("ALL")) ?? (templateId ? rows[0] : undefined);
    if (!chosen) return null;
    const { data: ver } = await sb
      .from("cmr_template_versions")
      .select("id,version_number,status")
      .eq("id", chosen.active_version_id)
      .maybeSingle();
    if (!ver || ver.status !== "published") return null;
    return { templateId: chosen.id, templateVersionId: ver.id as string, versionNumber: ver.version_number as number, name: chosen.name };
  } catch (e) {
    logger.warn("template resolution failed – using built-in CMR form", { error: (e as Error).message });
    return null;
  }
}
