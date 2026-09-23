# D365 → CMR built-in mapping

Default entity names (Settings → D365 can change them). Properties are tried left to right; the first non-empty value wins. Admin → D365FO Field Mapping can override any field.

## How the records are found

| Record | Entity | Join |
|---|---|---|
| Packing slip header | `CustPackingSlipJourBiEntities` | dataAreaId = company · PackingSlipId (· SalesId) |
| Packing slip line (goods columns) | `CustPackingSlipTransBiEntities` | dataAreaId · PackingSlipId · SalesId |
| Sales order header | `SalesOrderHeadersV2` | SalesOrderNumber = header.SalesId |
| Customer | `CustomersV3` | CustomerAccount = header.OrderAccount |
| Legal entity (sender) | `LegalEntities` | LegalEntityId = company |
| Shipping warehouse | `Warehouses` | WarehouseId = header.InventLocationId |
| Shipping carrier | `ShippingCarriers` | CarrierCode / ShippingCarrierId = salesOrder.ShippingCarrierId |
| Sales invoice | `SalesInvoiceHeadersV2` | SalesOrderNumber = header.SalesId (latest InvoiceDate) |
| Released product of the line (goods columns) | `ReleasedProductsV2` | ItemNumber = line.ItemId |

## Fields

| Box | CMR field | Source (entity.property) | Rule / note |
|---|---|---|---|
| T | CMR number (`CMRNumber`) | system (Next number of the company sequence (Settings → CMR numbering), reserved on issue) |  |
| 1 | Sender name (`SenderName`) | `LegalEntities`.Name \| LegalEntityName \| CompanyName |  |
| 1 | Sender address (`SenderAddress`) | `LegalEntities`.AddressStreet \| AddressZipCode \| AddressCity \| AddressCountryRegionId \| PrimaryAddressStreet \| PrimaryAddressZipCode \| PrimaryAddressCity \| PrimaryAddressCountryRegionId (street / zip city / country, one line each)<br>`LegalEntities`.VATNumber \| TaxRegistrationNumber \| VATNum \| CoRegNum (added as “VAT: …”) |  |
| 2 | Consignee name (`ConsigneeName`) | `SalesOrderHeadersV2`.DeliveryAddressName<br>`CustPackingSlipJourBiEntities`.DeliveryName<br>`CustomersV3`.OrganizationName \| Name \| CustomerName | first value found |
| 2 | Consignee address (`ConsigneeAddress`) | `SalesOrderHeadersV2`.DeliveryAddressStreet \| DeliveryAddressZipCode \| DeliveryAddressCity \| DeliveryAddressCountryRegionId<br>`CustPackingSlipJourBiEntities`.DeliveryStreet \| DeliveryZipCode \| DeliveryCity \| DeliveryCountryRegionId<br>`CustomersV3`.AddressStreet \| AddressZipCode \| AddressCity \| AddressCountryRegionId<br>`CustomersV3`.TaxExemptNumber \| VATNumber \| SalesTaxRegistrationNumber (added as “VAT: …”) | first record with an address; then customer VAT |
| 3 | Place of delivery (`DeliveryPlace`) | `SalesOrderHeadersV2`.DeliveryAddressCity \| DeliveryAddressCountryRegionId (“City, Country” of the consignee address above) |  |
| 4 | Place of taking over (`TakingOverPlace`) | `Warehouses`.PrimaryAddressCity \| PrimaryAddressCountryRegionId (warehouse = packing slip InventLocationId (or sales order DefaultShippingWarehouseId))<br>`LegalEntities`.AddressCity \| AddressCountryRegionId | shipping warehouse, else sender |
| 4 | Date of taking over (`TakingOverDate`) | `CustPackingSlipJourBiEntities`.DeliveryDate \| DocumentDate \| PackingSlipDate |  |
| 5 | Documents attached (`DocumentsAttached`) | `CustPackingSlipJourBiEntities`.PackingSlipId (“Packing slip …”)<br>`SalesInvoiceHeadersV2`.InvoiceNumber \| InvoiceId (latest invoice of the sales order → “Commercial invoice …”) |  |
| 16 | Carrier name (`CarrierName`) | `ShippingCarriers`.CarrierName \| Name \| ShippingCarrierName \| Description<br>`SalesOrderHeadersV2`.ShippingCarrierId (fallback: carrier code) | carrier record looked up by the sales order ShippingCarrierId (or packing slip ShipCarrierId); code if not found |
| 16 | Carrier address (`CarrierAddress`) | `ShippingCarriers`.AddressStreet \| AddressZipCode \| AddressCity \| AddressCountryRegionId |  |
| 16 | Vehicle / trailer registration (`VehicleRegistration`) | manual (entered at loading) |  |
| 17 | Successive carriers (`SuccessiveCarriers`) | manual |  |
| 18 | Carrier's reservations (`CarrierReservations`) | manual (written by the carrier) |  |
| 13 | Sender's instructions (`SenderInstructions`) | `CustPackingSlipJourBiEntities`.DlvTerm (Incoterms (else sales order DeliveryTermsCode))<br>`SalesOrderHeadersV2`.DeliveryTermsLocation \| SalesOrderNumber \| CustomerRequisitionNumber (“Incoterms® 2020: DAP Hamburg · Sales order … · Customer ref. …”)<br>setting: cmr.defaults.senderInstructions (appended text) |  |
| 14 | Carriage paid (Frei) (`CarriagePaid`) | `CustPackingSlipJourBiEntities`.DlvTerm (ticked when the Incoterm is NOT in cmr.defaults.forwardIncoterms) |  |
| 14 | Carriage forward (Unfrei) (`CarriageForward`) | `CustPackingSlipJourBiEntities`.DlvTerm (ticked when the Incoterm is in cmr.defaults.forwardIncoterms (EXW, FCA, FAS, FOB)) |  |
| 15 | Cash on delivery (`CashOnDelivery`) | manual |  |
| 19 | Special agreements (`SpecialAgreements`) | setting: cmr.defaults.specialAgreements |  |
| 20 | To be paid by (`ToBePaidBy`) | setting: cmr.defaults.toBePaidBy |  |
| 21 | Established in (place) (`EstablishedPlace`) | setting: cmr.defaults.establishedPlace<br>`Warehouses`.PrimaryAddressCity<br>`LegalEntities`.AddressCity | first value found |
| 21 | Established on (date) (`EstablishedDate`) | system (issue date) |  |
| 22 | Signed by (sender) (`SenderSignatoryName`) | system (name of the signed-in user) |  |
| 23 | Signed by (carrier / driver) (`CarrierSignatoryName`) | manual |  |
| 6 | Goods – Marks and Nos (`Marks`) | setting: cmr.defaults.marksPattern (tokens {CustomerRef} {SalesOrder} {PackingSlip} {ItemNumber}) |  |
| 7 | Goods – Number of packages (`Packages`) | manual (not stored on the D365 packing slip) |  |
| 8 | Goods – Method of packing (`Packing`) | setting: cmr.defaults.defaultPacking |  |
| 9 | Goods – Nature of the goods (`Nature`) | `CustPackingSlipTransBiEntities`.Qty \| Quantity \| DeliveredQuantity \| InventQty (quantity)<br>`CustPackingSlipTransBiEntities`.SalesUnit \| SalesUnitSymbol \| Unit (unit)<br>`CustPackingSlipTransBiEntities`.Name \| ItemName \| ProductName (name (else product ProductName / SearchName))<br>`CustPackingSlipTransBiEntities`.ItemId \| ItemNumber (item number) | “<qty> <unit> <name> (<item>)” |
| 10 | Goods – Statistical number (`StatNo`) | `ReleasedProductsV2`.IntrastatCommodityCode \| CommodityCode \| TariffCode \| HSNCode |  |
| 11 | Goods – Gross weight in kg (`GrossWeight`) | `ReleasedProductsV2`.GrossProductWeight \| GrossWeight \| NetProductWeight \| NetWeight<br>`CustPackingSlipJourBiEntities`.Weight \| GrossWeight \| TotalWeight (fallback total) | unit weight × line quantity; if no line has a weight: packing slip header Weight |
| 12 | Goods – Volume in m³ (`Volume`) | `ReleasedProductsV2`.ProductVolume \| UnitVolume \| Volume (else GrossDepth × GrossWidth × GrossHeight) | unit volume × line quantity |
| 7 | Total – Number of packages (`TotalPackages`) | system (sum of box 7) |  |
| 11 | Total – Gross weight in kg (`TotalGrossWeight`) | system (sum of box 11) |  |
| 12 | Total – Volume in m³ (`TotalVolume`) | system (sum of box 12) |  |
| ADR | ADR class (`AdrClass`) | manual |  |
| ADR | ADR UN number (`AdrNumber`) | manual |  |
| ADR | ADR letter / packing group (`AdrLetter`) | manual |  |
| ADR | ADR description (`AdrDescription`) | manual |  |

## Custom entities (your own tables and relations)

Admin → D365FO Field Mapping → **Custom D365 entities (relations)** → *Add entity*:

1. **D365 OData entity** – the public collection name, e.g. `SalesOrderLines`.
2. **Relations** – `<entity field> = <related record>.<field>` or `= fixed value`; all must match. Types: text, number, enum (`Namespace.EnumType'Value'`).
   *Filter by company* adds `dataAreaId = company`. *Order by* picks the first record when several match.
3. Relating to *Packing slip line* or *Released product* (or a custom entity that does) loads the entity **once per goods line** – map it to goods columns (boxes 6–12). Otherwise it is loaded once per packing slip.
4. **Test relations** runs the OData query against a real packing slip and shows the filter and the record found.
5. Map any CMR field to the new entity (the record list in the mapping dialog shows it).

Example – customer's line reference from the sales order line into box 6:

| Entity | Relation |
|---|---|
| `SalesOrderLines` | `SalesOrderNumber` = Packing slip header.`SalesId` · `LineNumber` = Packing slip line.`LineNum` (number) |

then map *Goods – Marks and Nos* → *Sales order line* . `CustomersLineNumber`.

Stored in setting `d365.customEntities`; entities load top to bottom, so one may relate to another listed above it.
