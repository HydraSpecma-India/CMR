import "server-only";
import { logger } from "@/lib/logging/logger";
import { getSetting } from "@/lib/db/repositories/settings";
import { CustomEntityListSchema, PER_LINE_BUILTIN, SETTING_KEY, isPerLine, type CustomEntity, type Relation } from "@/lib/cmr/custom-entities";
import { esc, odata, type Row } from "./odata";
import type { D365Config } from "./service";

/** The built-in records of one packing slip (see packing-slips.ts). */
export interface BaseRecords {
  header: Row;
  lines: Row[];
  salesOrder: Row | null;
  customer: Row | null;
  legalEntity: Row | null;
  warehouse: Row | null;
  products: Record<string, Row>;
  carrier: Row | null;
  invoice: Row | null;
}

export interface CustomRecords {
  /** header-level custom entities: key → record */
  header: Record<string, Row | null>;
  /** per-line custom entities: key → record per goods line (same index as lines) */
  perLine: Record<string, (Row | null)[]>;
  warnings: string[];
  /** OData filters that were used, per entity (for the test button) */
  trace: Record<string, { filter: string; found: boolean; error?: string }[]>;
}

export async function loadCustomEntityDefs(): Promise<CustomEntity[]> {
  try {
    const raw = await getSetting<unknown>(SETTING_KEY, []);
    const parsed = CustomEntityListSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn("custom D365 entities setting is invalid – ignored", { issues: parsed.error.issues.length });
      return [];
    }
    return parsed.data;
  } catch {
    return [];
  }
}

const str = (row: Row | null | undefined, field: string) => {
  const v = row?.[field];
  return v === undefined || v === null ? "" : String(v).trim();
};

function literal(rel: Relation, value: string): string {
  if (rel.valueType === "number") {
    if (!/^-?\d+(\.\d+)?$/.test(value)) throw new Error(`“${value}” is not a number (relation ${rel.field})`);
    return value;
  }
  if (rel.valueType === "enum") return `${rel.enumType}'${esc(value)}'`;
  return `'${esc(value)}'`;
}

/**
 * Loads every active custom entity for one packing slip, in list order (a custom entity may relate
 * to built-in records or to custom entities listed above it). Never throws – problems become warnings.
 */
export async function resolveCustomEntities(
  cfg: D365Config,
  company: string,
  base: BaseRecords,
  defs: CustomEntity[],
): Promise<CustomRecords> {
  const out: CustomRecords = { header: {}, perLine: {}, warnings: [], trace: {} };
  const active = defs.filter((d) => d.active);
  const itemOf = (i: number) => str(base.lines[i], "ItemId") || str(base.lines[i], "ItemNumber");

  const recordFor = (key: string, i: number | null): Row | null => {
    switch (key) {
      case "header":
        return base.header;
      case "salesOrder":
        return base.salesOrder;
      case "customer":
        return base.customer;
      case "legalEntity":
        return base.legalEntity;
      case "warehouse":
        return base.warehouse;
      case "carrier":
        return base.carrier;
      case "invoice":
        return base.invoice;
      case "line":
        return i === null ? null : base.lines[i] ?? null;
      case "product":
        return i === null ? null : base.products[itemOf(i)] ?? null;
      default:
        if (key in out.header) return out.header[key];
        if (key in out.perLine) return i === null ? null : out.perLine[key][i] ?? null;
        return null;
    }
  };

  const buildFilter = (def: CustomEntity, i: number | null): string => {
    const parts: string[] = [];
    if (def.companyFilter) parts.push(`dataAreaId eq '${esc(company.toLowerCase())}'`);
    for (const r of def.relations) {
      const value = r.kind === "value" ? (r.value ?? "").trim() : str(recordFor(r.parent!, i), r.parentField!);
      if (!value) throw new Error(`no value for ${r.kind === "value" ? r.field : `${r.parent}.${r.parentField}`}`);
      parts.push(`${r.field} eq ${literal(r, value)}`);
    }
    return parts.join(" and ");
  };

  const query = async (def: CustomEntity, filter: string) => {
    const rows = await odata(cfg, def.entity, { filter, top: 1, orderby: def.orderBy || undefined });
    return rows[0] ?? null;
  };

  for (const def of active) {
    const trace: CustomRecords["trace"][string] = (out.trace[def.key] = []);
    const perLine = isPerLine(def, active);
    if (!perLine) {
      let row: Row | null = null;
      try {
        const filter = buildFilter(def, null);
        try {
          row = await query(def, filter);
          trace.push({ filter, found: Boolean(row) });
        } catch (e) {
          trace.push({ filter, found: false, error: (e as Error).message });
          out.warnings.push(`${def.label} (${def.entity}): ${(e as Error).message.slice(0, 200)}`);
        }
      } catch (e) {
        trace.push({ filter: "", found: false, error: (e as Error).message });
      }
      out.header[def.key] = row;
      continue;
    }

    // per goods line – identical filters are queried once
    const cache = new Map<string, Promise<Row | null>>();
    const rows: (Row | null)[] = [];
    for (let i = 0; i < base.lines.length; i++) {
      let filter = "";
      try {
        filter = buildFilter(def, i);
      } catch (e) {
        trace.push({ filter: "", found: false, error: `line ${i + 1}: ${(e as Error).message}` });
        rows.push(null);
        continue;
      }
      if (!cache.has(filter)) {
        if (cache.size >= 60) {
          rows.push(null);
          continue;
        }
        cache.set(
          filter,
          query(def, filter).then(
            (r) => {
              trace.push({ filter, found: Boolean(r) });
              return r;
            },
            (e) => {
              trace.push({ filter, found: false, error: (e as Error).message });
              return null;
            },
          ),
        );
      }
      rows.push(await cache.get(filter)!);
    }
    const errs = trace.filter((t) => t.error && t.filter);
    if (errs.length) out.warnings.push(`${def.label} (${def.entity}): ${errs[0].error!.slice(0, 200)}`);
    out.perLine[def.key] = rows;
  }
  return out;
}

export { PER_LINE_BUILTIN };
