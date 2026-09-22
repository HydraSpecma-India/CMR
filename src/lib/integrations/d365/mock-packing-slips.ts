import "server-only";

/**
 * DEMO data used only when D365 mode = "mock" (the UI shows a DEMO badge).
 * Shapes follow the standard D365 F&O entities so the same mapping code runs in mock and live
 * mode. Names and addresses are fictitious.
 */

export interface MockPackingSlip {
  header: Record<string, unknown> & { dataAreaId: string; PackingSlipId: string; DeliveryDate: string };
  lines: Record<string, unknown>[];
  salesOrder: Record<string, unknown>;
  customer: Record<string, unknown>;
  legalEntity: Record<string, unknown>;
  warehouse: Record<string, unknown>;
  products: Record<string, Record<string, unknown>>;
  carrier: Record<string, unknown>;
  invoice: Record<string, unknown> | null;
}

const legalEntity = {
  LegalEntityId: "demo",
  Name: "HydraSpecma DEMO Company A/S",
  AddressStreet: "Demovej 1",
  AddressZipCode: "6900",
  AddressCity: "Skjern",
  AddressCountryRegionId: "DNK",
  VATNumber: "DK00000000",
};

const warehouse = { WarehouseId: "DK-MAIN", WarehouseName: "Main warehouse", PrimaryAddressCity: "Skjern", PrimaryAddressCountryRegionId: "DNK" };

const products = {
  "4100.0231": { ItemNumber: "4100.0231", ProductName: "Hydraulic hose assembly DN16", GrossProductWeight: 1.85, NetProductWeight: 1.7, ProductVolume: 0.004, IntrastatCommodityCode: "40094200" },
  "4200.0118": { ItemNumber: "4200.0118", ProductName: "Pipe clamp kit, steel", GrossProductWeight: 0.42, NetProductWeight: 0.4, ProductVolume: 0.0008, IntrastatCommodityCode: "73269098" },
  "1070.0049": { ItemNumber: "1070.0049", ProductName: "Baseframe module", GrossProductWeight: 385, NetProductWeight: 360, ProductVolume: 1.9, IntrastatCommodityCode: "84139100" },
  "5300.0007": { ItemNumber: "5300.0007", ProductName: "Filter element 10 µm", GrossProductWeight: 0.6, NetProductWeight: 0.55, ProductVolume: 0.002, IntrastatCommodityCode: "84212300" },
};

const carrier = { CarrierCode: "DEMO-HAUL", CarrierName: "Demo Transport ApS", AddressStreet: "Transportvej 9", AddressZipCode: "7400", AddressCity: "Herning", AddressCountryRegionId: "DNK" };

export const MOCK_PACKING_SLIPS: MockPackingSlip[] = [
  {
    header: {
      dataAreaId: "DEMO",
      PackingSlipId: "PS-DEMO-000481",
      SalesId: "SO-DEMO-10233",
      DeliveryDate: "2026-09-21T12:00:00Z",
      OrderAccount: "C-DE-0042",
      DeliveryName: "Demo Windparts GmbH",
      DlvTerm: "DAP",
      DlvMode: "TRUCK",
      CustomerRef: "PO 4500123987",
      InventLocationId: "DK-MAIN",
      Weight: 0,
    },
    lines: [
      { PackingSlipId: "PS-DEMO-000481", SalesId: "SO-DEMO-10233", ItemId: "4100.0231", Name: "Hydraulic hose assembly DN16", Qty: 120, SalesUnit: "pcs" },
      { PackingSlipId: "PS-DEMO-000481", SalesId: "SO-DEMO-10233", ItemId: "4200.0118", Name: "Pipe clamp kit, steel", Qty: 300, SalesUnit: "pcs" },
      { PackingSlipId: "PS-DEMO-000481", SalesId: "SO-DEMO-10233", ItemId: "5300.0007", Name: "Filter element 10 µm", Qty: 48, SalesUnit: "pcs" },
    ],
    salesOrder: {
      SalesOrderNumber: "SO-DEMO-10233",
      DeliveryAddressName: "Demo Windparts GmbH – Goods receiving",
      DeliveryAddressStreet: "Musterstraße 10",
      DeliveryAddressZipCode: "20095",
      DeliveryAddressCity: "Hamburg",
      DeliveryAddressCountryRegionId: "DEU",
      DeliveryTermsCode: "DAP",
      DeliveryTermsLocation: "Hamburg",
      DeliveryModeCode: "TRUCK",
      ShippingCarrierId: "DEMO-HAUL",
      CustomerRequisitionNumber: "PO 4500123987",
    },
    customer: { CustomerAccount: "C-DE-0042", OrganizationName: "Demo Windparts GmbH", TaxExemptNumber: "DE000000000" },
    legalEntity,
    warehouse,
    products,
    carrier,
    invoice: { InvoiceNumber: "INV-DEMO-77120", SalesOrderNumber: "SO-DEMO-10233" },
  },
  {
    header: {
      dataAreaId: "DEMO",
      PackingSlipId: "PS-DEMO-000482",
      SalesId: "SO-DEMO-10240",
      DeliveryDate: "2026-09-22T12:00:00Z",
      OrderAccount: "C-PL-0007",
      DeliveryName: "Demo Energia Sp. z o.o.",
      DlvTerm: "FCA",
      DlvMode: "TRUCK",
      CustomerRef: "ZAM/2026/0917",
      InventLocationId: "DK-MAIN",
    },
    lines: [{ PackingSlipId: "PS-DEMO-000482", SalesId: "SO-DEMO-10240", ItemId: "1070.0049", Name: "Baseframe module", Qty: 2, SalesUnit: "pcs" }],
    salesOrder: {
      SalesOrderNumber: "SO-DEMO-10240",
      DeliveryAddressName: "Demo Energia Sp. z o.o.",
      DeliveryAddressStreet: "ul. Przykładowa 5",
      DeliveryAddressZipCode: "80-001",
      DeliveryAddressCity: "Gdańsk",
      DeliveryAddressCountryRegionId: "POL",
      DeliveryTermsCode: "FCA",
      DeliveryTermsLocation: "Skjern",
      DeliveryModeCode: "TRUCK",
      ShippingCarrierId: "",
      CustomerRequisitionNumber: "ZAM/2026/0917",
    },
    customer: { CustomerAccount: "C-PL-0007", OrganizationName: "Demo Energia Sp. z o.o.", TaxExemptNumber: "PL0000000000" },
    legalEntity,
    warehouse,
    products,
    carrier: {},
    invoice: null,
  },
];
