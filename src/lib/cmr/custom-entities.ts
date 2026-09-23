/**
 * Admin-defined D365 entities ("custom sources") that are joined to the records of a packing slip
 * by relations the admin enters, e.g.
 *
 *   SalesOrderLines  where  SalesOrderNumber = Packing slip header.SalesId
 *                     and  LineNumber       = Packing slip line.LineNum
 *
 * Their properties can then be used in D365FO Field Mapping like the built-in records.
 * Stored in the setting "d365.customEntities". Client-safe (validation is shared by UI and API).
 */
import { z } from "zod";
import { MAPPING_SOURCES } from "./mapping-sources";

export const SETTING_KEY = "d365.customEntities";
export const MAX_CUSTOM_ENTITIES = 12;

const ident = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const RelationSchema = z.object({
  /** property of the custom entity */
  field: z.string().trim().regex(ident, "Use the OData property name (letters, digits, _)"),
  /** "record" = equals a property of another record; "value" = equals a fixed value */
  kind: z.enum(["record", "value"]).default("record"),
  /** source key of the other record (built-in key or custom key) */
  parent: z.string().trim().optional(),
  parentField: z.string().trim().optional(),
  value: z.string().max(200).optional(),
  /** how the value is written in the OData filter */
  valueType: z.enum(["text", "number", "enum"]).default("text"),
  /** OData enum type for valueType "enum", e.g. Microsoft.Dynamics.DataEntities.SalesStatus */
  enumType: z.string().trim().max(200).optional(),
});
export type Relation = z.infer<typeof RelationSchema>;

export const CustomEntitySchema = z.object({
  /** stable key used in mappings, e.g. "c_salesline" */
  key: z.string().trim().regex(/^c_[a-z0-9_]{1,40}$/, "Key must look like c_salesline"),
  label: z.string().trim().min(1).max(80),
  entity: z.string().trim().regex(ident, "OData entity (public collection) name, e.g. SalesOrderLines"),
  /** add dataAreaId = company to the filter (turn off for shared entities) */
  companyFilter: z.boolean().default(true),
  relations: z.array(RelationSchema).min(1, "Add at least one relation").max(6),
  /** optional $orderby when several records match, e.g. "InvoiceDate desc" */
  orderBy: z.string().trim().regex(/^[A-Za-z0-9_]+( (asc|desc))?$/i, "e.g. InvoiceDate desc").optional().or(z.literal("")),
  active: z.boolean().default(true),
});
export type CustomEntity = z.infer<typeof CustomEntitySchema>;

export const CustomEntityListSchema = z.array(CustomEntitySchema).max(MAX_CUSTOM_ENTITIES);

/** Built-in records that exist once per goods line. */
export const PER_LINE_BUILTIN = new Set(["line", "product"]);

/** A custom entity is per goods line when any relation points to a per-line record. */
export function isPerLine(ce: CustomEntity, all: CustomEntity[]): boolean {
  return ce.relations.some((r) => {
    if (r.kind !== "record" || !r.parent) return false;
    if (PER_LINE_BUILTIN.has(r.parent)) return true;
    const other = all.find((o) => o.key === r.parent);
    return other ? isPerLine(other, all.filter((o) => o.key !== ce.key)) : false;
  });
}

/** Validates the list: unique keys, parents exist and are defined earlier (no cycles). Returns error texts. */
export function validateCustomEntities(list: CustomEntity[]): string[] {
  const errors: string[] = [];
  const builtin = new Set(MAPPING_SOURCES.map((s) => s.key as string));
  const seen = new Set<string>();
  for (const ce of list) {
    if (seen.has(ce.key)) errors.push(`${ce.label}: key ${ce.key} is used twice.`);
    ce.relations.forEach((r, i) => {
      const n = `${ce.label} – relation ${i + 1}`;
      if (r.kind === "record") {
        if (!r.parent) errors.push(`${n}: choose the related record.`);
        else if (!builtin.has(r.parent) && !seen.has(r.parent))
          errors.push(`${n}: “${r.parent}” must be a built-in record or a custom entity listed above this one.`);
        if (!r.parentField || !ident.test(r.parentField)) errors.push(`${n}: enter the property of the related record.`);
      } else if (!r.value?.trim()) errors.push(`${n}: enter the fixed value.`);
      if (r.valueType === "enum" && !r.enumType?.trim()) errors.push(`${n}: enter the enum type (e.g. Microsoft.Dynamics.DataEntities.NoYes).`);
    });
    seen.add(ce.key);
  }
  return errors;
}

export const slugKey = (label: string) =>
  "c_" +
  (label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "entity");
