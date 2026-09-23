/**
 * Documentation of the built-in D365 → CMR mapping implemented in
 * src/lib/integrations/d365/packing-slips.ts (buildPrefill / loadLive).
 * Shown on Admin → D365FO Field Mapping. Keep in sync when the prefill logic changes.
 *
 * `record` is a mapping source key (see mapping-sources.ts) – the page shows the configured
 * entity name for it. `fields` are OData property names tried in order (first non-empty wins).
 * Client-safe.
 */
import type { MappingSourceKey } from "./mapping-sources";

export interface BuiltinStep {
  record: MappingSourceKey | "setting" | "system" | "manual";
  fields: string[];
  note?: string;
}

export interface BuiltinRule {
  steps: BuiltinStep[];
  /** how the steps are combined */
  rule?: string;
}

const ADDR = (p: string) => [`${p}Street`, `${p}ZipCode`, `${p}City`, `${p}CountryRegionId`];

export const BUILTIN_MAPPING: Record<string, BuiltinRule> = {
  CMRNumber: { steps: [{ record: "system", fields: [], note: "Next number of the company sequence (Settings → CMR numbering), reserved on issue" }] },

  SenderName: { steps: [{ record: "legalEntity", fields: ["Name", "LegalEntityName", "CompanyName"] }] },
  SenderAddress: {
    steps: [
      { record: "legalEntity", fields: [...ADDR("Address"), ...ADDR("PrimaryAddress")], note: "street / zip city / country, one line each" },
      { record: "legalEntity", fields: ["VATNumber", "TaxRegistrationNumber", "VATNum", "CoRegNum"], note: "added as “VAT: …”" },
    ],
  },

  ConsigneeName: {
    rule: "first value found",
    steps: [
      { record: "salesOrder", fields: ["DeliveryAddressName"] },
      { record: "header", fields: ["DeliveryName"] },
      { record: "customer", fields: ["OrganizationName", "Name", "CustomerName"] },
    ],
  },
  ConsigneeAddress: {
    rule: "first record with an address; then customer VAT",
    steps: [
      { record: "salesOrder", fields: ADDR("DeliveryAddress") },
      { record: "header", fields: ADDR("Delivery") },
      { record: "customer", fields: ADDR("Address") },
      { record: "customer", fields: ["TaxExemptNumber", "VATNumber", "SalesTaxRegistrationNumber"], note: "added as “VAT: …”" },
    ],
  },
  DeliveryPlace: { steps: [{ record: "salesOrder", fields: ["DeliveryAddressCity", "DeliveryAddressCountryRegionId"], note: "“City, Country” of the consignee address above" }] },

  TakingOverPlace: {
    rule: "shipping warehouse, else sender",
    steps: [
      { record: "warehouse", fields: ["PrimaryAddressCity", "PrimaryAddressCountryRegionId"], note: "warehouse = packing slip InventLocationId (or sales order DefaultShippingWarehouseId)" },
      { record: "legalEntity", fields: ["AddressCity", "AddressCountryRegionId"] },
    ],
  },
  TakingOverDate: { steps: [{ record: "header", fields: ["DeliveryDate", "DocumentDate", "PackingSlipDate"] }] },
  DocumentsAttached: {
    steps: [
      { record: "header", fields: ["PackingSlipId"], note: "“Packing slip …”" },
      { record: "invoice", fields: ["InvoiceNumber", "InvoiceId"], note: "latest invoice of the sales order → “Commercial invoice …”" },
    ],
  },

  CarrierName: {
    rule: "carrier record looked up by the sales order ShippingCarrierId (or packing slip ShipCarrierId); code if not found",
    steps: [
      { record: "carrier", fields: ["CarrierName", "Name", "ShippingCarrierName", "Description"] },
      { record: "salesOrder", fields: ["ShippingCarrierId"], note: "fallback: carrier code" },
    ],
  },
  CarrierAddress: { steps: [{ record: "carrier", fields: ADDR("Address") }] },
  VehicleRegistration: { steps: [{ record: "manual", fields: [], note: "entered at loading" }] },
  SuccessiveCarriers: { steps: [{ record: "manual", fields: [] }] },
  CarrierReservations: { steps: [{ record: "manual", fields: [], note: "written by the carrier" }] },

  SenderInstructions: {
    steps: [
      { record: "header", fields: ["DlvTerm"], note: "Incoterms (else sales order DeliveryTermsCode)" },
      { record: "salesOrder", fields: ["DeliveryTermsLocation", "SalesOrderNumber", "CustomerRequisitionNumber"], note: "“Incoterms® 2020: DAP Hamburg · Sales order … · Customer ref. …”" },
      { record: "setting", fields: ["cmr.defaults.senderInstructions"], note: "appended text" },
    ],
  },
  CarriagePaid: { steps: [{ record: "header", fields: ["DlvTerm"], note: "ticked when the Incoterm is NOT in cmr.defaults.forwardIncoterms" }] },
  CarriageForward: { steps: [{ record: "header", fields: ["DlvTerm"], note: "ticked when the Incoterm is in cmr.defaults.forwardIncoterms (EXW, FCA, FAS, FOB)" }] },
  CashOnDelivery: { steps: [{ record: "manual", fields: [] }] },
  SpecialAgreements: { steps: [{ record: "setting", fields: ["cmr.defaults.specialAgreements"] }] },
  ToBePaidBy: { steps: [{ record: "setting", fields: ["cmr.defaults.toBePaidBy"] }] },
  EstablishedPlace: {
    rule: "first value found",
    steps: [
      { record: "setting", fields: ["cmr.defaults.establishedPlace"] },
      { record: "warehouse", fields: ["PrimaryAddressCity"] },
      { record: "legalEntity", fields: ["AddressCity"] },
    ],
  },
  EstablishedDate: { steps: [{ record: "system", fields: [], note: "issue date" }] },
  SenderSignatoryName: { steps: [{ record: "system", fields: [], note: "name of the signed-in user" }] },
  CarrierSignatoryName: { steps: [{ record: "manual", fields: [] }] },

  // goods – every packing slip line becomes one goods row
  Marks: { steps: [{ record: "setting", fields: ["cmr.defaults.marksPattern"], note: "tokens {CustomerRef} {SalesOrder} {PackingSlip} {ItemNumber}" }] },
  Packages: { steps: [{ record: "manual", fields: [], note: "not stored on the D365 packing slip" }] },
  Packing: { steps: [{ record: "setting", fields: ["cmr.defaults.defaultPacking"] }] },
  Nature: {
    rule: "“<qty> <unit> <name> (<item>)”",
    steps: [
      { record: "line", fields: ["Qty", "Quantity", "DeliveredQuantity", "InventQty"], note: "quantity" },
      { record: "line", fields: ["SalesUnit", "SalesUnitSymbol", "Unit"], note: "unit" },
      { record: "line", fields: ["Name", "ItemName", "ProductName"], note: "name (else product ProductName / SearchName)" },
      { record: "line", fields: ["ItemId", "ItemNumber"], note: "item number" },
    ],
  },
  StatNo: { steps: [{ record: "product", fields: ["IntrastatCommodityCode", "CommodityCode", "TariffCode", "HSNCode"] }] },
  GrossWeight: {
    rule: "unit weight × line quantity; if no line has a weight: packing slip header Weight",
    steps: [
      { record: "product", fields: ["GrossProductWeight", "GrossWeight", "NetProductWeight", "NetWeight"] },
      { record: "header", fields: ["Weight", "GrossWeight", "TotalWeight"], note: "fallback total" },
    ],
  },
  Volume: {
    rule: "unit volume × line quantity",
    steps: [{ record: "product", fields: ["ProductVolume", "UnitVolume", "Volume"], note: "else GrossDepth × GrossWidth × GrossHeight" }],
  },
  TotalPackages: { steps: [{ record: "system", fields: [], note: "sum of box 7" }] },
  TotalGrossWeight: { steps: [{ record: "system", fields: [], note: "sum of box 11" }] },
  TotalVolume: { steps: [{ record: "system", fields: [], note: "sum of box 12" }] },
  AdrClass: { steps: [{ record: "manual", fields: [] }] },
  AdrNumber: { steps: [{ record: "manual", fields: [] }] },
  AdrLetter: { steps: [{ record: "manual", fields: [] }] },
  AdrDescription: { steps: [{ record: "manual", fields: [] }] },
};

/** Join keys used to load the related records of a packing slip. */
export const JOIN_KEYS: { record: MappingSourceKey; key: string }[] = [
  { record: "header", key: "dataAreaId = company · PackingSlipId (· SalesId)" },
  { record: "line", key: "dataAreaId · PackingSlipId · SalesId" },
  { record: "salesOrder", key: "SalesOrderNumber = header.SalesId" },
  { record: "customer", key: "CustomerAccount = header.OrderAccount" },
  { record: "legalEntity", key: "LegalEntityId = company" },
  { record: "warehouse", key: "WarehouseId = header.InventLocationId" },
  { record: "carrier", key: "CarrierCode / ShippingCarrierId = salesOrder.ShippingCarrierId" },
  { record: "invoice", key: "SalesOrderNumber = header.SalesId (latest InvoiceDate)" },
  { record: "product", key: "ItemNumber = line.ItemId" },
];

/** Built-in rule for a field name (goods rows share the column rule). */
export function builtinFor(fieldName: string): BuiltinRule | undefined {
  const g = /^Goods\d+(Marks|Packages|Packing|Nature|StatNo|GrossWeight|Volume)$/.exec(fieldName);
  return BUILTIN_MAPPING[g ? g[1] : fieldName];
}
