# D365 Finance & Operations setup guide

## 1. Entra application for OData
1. Entra admin center → **App registrations → New registration** → `HSIN CMR Platform – D365` (or reuse the Graph app; scopes are requested per resource so one registration works for both).
2. Copy client/tenant IDs → `D365_CLIENT_ID`, `D365_TENANT_ID`; create a secret → `D365_CLIENT_SECRET`.
3. **API permissions → Add → APIs my organization uses → "Microsoft Dynamics ERP"** → *Application permissions* (none are strictly required for OData with a service account, but adding `Connector.FullAccess`/`CustomService.FullAccess` avoids issues on some environments) → Grant admin consent.
4. No redirect URI needed (client-credentials flow).

## 2. Register the application in D365FO
1. Create a service user: **System administration → Users → Users → New**: User ID `CMRSVC`, name `CMR Platform Service`, Provider `https://sts.windows.net/`, email any placeholder. Assign roles (see §4).
2. **System administration → Setup → Microsoft Entra ID applications** (older: *Azure Active Directory applications*) → New: **Client Id** = `D365_CLIENT_ID`, Name = `CMR Platform`, **User ID** = `CMRSVC`.
3. Token endpoint used by the app: `https://login.microsoftonline.com/{D365_TENANT_ID}/oauth2/v2.0/token`, scope `{D365_BASE_URL}/.default` (e.g. `https://hsin-prod.operations.dynamics.com/.default`).

## 3. Data entities
Standard entities (`ProductionOrderHeadersV2`, `SalesOrderLines`, `SalesOrderHeadersV2`) can be stitched together, but the link from a production order to its sales line (`ProdTable.InventRefType/InventRefId/InventRefTransId`) is **not** exposed on the standard header entity. Therefore create two custom entities in a small X++ model (`HSINCMR`):

### 3.1 `CMRProductionData` (read-only, OData enabled, public name `CMRProductionData`, collection `CMRProductionDatas`)
Data source: `ProdTable` (primary) with outer joins:
```
ProdTable
  ⟕ InventTable            (ItemId)                       → ItemNumber, ItemDescription (EcoResProductTranslation / itemName())
  ⟕ SalesLine              (SalesLine.InventTransId = ProdTable.InventRefTransId  WHERE ProdTable.InventRefType = InventRefType::Sales)
  ⟕ SalesTable             (SalesId)                       → SalesOrder, CustomerPO (PurchOrderFormNum), CustAccount
  ⟕ CustTable / DirPartyTable                              → CustomerName
  ⟕ CustVendExternalItem   (ItemId, CustAccount, ModuleType=Cust) → CustomerPartNumber (ExternalItemId)
```
Fields (public names) — these are what **Admin → D365FO Field Mapping** references:

| Field | Source | Notes |
|---|---|---|
| dataAreaId | ProdTable | key |
| ProductionOrder | ProdTable.ProdId | key |
| ItemNumber | ProdTable.ItemId | |
| ItemDescription | InventTable.itemName() (computed column) | |
| ProductionQuantity | ProdTable.QtySched | scheduled qty |
| ReportedAsFinishedQty | ProdTable.QtyCalc / RAF sum (computed) | |
| ProductionStatus | ProdTable.ProdStatus | enum |
| Site / Warehouse | InventDim via ProdTable.InventDimId (computed) | |
| SalesOrder | SalesLine.SalesId | empty when the order is not sales-linked |
| SalesLineNumber | SalesLine.LineNum | |
| SalesQuantity | SalesLine.SalesQty | for the partial-production display |
| CustomerPO | SalesTable.PurchOrderFormNum | **the** Customer PO |
| CustomerAccount | SalesTable.CustAccount | |
| CustomerName | DirPartyTable.Name | |
| CustomerPartNumber | CustVendExternalItem.ExternalItemId | |
| CustomerRequestedDate | SalesLine.ReceiptDateRequested | |
| ProductionFinishedDate | ProdTable.FinishedDate | |

If the production order was created from a **planned order pegged to a sales line** rather than directly (`InventRefType = None`), add a second join via `ReqTrans`/`ReqPO` marking or via `InventTransOrigin` marking (`InventTransOriginSalesLine`) — document which path your organisation uses; the app displays `CustomerPOSource` if you expose it.

**Read verification (GET)**
```
GET {D365_BASE_URL}/data/CMRProductionDatas?$filter=ProductionOrder eq 'HSIN-00972-23'&cross-company=true
Authorization: Bearer <token>
Accept: application/json
```
Expected: one record with `CustomerPO` populated.

### 3.2 `CMRDocumentEntity` (read/write, table `HSINCMRDocument`, collection `CMRDocuments`)
Custom table `HSINCMRDocument` (company-specific):

| Field | Type | Notes |
|---|---|---|
| CMRNumber | Str 30 | **primary key with dataAreaId**; comes from number sequence `HSIN_CMR` if `cmr.numberAuthority = d365` |
| ProductionOrder | ProdId | |
| ItemNumber | ItemId | |
| TopLevelSerialNumber | Str 60 | manual |
| CustomerPO | Str 60 | |
| SalesOrder | SalesId | |
| SalesLineNumber | LineNum | |
| Quantity | Qty | qty certified by this CMR |
| TemplateName | Str 100 | |
| TemplateVersion | Str 20 | |
| CMRDate | Date | |
| CompletedBy | Str 100 | user email |
| DocumentUrl | Str 1000 | SharePoint webUrl |
| Status | Enum HSINCMRStatus (`Generated`, `Uploaded`, `Completed`, `Cancelled`) | |
| AppDocumentId | Str 40 | Supabase uuid, for idempotent PATCH |

Entity: data source `HSINCMRDocument`, `Public Collection Name = CMRDocuments`, `Entity Key = dataAreaId, CMRNumber`, **Is Public = Yes**, allow create/update. Add `AppDocumentId` as an alternate unique index so a retry can `GET …?$filter=AppDocumentId eq '…'` before deciding POST vs PATCH.

**Create (POST)**
```
POST {D365_BASE_URL}/data/CMRDocuments
Content-Type: application/json
{
  "dataAreaId": "hsin",
  "CMRNumber": "CMR-2026-1392",
  "ProductionOrder": "HSIN-00972-23",
  "ItemNumber": "1070.0049",
  "TopLevelSerialNumber": "HSIN:1392",
  "CustomerPO": "29107156",
  "SalesOrder": "SO-001234",
  "Quantity": 2,
  "TemplateName": "HydraSpecma CMR 1070.0049",
  "TemplateVersion": "2",
  "CMRDate": "2026-09-15T00:00:00Z",
  "CompletedBy": "user@hydraspecma.com",
  "DocumentUrl": "https://hydraspecma.sharepoint.com/sites/Quality/CMR/2026/1070.0049/CMR-2026-1392.pdf",
  "Status": "Uploaded",
  "AppDocumentId": "6f1c…"
}
```
**Update (PATCH)**
```
PATCH {D365_BASE_URL}/data/CMRDocuments(dataAreaId='hsin',CMRNumber='CMR-2026-1392')
If-Match: *
{ "Status": "Completed", "DocumentUrl": "…" }
```

### 3.3 Number sequence (when D365 is the number authority)
Create number sequence reference `HSIN_CMR` (Organization administration → Number sequences), format `CMR-####-######` per year or `CMR-######`. Expose a custom service or an OData **action** on the entity:
```
POST {D365_BASE_URL}/data/CMRDocuments/Microsoft.Dynamics.DataEntities.ReserveNextNumber
{ "_dataAreaId": "hsin" }   →  { "value": "CMR-2026-001392" }
```
(`[SysODataActionAttribute("ReserveNextNumber", false)] public static str reserveNextNumber(DataAreaId _dataAreaId)` → `NumberSeq::newGetNum(...).num()` with `_makeDecisionLater=false`.) The app calls this **once**, immediately before rendering, and stores the result. If the call succeeds but the app later fails, the number is consumed — acceptable and auditable; it is never re-used.

Alternative without X++: set `cmr.numberAuthority = app` in Admin → Settings; the app uses its own transactional sequence table.

## 4. Security roles for `CMRSVC`
Create role `HSIN CMR integration` with privileges:
* `CMRProductionData` entity: **Read**
* `CMRDocumentEntity` entity: **Create / Read / Update**
* `SalesTable`, `SalesLine`, `ProdTable` view (implicitly required by the entity data sources)
Assign the role to `CMRSVC`, all legal entities in scope.

## 5. Quantity relationship (partial production)
The app computes:
```
SalesQuantity            = CMRProductionData.SalesQuantity           (10)
PreviouslyCertifiedQty   = Σ CMRDocuments.Quantity where SalesOrder + SalesLineNumber match and Status ≠ Cancelled (6)
CurrentProductionQty     = CMRProductionData.ProductionQuantity or ReportedAsFinishedQty (setting) (2)
Remaining                = SalesQuantity − PreviouslyCertifiedQty      (4)
```
and blocks generation when `CurrentProductionQty > Remaining` if `cmr.enforceRemainingQty` is on.

## 6. Environment variables
```
D365_BASE_URL=https://<env>.operations.dynamics.com
D365_TENANT_ID=
D365_CLIENT_ID=
D365_CLIENT_SECRET=
D365_COMPANY=hsin
D365_MODE=live|mock      # mock = built-in sample data, UI shows a DEMO badge
D365_PRODUCTION_ENTITY=CMRProductionDatas
D365_CMR_ENTITY=CMRDocuments
```

## 7. Test checklist
1. `GET /data/CMRProductionDatas?$top=1&cross-company=true` → 200
2. `GET …?$filter=ProductionOrder eq 'HSIN-00972-23'` → `CustomerPO` non-empty
3. `POST /data/CMRDocuments` with a test number → 201
4. `PATCH /data/CMRDocuments(dataAreaId='hsin',CMRNumber='…')` → 204
5. In the app: **Admin → System Settings → D365 connection test** runs steps 1–2 and shows the raw (secret-free) result.
