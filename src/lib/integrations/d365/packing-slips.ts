import "server-only";
import { getActiveConfig, type CmrDefaults } from "@/lib/config";
import { logger } from "@/lib/logging/logger";
import { AppError } from "@/lib/errors";
import { D365Service, type D365Config } from "./service";
import type { CmrGoodsLine, CmrPrefill, PackingSlipSummary, ValueSource } from "@/lib/cmr/types";
import { fmt, goodsToValues, num } from "@/lib/cmr/goods";
import { isFormLang, langForCountry } from "@/lib/cmr/i18n";
import { GOODS_COLUMN_PROP, GOODS_FIELD_RE, MAPPING_SOURCES, resolveSourceKey } from "@/lib/cmr/mapping-sources";
import { listD365Mappings, type D365MappingRow } from "@/lib/db/repositories/fields";
import { MOCK_PACKING_SLIPS, type MockPackingSlip } from "./mock-packing-slips";

/**
 * D365 F&O → CMR.
 *
 * One CMR is built from one sales packing slip:
 *   packing slip header (CustPackingSlipJourBiEntities)  → date, sales order, delivery name, Incoterms, weight
 *   packing slip lines  (CustPackingSlipTransBiEntities) → items + shipped quantities         (boxes 6–12)
 *   sales order header  (SalesOrderHeadersV2)            → delivery address, carrier, customer ref (boxes 2, 3, 16)
 *   legal entity        (LegalEntities)                  → sender name / address / VAT     (box 1)
 *   warehouse           (Warehouses)                     → place of taking over             (box 4)
 *   released products   (ReleasedProductsV2)             → gross weight, volume, commodity code (boxes 10–12)
 *   shipping carrier    (ShippingCarriers)               → carrier name                     (box 16)
 *   sales invoice       (SalesInvoiceHeadersV2)          → invoice number                   (box 5)
 *
 * Entity names are admin settings. Because field names differ slightly between entity versions,
 * every value is read from a list of candidate property names; anything not found is left empty
 * and listed as a warning in the wizard – never invented.
 */

type Row = Record<string, unknown>;

const esc = (v: string) => v.replace(/'/g, "''");

export function pick(row: Row | null | undefined, candidates: string[]): string {
  if (!row) return "";
  for (const c of candidates) {
    const v = row[c];
    if (v !== undefined && v !== null && String(v).trim() !== "" && String(v) !== "1900-01-01T12:00:00Z") return String(v).trim();
  }
  return "";
}

const dateOnly = (v: string) => (v ? v.slice(0, 10) : "");

async function odata(cfg: D365Config, entity: string, params: { filter?: string; select?: string; top?: number; orderby?: string }): Promise<Row[]> {
  const token = await D365Service.getAccessToken(cfg);
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const q = new URLSearchParams();
  q.set("cross-company", "true");
  if (params.filter) q.set("$filter", params.filter);
  if (params.select) q.set("$select", params.select);
  if (params.orderby) q.set("$orderby", params.orderby);
  q.set("$top", String(params.top ?? 50));
  const url = `${base}/data/${entity}?${q.toString().replace(/\+/g, "%20")}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", Prefer: "odata.maxpagesize=500" }, cache: "no-store" });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 400);
    throw new Error(`D365 ${entity} returned ${res.status}: ${body}`);
  }
  const json = (await res.json()) as { value?: Row[] };
  return json.value ?? [];
}

async function odataOne(cfg: D365Config, entity: string, filter: string): Promise<Row | null> {
  try {
    const rows = await odata(cfg, entity, { filter, top: 1 });
    return rows[0] ?? null;
  } catch (e) {
    logger.warn("D365 lookup failed", { entity, filter, error: (e as Error).message });
    return null;
  }
}

/**
 * Live mode needs the complete connection. When live mode is set but something is missing we fail
 * loudly instead of silently falling back to DEMO data.
 */
const isLive = (cfg: D365Config) => {
  if (cfg.mode !== "live") return false;
  const missing = [
    !cfg.baseUrl && "base URL",
    !cfg.tenantId && "tenant ID",
    !cfg.clientId && "client ID",
    !cfg.clientSecret && "client secret (D365_CLIENT_SECRET – same value as the COC server)",
  ].filter(Boolean);
  if (missing.length) {
    const src = (cfg as D365Config & { connectionSource?: string }).connectionSource === "coc" ? " (connection shared with the COC app)" : "";
    throw new AppError("NOT_CONFIGURED", `D365 is in live mode${src} but the ${missing.join(", ")} is not set.`, 503);
  }
  return true;
};

/* ───────────────────────── search ───────────────────────── */

export async function searchPackingSlips(opts: { company: string; query?: string; from?: string; to?: string; limit?: number }): Promise<{ mode: "mock" | "live"; slips: PackingSlipSummary[] }> {
  const { d365 } = await getActiveConfig();
  const company = opts.company.trim().toUpperCase();
  const q = (opts.query ?? "").trim();

  if (!isLive(d365)) {
    const slips = MOCK_PACKING_SLIPS.filter((m) => company === "ALL" || m.header.dataAreaId === company)
      .filter((m) => !q || JSON.stringify(m.header).toLowerCase().includes(q.toLowerCase()))
      .filter((m) => (!opts.from || m.header.DeliveryDate >= opts.from) && (!opts.to || m.header.DeliveryDate.slice(0, 10) <= opts.to))
      .map((m) => summaryFromHeader(m.header as Row, m.lines.length));
    return { mode: "mock", slips };
  }

  const parts: string[] = [];
  if (company && company !== "ALL") parts.push(`dataAreaId eq '${esc(company.toLowerCase())}'`);
  if (opts.from) parts.push(`DeliveryDate ge ${opts.from}T00:00:00Z`);
  if (opts.to) parts.push(`DeliveryDate le ${opts.to}T23:59:59Z`);
  if (q) {
    const w = `'*${esc(q)}*'`;
    parts.push(`(PackingSlipId eq ${w} or SalesId eq ${w} or OrderAccount eq ${w} or DeliveryName eq ${w})`);
  }
  const rows = await odata(d365, d365.packingSlipHeaderEntity, {
    filter: parts.join(" and "),
    orderby: "DeliveryDate desc",
    top: Math.min(opts.limit ?? 50, 200),
  });
  return { mode: "live", slips: rows.map((r) => summaryFromHeader(r)) };
}

function summaryFromHeader(h: Row, lineCount?: number): PackingSlipSummary {
  return {
    company: pick(h, ["dataAreaId", "DataAreaId"]).toUpperCase(),
    packingSlipId: pick(h, ["PackingSlipId", "PackingSlipNumber"]),
    salesOrder: pick(h, ["SalesId", "SalesOrderNumber"]),
    deliveryDate: dateOnly(pick(h, ["DeliveryDate", "DocumentDate", "PackingSlipDate"])),
    customerAccount: pick(h, ["OrderAccount", "InvoiceAccount", "CustomerAccount"]),
    deliveryName: pick(h, ["DeliveryName", "DeliveryAddressName"]),
    deliveryCountry: pick(h, ["DeliveryCountryRegionId", "DeliveryAddressCountryRegionId"]),
    customerRef: pick(h, ["CustomerRef", "PurchaseOrder", "CustomersOrderReference"]),
    deliveryTerms: pick(h, ["DlvTerm", "DeliveryTermsCode"]),
    lineCount,
  };
}

/* ───────────────────────── one packing slip → CMR prefill ───────────────────────── */

interface Source {
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

async function loadLive(cfg: D365Config, company: string, packingSlipId: string, salesOrderHint?: string): Promise<Source | null> {
  const area = `dataAreaId eq '${esc(company.toLowerCase())}'`;
  const headerFilter = `${area} and PackingSlipId eq '${esc(packingSlipId)}'${salesOrderHint ? ` and SalesId eq '${esc(salesOrderHint)}'` : ""}`;
  const header = await odataOne(cfg, cfg.packingSlipHeaderEntity, headerFilter);
  if (!header) return null;
  const salesId = pick(header, ["SalesId", "SalesOrderNumber"]);

  const lines = await odata(cfg, cfg.packingSlipLineEntity, {
    filter: `${area} and PackingSlipId eq '${esc(packingSlipId)}'${salesId ? ` and SalesId eq '${esc(salesId)}'` : ""}`,
    top: 500,
  }).catch((e) => {
    logger.warn("Packing slip lines lookup failed", { error: (e as Error).message });
    return [] as Row[];
  });

  const [salesOrder, legalEntity] = await Promise.all([
    salesId ? odataOne(cfg, cfg.salesOrderEntity, `${area} and SalesOrderNumber eq '${esc(salesId)}'`) : Promise.resolve(null),
    odataOne(cfg, cfg.legalEntityEntity, `LegalEntityId eq '${esc(company.toLowerCase())}'`),
  ]);

  const custAcc = pick(header, ["OrderAccount", "InvoiceAccount"]) || pick(salesOrder, ["OrderingCustomerAccountNumber"]);
  const whId = pick(header, ["InventLocationId"]) || pick(salesOrder, ["DefaultShippingWarehouseId"]);
  const carrierId = pick(salesOrder, ["ShippingCarrierId"]) || pick(header, ["ShipCarrierId", "CarrierCode"]);
  const itemIds = [...new Set(lines.map((l) => pick(l, ["ItemId", "ItemNumber"])).filter(Boolean))];

  const [customer, warehouse, carrier, invoice, productRows] = await Promise.all([
    custAcc ? odataOne(cfg, cfg.customerEntity, `${area} and CustomerAccount eq '${esc(custAcc)}'`) : Promise.resolve(null),
    whId ? odataOne(cfg, cfg.warehouseEntity, `${area} and WarehouseId eq '${esc(whId)}'`) : Promise.resolve(null),
    carrierId
      ? odataOne(cfg, cfg.carrierEntity, `${area} and CarrierCode eq '${esc(carrierId)}'`).then(
          (r) => r ?? odataOne(cfg, cfg.carrierEntity, `${area} and ShippingCarrierId eq '${esc(carrierId)}'`),
        )
      : Promise.resolve(null),
    salesId
      ? odata(cfg, cfg.invoiceEntity, { filter: `${area} and SalesOrderNumber eq '${esc(salesId)}'`, orderby: "InvoiceDate desc", top: 1 })
          .then((r) => r[0] ?? null)
          .catch(() => null)
      : Promise.resolve(null),
    itemIds.length
      ? odata(cfg, cfg.productEntity, { filter: `${area} and (${itemIds.slice(0, 40).map((i) => `ItemNumber eq '${esc(i)}'`).join(" or ")})`, top: 100 }).catch((e) => {
          logger.warn("Released products lookup failed", { error: (e as Error).message });
          return [] as Row[];
        })
      : Promise.resolve([] as Row[]),
  ]);

  const products: Record<string, Row> = {};
  for (const p of productRows) products[pick(p, ["ItemNumber"])] = p;
  return { header, lines, salesOrder, customer, legalEntity, warehouse, products, carrier, invoice };
}

function loadMock(company: string, packingSlipId: string): Source | null {
  const m: MockPackingSlip | undefined = MOCK_PACKING_SLIPS.find((x) => x.header.PackingSlipId === packingSlipId && (company === "ALL" || x.header.dataAreaId === company));
  if (!m) return null;
  return {
    header: m.header as Row,
    lines: m.lines as Row[],
    salesOrder: m.salesOrder as Row,
    customer: m.customer as Row,
    legalEntity: m.legalEntity as Row,
    warehouse: m.warehouse as Row,
    products: m.products as Record<string, Row>,
    carrier: m.carrier as Row,
    invoice: m.invoice as Row | null,
  };
}

const join = (...parts: string[]) => parts.map((p) => p.trim()).filter(Boolean);

function address(row: Row | null, prefix: string[]): { lines: string[]; city: string; country: string } {
  const f = (suffix: string[]) => pick(row, prefix.flatMap((p) => suffix.map((s) => p + s)));
  const street = f(["Street", "AddressStreet"]);
  const zip = f(["ZipCode", "PostalCode", "AddressZipCode"]);
  const city = f(["City", "AddressCity"]);
  const country = f(["CountryRegionId", "CountryRegionISOCode", "AddressCountryRegionId"]);
  const described = f(["Description", "FormattedAddress", "AddressDescription"]);
  const lines = street || city ? join(street, `${zip} ${city}`, country) : described ? described.split(/\r?\n/) : [];
  return { lines, city, country };
}

export async function getPackingSlipPrefill(opts: { company: string; packingSlipId: string; salesOrder?: string; userName?: string }): Promise<CmrPrefill | null> {
  const cfg = await getActiveConfig();
  const live = isLive(cfg.d365);
  const src = live ? await loadLive(cfg.d365, opts.company, opts.packingSlipId, opts.salesOrder) : loadMock(opts.company, opts.packingSlipId);
  if (!src) return null;
  let mappings: D365MappingRow[] = [];
  try {
    mappings = (await listD365Mappings()).filter((m) => m.active && m.field?.field_name && m.property);
  } catch (e) {
    logger.warn("D365 field mappings could not be loaded – built-in mapping only", { error: (e as Error).message });
  }
  return buildPrefill(src, cfg.cmr, live ? "live" : "mock", opts.userName, mappings, cfg.d365);
}

/* ───────────────────────── admin field mappings (Admin → D365FO Field Mapping) ───────────────────────── */

function readProp(row: Row | null | undefined, property: string, path?: string | null): string {
  if (!row) return "";
  let cur: unknown = row;
  for (const part of [property, ...(path ? path.split(".") : [])].filter(Boolean)) {
    if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[part];
    else return "";
  }
  if (cur === null || cur === undefined) return "";
  return typeof cur === "object" ? JSON.stringify(cur) : String(cur);
}

function transformValue(v: string, t: string | null | undefined, qty = 1): string {
  switch (t) {
    case "trim":
      return v.trim();
    case "uppercase":
      return v.toUpperCase();
    case "date_iso":
      return dateOnly(v);
    case "number":
      return num(v) ? fmt(num(v), 3) : "";
    case "multiply_qty":
      return num(v) ? fmt(num(v) * qty, 3) : "";
    default:
      return v;
  }
}

function applyMappings(
  src: Source,
  mappings: D365MappingRow[],
  d365: D365Config | undefined,
  values: Record<string, string>,
  sources: Record<string, ValueSource>,
  goods: CmrGoodsLine[],
  warnings: string[],
) {
  const names = (d365 ?? {}) as Partial<Record<string, string>>;
  const records: Record<string, Row | null> = {
    header: src.header,
    salesOrder: src.salesOrder,
    customer: src.customer,
    legalEntity: src.legalEntity,
    warehouse: src.warehouse,
    carrier: src.carrier,
    invoice: src.invoice,
  };
  for (const m of mappings) {
    const field = m.field!.field_name;
    const key = resolveSourceKey(m.entity, names);
    if (!key) {
      warnings.push(`Mapping for ${field}: entity "${m.entity}" is not one of the loaded D365 records – ignored.`);
      continue;
    }
    const goodsCol = GOODS_FIELD_RE.exec(field)?.[1] as keyof typeof GOODS_COLUMN_PROP | undefined;
    if (goodsCol) {
      // column mapping → every goods line
      const prop = GOODS_COLUMN_PROP[goodsCol];
      src.lines.forEach((l, i) => {
        if (!goods[i]) return;
        const item = pick(l, ["ItemId", "ItemNumber"]);
        const row = key === "line" ? l : key === "product" ? src.products[item] : records[key];
        const qty = num(pick(l, ["Qty", "Quantity", "DeliveredQuantity", "InventQty"])) || 1;
        const v = transformValue(readProp(row, m.property, m.path), m.transform, qty);
        if (v) goods[i][prop] = v;
      });
      continue;
    }
    if (key === "line" || key === "product") {
      warnings.push(`Mapping for ${field}: line/product records can only fill goods columns (boxes 6–12).`);
      continue;
    }
    const v = transformValue(readProp(records[key], m.property, m.path), m.transform);
    if (v) {
      values[field] = v;
      sources[field] = "D365";
    }
  }
}

function buildPrefill(
  src: Source,
  defaults: CmrDefaults,
  mode: "mock" | "live",
  userName?: string,
  mappings: D365MappingRow[] = [],
  d365?: D365Config,
): CmrPrefill {
  const values: Record<string, string> = {};
  const sources: Record<string, ValueSource> = {};
  const warnings: string[] = [];
  const set = (k: string, v: string, s: ValueSource) => {
    if (v) {
      values[k] = v;
      sources[k] = s;
    }
  };
  const h = src.header;
  const so = src.salesOrder;
  const summary = summaryFromHeader(h, src.lines.length);

  // Box 1 – sender (legal entity)
  const le = src.legalEntity;
  const leAddr = address(le, ["Address", "PrimaryAddress", ""]);
  const vat = pick(le, ["VATNumber", "TaxRegistrationNumber", "VATNum", "CoRegNum"]);
  set("SenderName", pick(le, ["Name", "LegalEntityName", "CompanyName"]), "D365");
  set("SenderAddress", [...leAddr.lines, vat ? `VAT: ${vat}` : ""].filter(Boolean).join("\n"), "D365");
  if (!values.SenderName) warnings.push(`Sender (box 1): legal entity ${summary.company} was not found in ${"LegalEntities"} – enter manually.`);

  // Box 2 – consignee (delivery address of the sales order, fallback packing slip / customer)
  const consigneeName =
    pick(so, ["DeliveryAddressName"]) || pick(h, ["DeliveryName"]) || pick(src.customer, ["OrganizationName", "Name", "CustomerName"]);
  let del = address(so, ["DeliveryAddress"]);
  if (!del.lines.length) del = address(h, ["Delivery"]);
  if (!del.lines.length) del = address(src.customer, ["Address", ""]);
  const custVat = pick(src.customer, ["TaxExemptNumber", "VATNumber", "SalesTaxRegistrationNumber"]);
  set("ConsigneeName", consigneeName, "D365");
  set("ConsigneeAddress", [...del.lines, custVat ? `VAT: ${custVat}` : ""].filter(Boolean).join("\n"), "D365");
  if (!del.lines.length) warnings.push("Consignee address (box 2) not found on the sales order – enter manually.");

  // Box 3 – place of delivery
  set("DeliveryPlace", join(del.city, del.country).join(", "), "D365");

  // Box 4 – place & date of taking over (shipping warehouse, fallback sender city)
  const wh = address(src.warehouse, ["PrimaryAddress", "Address", ""]);
  const takeCity = wh.city || leAddr.city;
  const takeCountry = wh.country || leAddr.country;
  set("TakingOverPlace", join(takeCity, takeCountry).join(", "), "D365");
  set("TakingOverDate", summary.deliveryDate, "D365");

  // Box 5 – documents attached
  const inv = pick(src.invoice, ["InvoiceNumber", "InvoiceId"]);
  set("DocumentsAttached", join(summary.packingSlipId ? `Packing slip ${summary.packingSlipId}` : "", inv ? `Commercial invoice ${inv}` : "").join("\n"), "D365");

  // Box 16 – carrier
  const carrierName = pick(src.carrier, ["CarrierName", "Name", "ShippingCarrierName", "Description"]);
  const carrierCode = pick(so, ["ShippingCarrierId"]) || pick(h, ["ShipCarrierId"]);
  const dlvMode = pick(so, ["DeliveryModeCode"]) || pick(h, ["DlvMode"]);
  set("CarrierName", carrierName || carrierCode, "D365");
  const carrierAddr = address(src.carrier, ["Address", ""]);
  set("CarrierAddress", carrierAddr.lines.join("\n"), "D365");
  if (!values.CarrierName) warnings.push(`Carrier (box 16) is not set on sales order ${summary.salesOrder}${dlvMode ? ` (mode of delivery ${dlvMode})` : ""} – enter the haulier.`);

  // Box 13 – sender's instructions
  const incoterm = summary.deliveryTerms || pick(so, ["DeliveryTermsCode"]);
  const incotermPlace = pick(so, ["DeliveryTermsLocation", "DeliveryTermsLocationName"]);
  const custRef = summary.customerRef || pick(so, ["CustomerRequisitionNumber", "CustomersOrderReference"]);
  set(
    "SenderInstructions",
    join(
      incoterm ? `Incoterms® 2020: ${incoterm}${incotermPlace ? ` ${incotermPlace}` : ""}` : "",
      `Sales order ${summary.salesOrder}${custRef ? ` · Customer ref. ${custRef}` : ""}`,
      defaults.senderInstructions,
    ).join("\n"),
    defaults.senderInstructions ? "SETTING" : "D365",
  );

  // Box 14 – payment for carriage (from Incoterms)
  if (incoterm) {
    const forward = defaults.forwardIncoterms.map((x) => x.toUpperCase()).includes(incoterm.toUpperCase());
    values[forward ? "CarriageForward" : "CarriagePaid"] = "X";
    sources[forward ? "CarriageForward" : "CarriagePaid"] = "SETTING";
  }
  set("SpecialAgreements", defaults.specialAgreements, "SETTING");
  set("ToBePaidBy", defaults.toBePaidBy, "SETTING");

  // Box 21 – established in / on
  set("EstablishedPlace", defaults.establishedPlace || takeCity || leAddr.city, defaults.establishedPlace ? "SETTING" : "D365");
  set("EstablishedDate", new Date().toISOString().slice(0, 10), "SYSTEM");
  set("SenderSignatoryName", userName ?? "", "SYSTEM");

  // Form language (second language next to English on the built-in form)
  const byCompany = (defaults.languageByCompany ?? {})[summary.company];
  if (isFormLang(byCompany)) set("FormLanguage", byCompany, "SETTING");
  else set("FormLanguage", langForCountry(leAddr.country), leAddr.country ? "D365" : "SYSTEM");

  // Boxes 6–12 – goods
  const goods: CmrGoodsLine[] = src.lines.map((l) => {
    const item = pick(l, ["ItemId", "ItemNumber"]);
    const qty = num(pick(l, ["Qty", "Quantity", "DeliveredQuantity", "InventQty"]));
    const unit = pick(l, ["SalesUnit", "SalesUnitSymbol", "Unit"]);
    const p = src.products[item];
    const gross = num(pick(p, ["GrossProductWeight", "GrossWeight"])) || num(pick(p, ["NetProductWeight", "NetWeight"]));
    const vol =
      num(pick(p, ["ProductVolume", "UnitVolume", "Volume"])) ||
      (num(pick(p, ["GrossDepth"])) * num(pick(p, ["GrossWidth"])) * num(pick(p, ["GrossHeight"])));
    const name = pick(l, ["Name", "ItemName", "ProductName"]) || pick(p, ["ProductName", "SearchName"]);
    const marks = defaults.marksPattern
      .replace("{CustomerRef}", custRef)
      .replace("{SalesOrder}", summary.salesOrder)
      .replace("{PackingSlip}", summary.packingSlipId)
      .replace("{ItemNumber}", item)
      .trim();
    return {
      itemNumber: item,
      marks,
      packages: "",
      packing: defaults.defaultPacking,
      nature: join(`${fmt(qty, 3)} ${unit}`.trim(), name, item ? `(${item})` : "").join(" "),
      statNo: pick(p, ["IntrastatCommodityCode", "CommodityCode", "TariffCode", "HSNCode"]),
      grossWeight: gross ? fmt(gross * qty) : "",
      volume: vol ? fmt(vol * qty, 3) : "",
    };
  });
  // admin mappings override the built-in mapping (fields and goods columns)
  if (mappings.length) applyMappings(src, mappings, d365, values, sources, goods, warnings);

  if (!goods.length) warnings.push("No packing slip lines were returned – add the goods manually.");
  const missingWeight = goods.filter((g) => !g.grossWeight).map((g) => g.itemNumber).filter(Boolean);
  if (missingWeight.length) warnings.push(`No gross/net weight on released product(s) ${missingWeight.join(", ")} – enter the weight (box 11).`);
  // If lines carry no weight but the packing slip header does, use it as the total on line 1
  const headerWeight = num(pick(h, ["Weight", "GrossWeight", "TotalWeight"]));
  if (goods.length && goods.every((g) => !g.grossWeight) && headerWeight) {
    goods[0].grossWeight = fmt(headerWeight);
    warnings.push("Gross weight taken from the packing slip total.");
  }
  warnings.push("Box 7 (number of packages) is not tracked on the packing slip – enter the pallets/cartons per line.");

  Object.assign(values, goodsToValues(goods));

  return {
    mode,
    packingSlip: summary,
    values,
    sources,
    goods,
    warnings,
    context: { header: src.header, salesOrder: src.salesOrder, customer: src.customer, legalEntity: src.legalEntity, warehouse: src.warehouse, carrier: src.carrier, invoice: src.invoice, lineCount: src.lines.length },
  };
}

/** Admin diagnostics – returns the property names of the first record of each configured entity. */
export async function probeEntities(company: string): Promise<Array<{ key: string; label: string; entity: string; ok: boolean; count: number; fields: string[]; error?: string }>> {
  const { d365 } = await getActiveConfig();
  if (!isLive(d365)) return [];
  const area = company && company !== "ALL" ? `dataAreaId eq '${esc(company.toLowerCase())}'` : undefined;
  const list: Array<[string, string, string, string | undefined]> = MAPPING_SOURCES.map((m) => [
    m.key,
    m.label,
    d365[m.configKey],
    m.key === "legalEntity" ? undefined : area,
  ]);
  return Promise.all(
    list.map(async ([key, label, entity, filter]) => {
      try {
        const rows = await odata(d365, entity, { filter, top: 1 });
        return { key, label, entity, ok: true, count: rows.length, fields: rows[0] ? Object.keys(rows[0]).filter((k) => !k.startsWith("@")).sort() : [] };
      } catch (e) {
        return { key, label, entity, ok: false, count: 0, fields: [], error: (e as Error).message };
      }
    }),
  );
}
