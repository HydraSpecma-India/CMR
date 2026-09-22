# CMR Platform — Architecture

> Reusable document-generation platform for HydraSpecma India (HSIN).
> First document type: **Certificate of Conformity (CMR)**. Same designer/renderer later serves Inspection, Test, Quality, Packing, Material and Shipping certificates via `templateType`.

## 1. System context

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Browser (React / Next.js App Router, TypeScript, Tailwind)                 │
│   • Admin: template designer (Konva canvas), field definitions, mappings    │
│   • Users: CMR creation wizard, history, preview (PDF.js viewer)            │
│   • NO secrets. NO direct calls to D365FO / Graph / Supabase.               │
└───────────────┬────────────────────────────────────────────────────────────┘
                │ HTTPS  (session cookie from Auth.js, same origin)
┌───────────────▼────────────────────────────────────────────────────────────┐
│  Next.js server on Vercel  (Route Handlers  /api/**  + Server Components)   │
│                                                                             │
│   auth/        Auth.js v5  ← Microsoft Entra ID (OIDC, PKCE)                │
│   rbac/        role guard  (Admin | Quality | Production | Viewer)          │
│   services/    template · field · cmr · audit  (business logic)             │
│   integrations/                                                             │
│      d365/        OAuth2 client-credentials → D365FO OData  (or mock)       │
│      graph/       OAuth2 client-credentials → Microsoft Graph → SharePoint  │
│      supabase/    service-role client (server only)                         │
│   engine/                                                                   │
│      resolver/    resolveField(field, context)  – source-driven             │
│      renderer/    template JSON + data context → PDF (pdf-lib)              │
└──────┬──────────────────┬──────────────────────┬───────────────────────────┘
       │                  │                      │
┌──────▼───────┐  ┌───────▼────────┐   ┌─────────▼──────────┐
│ Supabase     │  │ Microsoft      │   │ Microsoft Graph    │
│ PostgreSQL + │  │ Entra ID       │   │  → SharePoint      │
│ Storage      │  │ (token issuer) │   │  document library  │
│ (config,     │  └───────┬────────┘   └────────────────────┘
│ metadata,    │          │
│ audit)       │  ┌───────▼────────┐
└──────────────┘  │ D365FO OData   │
                  │ CMRProductionData / CMRDocumentEntity
                  └────────────────┘
```

**Rule of ownership**

| Data | Owner |
|---|---|
| Production orders, sales orders, items, customers, quantities | **D365FO** (read via OData, never copied as master data) |
| CMR business record (number, PO, serial, URL, status) | **D365FO `CMRDocumentEntity`** (system of record) mirrored in Supabase `cmr_documents` for processing state and UI |
| Final PDF | **SharePoint** (Supabase keeps only the URL + item id; a transient copy lives in Supabase Storage only until upload succeeds) |
| Templates, versions, field definitions, mappings, settings, audit | **Supabase** |
| Identity | **Entra ID** |

## 2. Folder structure

```
cmr-platform/
├─ docs/                          architecture pack + setup guides (this folder)
├─ supabase/
│  └─ migrations/                 SQL migrations (applied with supabase CLI or SQL editor)
├─ public/
├─ src/
│  ├─ app/
│  │  ├─ (auth)/signin/           sign-in page
│  │  ├─ (app)/                   authenticated shell (sidebar + topbar)
│  │  │  ├─ page.tsx              dashboard
│  │  │  ├─ cmr/new/              CMR creation wizard            (Phase 3)
│  │  │  ├─ cmr/history/          CMR search/history             (Phase 5)
│  │  │  ├─ cmr/[id]/             CMR detail + retry             (Phase 5)
│  │  │  └─ admin/
│  │  │     ├─ templates/         list · [id] versions · [id]/designer/[versionId]
│  │  │     ├─ fields/            field definitions (manual/custom/system)  (Phase 2)
│  │  │     ├─ d365-mappings/     D365FO field mapping                       (Phase 2)
│  │  │     ├─ sharepoint/        SharePoint configuration                   (Phase 4)
│  │  │     ├─ users/             users & roles
│  │  │     ├─ signatures/        stored signatures                          (Phase 4)
│  │  │     ├─ audit/             audit log viewer                           (Phase 5)
│  │  │     └─ settings/          app settings
│  │  └─ api/                     route handlers (see 04-API.md)
│  ├─ components/
│  │  ├─ ui/                      reusable primitives (Button, Input, Dialog, …)
│  │  ├─ layout/                  AppShell, Sidebar, Topbar
│  │  └─ designer/                Konva canvas, palettes, property panel
│  ├─ lib/
│  │  ├─ auth/                    auth.ts (Auth.js config), rbac.ts, session helpers
│  │  ├─ db/                      supabase-admin.ts (server-only), repositories/
│  │  ├─ template/                schema.ts (zod), defaults, geometry helpers
│  │  ├─ fields/                  field-source registry, resolver (Phase 2/3)
│  │  ├─ render/                  pdf renderer (pdf-lib) + element painters (Phase 4)
│  │  ├─ integrations/
│  │  │  ├─ d365/                 client.ts, odata.ts, mock.ts   (Phase 3)
│  │  │  └─ graph/                client.ts, sharepoint.ts       (Phase 4)
│  │  ├─ audit/                   audit writer
│  │  ├─ logging/                 structured logger
│  │  └─ utils/
│  ├─ types/                      shared TS types (DB rows, DTOs)
│  └─ proxy.ts                    route protection (Next 16 "proxy", ex-middleware)
├─ .env.example
└─ README.md
```

## 3. Authentication & authorization

* **Auth.js v5 (`next-auth@beta`)** with the **Microsoft Entra ID** provider (OIDC + PKCE). Session strategy = JWT cookie (no DB session table required; Vercel-friendly).
* On every sign-in the user is **upserted into `users`** (object id, email, display name).
* **Role resolution** (first match wins):
  1. `roles` claim from Entra **App Roles** (`Admin`, `Quality`, `Production`, `Viewer`) if the app registration defines them;
  2. `users.role` stored in Supabase (editable from Admin → Users);
  3. `ADMIN_EMAILS` env bootstrap list → `Admin`;
  4. default `Viewer`.
* **Route protection**: `src/proxy.ts` redirects unauthenticated requests for `/(app)` and `/api/*` (except `/api/auth/*`, `/api/health`, `/api/automation/*` which uses an API key).
* **Authorization is enforced server-side in every route handler/service** via `requireRole(session, [...])`. UI hiding is cosmetic only. No URL parameter is ever trusted for authorization; ownership/role is re-checked against the session.
* **Automation (Power Automate)** calls `/api/automation/*` with `X-Api-Key: $AUTOMATION_API_KEY` (rotatable, server-side compare in constant time).

Secrets (`AZURE_*`, `D365_*`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SECRET`) exist only as Vercel server environment variables. No `NEXT_PUBLIC_` variable ever carries a secret. Supabase is accessed **only** from the server with the service-role key; RLS is enabled with no anon policies, so the anon key is useless to a browser.

## 4. Field architecture (configuration-driven)

```
field_definitions (DB)  ──►  Field Source Registry  ──►  resolveField(field, ctx)  ──►  Template Renderer
      ▲                            (per sourceType)                                        (per element type)
      │
  Admin "+ Create Field"                                                   never `if (fieldName === 'CustomerPO')`
```

* A **field definition** = `{ fieldName, displayName, dataType, sourceType, config, validation }`.
* `sourceType ∈ D365FO | MANUAL | SYSTEM | STATIC | SIGNATURE | IMAGE | CUSTOM` (the "source" answers *where the value comes from*).
* `dataType ∈ TEXT | MULTILINE | NUMBER | DATE | TIME | DATETIME | BOOLEAN | DROPDOWN | IMAGE | SIGNATURE` (the "type" answers *how it is entered/validated/formatted*).
* Each `sourceType` has one **resolver**; each `dataType` has one **formatter**; each template `element.type` has one **painter** (canvas) and one **painter** (PDF). Adding a field never touches any of these.
* D365FO fields carry `config.entity` + `config.property` (+ optional `config.path` for nested lookups), configured in Admin → D365FO Field Mapping. The designer shows `displayName`; the technical name is shown as a subtitle.
* `SYSTEM` fields are resolved by a **system key** (`CMR_NUMBER`, `CURRENT_DATE`, `CURRENT_TIME`, `CURRENT_DATETIME`, `CURRENT_USER`, `TEMPLATE_VERSION`, `PRODUCTION_QTY_REMAINING`, …). Admin can create new system fields by picking a key.
* Manual override: any field may set `allowOverride: true` — the wizard then shows the resolved value pre-filled but editable.

## 5. Rendering strategy — one layout model

* Template coordinates are stored in **PDF points on an A4 page (595.28 × 841.89, origin top-left)**. The designer canvas simply scales those points; the PDF renderer converts `y` to PDF's bottom-left origin at paint time.
* **Preview = the real PDF.** `POST /api/cmr/preview` runs the same renderer with a `PREVIEW` watermark and the browser displays it with PDF.js. There is no second "HTML preview" that could drift.
* The designer canvas (Konva) is a *design-time* view sharing the same geometry, fonts and element painters' parameters — it is not used for output.

## 6. PDF library decision → **pdf-lib** (+ `@pdf-lib/fontkit`)

| Option | Verdict |
|---|---|
| **pdf-lib** ✅ | Pure JS (no native binaries, no Chromium) → runs in any Vercel Node function with fast cold starts. Absolute positioning in PDF points = exact match to template JSON. Can **embed an existing PDF page as the background** (`embedPdf`) so the original HydraSpecma CMR stays vector-sharp. Embeds PNG/JPEG (logos, signatures), draws lines/rects, custom TTF fonts via fontkit. Deterministic output. |
| PDFKit | Similar drawing model but stream-based and cannot import an existing PDF page as background without extra tooling. |
| Puppeteer / Playwright | HTML→PDF is convenient but positioning depends on browser layout, fonts and DPI; needs a ~50 MB Chromium (`@sparticuz/chromium`) on Vercel, slow cold starts, 250 MB function limit pressure. Wrong tool for form-overlay precision. |

Text wrapping, alignment and multiline are implemented in our own layout helper so canvas and PDF apply identical rules.

## 7. D365FO integration design

* **Auth**: OAuth2 client-credentials against `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`, scope `{D365_BASE_URL}/.default`. Token cached in memory until 5 min before expiry.
* **Transport**: `GET {D365_BASE_URL}/data/{Entity}?$filter=…&cross-company=true` with `Authorization: Bearer`, `OData-MaxVersion: 4.0`. Writes: `POST /data/CMRDocumentEntities`, `PATCH /data/CMRDocumentEntities(dataAreaId='hsin',CMRNumber='…')`.
* **Provider abstraction**: `D365Client` interface with `OData` and `Mock` implementations chosen by `D365_MODE=live|mock`. Mock returns the sample data set; the UI shows a "DEMO DATA" badge when mock is active so nobody mistakes it for a live integration.
* **Entities** (custom, see `docs/06-D365FO-SETUP.md`):
  * `CMRProductionData` — one row per production order, denormalised: ProductionOrder, ItemNumber, ItemDescription, ProductionQuantity, ReportedAsFinishedQty, Site, Warehouse, SalesOrder, SalesLineNumber, CustomerPO, CustomerAccount, CustomerName, CustomerPartNumber, SalesQuantity, CustomerRequestedDate, ProductionStatus. Customer PO is computed **inside the entity** via ProdTable → (InventRefType = Sales, InventRefId/InventRefTransId) → SalesLine → SalesTable.PurchOrderFormNum — so the app never guesses.
  * `CMRDocumentEntity` — CMR metadata (key: `dataAreaId` + `CMRNumber`).
* **Quantity guard**: `SalesQuantity`, `PreviouslyCertifiedQty` (sum of completed CMRs for the same sales line — from `CMRDocumentEntity`) and `ProductionQuantity` are shown; if `app_settings.enforce_remaining_qty = true` generation is blocked when `current > remaining`.

## 8. SharePoint integration design

* **Auth**: same client-credentials flow against Graph (`https://graph.microsoft.com/.default`). Recommended permission `Sites.Selected` (least privilege) granted to one site; fallback `Sites.ReadWrite.All`.
* **Upload**: `PUT /drives/{driveId}/root:/{folderPath}/{fileName}:/content` for ≤ 4 MB, upload session for larger files. Folder path built from a configurable pattern stored in `app_settings`, default `CMR/{yyyy}/{ItemNumber}/{CMRNumber}.pdf`. Folders are created idempotently (`PATCH`/`POST children` with `@microsoft.graph.conflictBehavior=fail` tolerated).
* **Result**: Graph returns `id`, `webUrl`, `eTag`; stored in `sharepoint_documents` and on `cmr_documents.sharepoint_url`. Optional organisation-scoped view link via `POST /drives/{d}/items/{id}/createLink`.
* **Idempotency**: file name is the CMR number; conflict behaviour `replace` on retry so a retry never creates `CMR-…(1).pdf`.

## 9. CMR transaction state machine

```
DRAFT ─► DATA_RETRIEVED ─► VALIDATED ─► PDF_GENERATED ─► UPLOADED ─► COMPLETED
                                            │                │
                                            ▼                ▼
                                       UPLOAD_FAILED    D365_UPDATE_PENDING / D365_UPDATE_FAILED
                                       (Retry Upload)   (Retry D365 Update)
```

* CMR number is **reserved once** when the record moves to `VALIDATED` (from D365FO number sequence in live mode; `cmr_number_sequences` table with `SELECT … FOR UPDATE` in mock mode — never `MAX+1`).
* The generated PDF bytes are persisted (Supabase Storage, private bucket `cmr-generated`) *before* upload so retries re-upload the identical file — no re-render, no new number.
* Duplicate protection: unique index on `(production_order, serial_number)` where status ≠ CANCELLED, plus `idempotency_key` on the generate request.
* Every transition writes an `audit_logs` row and a structured log line (`cmr_id`, `step`, `status`, `duration_ms`).

## 10. Development phases

| Phase | Scope | Exit check |
|---|---|---|
| **1** | Project, Auth.js + Entra, Supabase migrations, template JSON schema (zod), template CRUD + versions, designer with text/image/line/rectangle, background upload, admin shell | `npm run build` clean; sign in; create template; upload background; place elements; save; reload preserves JSON |
| **2** | Field definitions CRUD, D365FO mapping admin, custom field creation, field palette in designer, field properties/validation, table/checkbox/dropdown/date/time/datetime/signature elements | New custom field appears in palette without redeploy; field props persist |
| **3** | CMR wizard, production-order search, D365 client (mock + live), manual field form auto-generated from template, resolver, quantity logic, preview PDF | Preview PDF from sample data matches designer |
| **4** | Final PDF, signature pad/upload, Supabase transient storage, SharePoint upload, retry | File visible in SharePoint; retry re-uses same CMR number |
| **5** | D365 POST/PATCH, history/search, audit viewer, retry states | D365 record created; failure states recoverable |
| **6** | Automation API for Power Automate, Teams notification, auto-trigger | Flow can create a CMR end-to-end |
