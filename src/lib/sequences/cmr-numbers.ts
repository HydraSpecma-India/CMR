import "server-only";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { getActiveConfig, invalidateConfigCache } from "@/lib/config";
import { logger } from "@/lib/logging/logger";

/**
 * Company-wise CMR numbering.
 *  • Every legal entity (dataAreaId) has its own counter per year and may have
 *    its own pattern.  Stored in cmr_app_settings (no schema change):
 *      cmr.numbering.<COMPANY>        → { pattern, resetYearly }
 *      cmr.seq.<COMPANY>.<yyyy|all>   → { last }
 *  • Tokens: {company} {yyyy} {yy} {MM} {seq:N}
 *  • Default pattern when a company has none: the global pattern, with "{company}-" inserted
 *    after the first segment if the global pattern has no {company} token (so two companies can
 *    never produce the same number).
 */

export interface CompanyNumbering {
  company: string;
  pattern: string;
  resetYearly: boolean;
  /** last number used in the current counter period */
  last: number;
  /** period key of the counter shown (yyyy or "all") */
  period: string;
  preview: string;
  custom: boolean;
}

const cfgKey = (company: string) => `cmr.numbering.${company}`;
const seqKey = (company: string, period: string) => `cmr.seq.${company}.${period}`;

export const normCompany = (c?: string | null) => (c || "DEFAULT").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "") || "DEFAULT";

function defaultPatternFor(globalPattern: string): string {
  const g = globalPattern || "CMR-{yyyy}-{seq:4}";
  if (g.includes("{company}")) return g;
  const i = g.indexOf("-");
  return i > 0 ? `${g.slice(0, i)}-{company}${g.slice(i)}` : `{company}-${g}`;
}

export function formatCmrNumber(pattern: string, company: string, n: number, d = new Date()): string {
  const yyyy = String(d.getFullYear());
  return pattern
    .replace(/\{company\}/g, company)
    .replace(/\{yyyy\}/g, yyyy)
    .replace(/\{yy\}/g, yyyy.slice(2))
    .replace(/\{MM\}/g, String(d.getMonth() + 1).padStart(2, "0"))
    .replace(/\{seq(?::(\d+))?\}/g, (_m, len) => String(n).padStart(Number(len || 1), "0"));
}

async function readSetting<T>(key: string): Promise<{ value: T | null; updatedAt: string | null }> {
  const { data } = await supabaseAdmin().from("cmr_app_settings").select("value, updated_at").eq("key", key).maybeSingle();
  return { value: (data?.value as T) ?? null, updatedAt: (data?.updated_at as string) ?? null };
}

async function companyConfig(company: string) {
  const cfg = await getActiveConfig();
  const { value } = await readSetting<{ pattern?: string; resetYearly?: boolean }>(cfgKey(company));
  const pattern = value?.pattern?.trim() || defaultPatternFor(cfg.app.numberFormat);
  const resetYearly = value?.resetYearly ?? (pattern.includes("{yyyy}") || pattern.includes("{yy}"));
  return { pattern, resetYearly, custom: Boolean(value?.pattern?.trim()) };
}

/**
 * Reserve the next number for a company. Uses optimistic concurrency on updated_at so two
 * users issuing CMRs at the same moment never get the same number, and skips numbers that
 * already exist on a CMR (e.g. after changing the pattern or starting number).
 */
export async function reserveCompanyCmrNumber(companyRaw?: string | null): Promise<string> {
  const company = normCompany(companyRaw);
  const { pattern, resetYearly } = await companyConfig(company);
  const period = resetYearly ? String(new Date().getFullYear()) : "all";
  const key = seqKey(company, period);
  const db = supabaseAdmin();

  for (let attempt = 0; attempt < 25; attempt++) {
    const { value, updatedAt } = await readSetting<{ last: number }>(key);
    let next = (value?.last ?? 0) + 1;

    // skip numbers that are already used
    for (let guard = 0; guard < 50; guard++) {
      const candidate = formatCmrNumber(pattern, company, next);
      const { data: used } = await db.from("cmr_documents").select("id").eq("cmr_number", candidate).maybeSingle();
      if (!used) break;
      next++;
    }

    const now = new Date().toISOString();
    if (!updatedAt) {
      const { error } = await db.from("cmr_app_settings").insert({ key, value: { last: next }, description: `CMR counter ${company} ${period}`, updated_at: now });
      if (!error) return formatCmrNumber(pattern, company, next);
    } else {
      const { data, error } = await db
        .from("cmr_app_settings")
        .update({ value: { last: next }, updated_at: now })
        .eq("key", key)
        .eq("updated_at", updatedAt)
        .select("key");
      if (!error && data && data.length) {
        invalidateConfigCache();
        return formatCmrNumber(pattern, company, next);
      }
    }
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 120)); // somebody else took it – retry
  }
  logger.error("CMR number reservation contention", { company });
  throw new Error("Could not reserve a CMR number – please try again.");
}

/** Numbering overview for the admin page. */
export async function listCompanyNumbering(companies: string[]): Promise<CompanyNumbering[]> {
  const { data } = await supabaseAdmin().from("cmr_app_settings").select("key, value").or("key.like.cmr.numbering.%,key.like.cmr.seq.%");
  const rows = data ?? [];
  const known = new Set(companies.map(normCompany));
  for (const r of rows) {
    const m = String(r.key).match(/^cmr\.(?:numbering|seq)\.([A-Z0-9_]+)/);
    if (m) known.add(m[1]);
  }
  const year = String(new Date().getFullYear());
  const out: CompanyNumbering[] = [];
  for (const company of [...known].sort()) {
    const { pattern, resetYearly, custom } = await companyConfig(company);
    const period = resetYearly ? year : "all";
    const last = Number((rows.find((r) => r.key === seqKey(company, period))?.value as { last?: number } | undefined)?.last ?? 0);
    out.push({ company, pattern, resetYearly, last, period, custom, preview: formatCmrNumber(pattern, company, last + 1) });
  }
  return out;
}

/** Admin: set a company's pattern and/or the next number to issue. */
export async function saveCompanyNumbering(input: { company: string; pattern?: string; resetYearly?: boolean; nextNumber?: number }, userId?: string) {
  const company = normCompany(input.company);
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const uid = userId && /^[0-9a-f-]{36}$/i.test(userId) ? userId : null;
  if (input.pattern !== undefined || input.resetYearly !== undefined) {
    const current = await readSetting<{ pattern?: string; resetYearly?: boolean }>(cfgKey(company));
    const value = {
      pattern: input.pattern !== undefined ? input.pattern.trim() : current.value?.pattern,
      resetYearly: input.resetYearly ?? current.value?.resetYearly,
    };
    const { error } = await db.from("cmr_app_settings").upsert({ key: cfgKey(company), value, description: `CMR number pattern for ${company}`, updated_by: uid, updated_at: now });
    if (error) throw error;
  }
  if (input.nextNumber !== undefined) {
    const { resetYearly } = await companyConfig(company);
    const period = resetYearly ? String(new Date().getFullYear()) : "all";
    const { error } = await db
      .from("cmr_app_settings")
      .upsert({ key: seqKey(company, period), value: { last: Math.max(0, Math.floor(input.nextNumber) - 1) }, description: `CMR counter ${company} ${period}`, updated_by: uid, updated_at: now });
    if (error) throw error;
  }
  invalidateConfigCache();
}
