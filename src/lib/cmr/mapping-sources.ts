/**
 * D365 records that are loaded for every packing slip and can be used in
 * Admin → D365FO Field Mapping. Client-safe.
 *
 * A mapping row stores the source key (e.g. "salesOrder") in `entity` and the OData property in
 * `property`. Rows saved with a real entity name (e.g. "SalesOrderHeadersV2") are resolved via
 * the configured entity names.
 */

export type MappingSourceKey =
  | "header"
  | "line"
  | "product"
  | "salesOrder"
  | "customer"
  | "legalEntity"
  | "warehouse"
  | "carrier"
  | "invoice";

export interface MappingSource {
  key: MappingSourceKey;
  label: string;
  /** name of the entity setting in config.d365 */
  configKey:
    | "packingSlipHeaderEntity"
    | "packingSlipLineEntity"
    | "productEntity"
    | "salesOrderEntity"
    | "customerEntity"
    | "legalEntityEntity"
    | "warehouseEntity"
    | "carrierEntity"
    | "invoiceEntity";
  /** per packing-slip line → only for goods columns (boxes 6–12) */
  perLine?: boolean;
}

export const MAPPING_SOURCES: MappingSource[] = [
  { key: "header", label: "Packing slip header", configKey: "packingSlipHeaderEntity" },
  { key: "salesOrder", label: "Sales order header", configKey: "salesOrderEntity" },
  { key: "customer", label: "Customer", configKey: "customerEntity" },
  { key: "legalEntity", label: "Legal entity (sender)", configKey: "legalEntityEntity" },
  { key: "warehouse", label: "Shipping warehouse", configKey: "warehouseEntity" },
  { key: "carrier", label: "Shipping carrier", configKey: "carrierEntity" },
  { key: "invoice", label: "Sales invoice", configKey: "invoiceEntity" },
  { key: "line", label: "Packing slip line (goods columns)", configKey: "packingSlipLineEntity", perLine: true },
  { key: "product", label: "Released product of the line (goods columns)", configKey: "productEntity", perLine: true },
];

export const TRANSFORMS: { value: string; label: string }[] = [
  { value: "none", label: "None (raw value)" },
  { value: "trim", label: "Trim whitespace" },
  { value: "uppercase", label: "Uppercase" },
  { value: "date_iso", label: "Date (YYYY-MM-DD)" },
  { value: "number", label: "Number" },
  { value: "multiply_qty", label: "× line quantity (weights / volumes)" },
];

/** Goods fields Goods{row}{Column} → column of a goods line. */
export const GOODS_FIELD_RE = /^Goods\d+(Marks|Packages|Packing|Nature|StatNo|GrossWeight|Volume)$/;
export const GOODS_COLUMN_PROP = {
  Marks: "marks",
  Packages: "packages",
  Packing: "packing",
  Nature: "nature",
  StatNo: "statNo",
  GrossWeight: "grossWeight",
  Volume: "volume",
} as const;

export function resolveSourceKey(entity: string, entityNames: Partial<Record<MappingSource["configKey"], string>>): MappingSourceKey | null {
  const e = (entity || "").trim();
  const byKey = MAPPING_SOURCES.find((s) => s.key.toLowerCase() === e.toLowerCase());
  if (byKey) return byKey.key;
  const byName = MAPPING_SOURCES.find((s) => (entityNames[s.configKey] || "").toLowerCase() === e.toLowerCase());
  return byName?.key ?? null;
}
