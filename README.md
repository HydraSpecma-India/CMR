# CMR Platform — HydraSpecma

Issues **CMR consignment notes** (UNECE CMR Convention, Geneva 1956) from posted **Dynamics 365 F&O packing slips** — one CMR per packing slip, the standard 24-box layout, printed as 4 colour-coded copies (1 sender · 2 consignee · 3 carrier · 4 administrative). Built on the same platform as the COC app (template designer, roles, audit, numbering), as a separate app.

| | |
|---|---|
| Frontend | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 |
| Backend | Route Handlers — all D365 / Supabase / Teams calls are server-side only |
| Database | Supabase (project shared with COC, tables `cmr_*`, buckets `cmr-*`, RLS on, no policies → service-role only) |
| Auth | Auth.js v5 + Entra ID · roles Admin / Logistics / Shipping / Viewer · per-user legal entities |
| ERP | D365 F&O OData, client credentials, `cross-company=true` |
| PDF | pdf-lib; built-in vector CMR form or an uploaded pre-printed form as background; DejaVu font for PL/CZ/DE characters |

## Flow

1. **New CMR** → choose legal entity → search posted packing slips (number, sales order, customer, delivery name, date range). Slips that already have a CMR show its number.
2. The packing slip is mapped to boxes 1–24 (see below). Each value shows its source badge — **D365**, **Setting**, **System** or **Manual** — and everything stays editable. Warnings list what D365 does not hold (e.g. number of packages, missing weights, no carrier).
3. Goods table (boxes 6–12) with live totals; more than 6 lines go to a continuation sheet automatically.
4. Sender signature (box 22): sign on paper, saved signature, or generated signature. Boxes 23/24 are signed on paper by driver and consignee.
5. **Preview** (DRAFT watermark, no number reserved) per copy → **Issue CMR**: the number is reserved per company (`CMR-{company}-{yyyy}-{seq:5}` by default), the 4-copy PDF is rendered, stored in `cmr-generated`, logged, audited and optionally posted to Teams.
6. **CMR register** / detail page: view each copy, download, retry storage, **cancel with reason** (number is kept; the packing slip can then be re-issued).

## D365 → CMR box mapping

| Box | Source (entity · field candidates) |
|---|---|
| 1 Sender | `LegalEntities` name + address + VAT |
| 2 Consignee | `SalesOrderHeadersV2` DeliveryAddress* → packing slip delivery → `CustomersV3`; customer VAT |
| 3 Place of delivery | delivery city, country |
| 4 Taking over | `Warehouses` (packing slip InventLocationId) city/country · packing slip date |
| 5 Documents | packing slip no. + `SalesInvoiceHeadersV2` invoice no. |
| 6–12 Goods | `CustPackingSlipTransBiEntities` lines × `ReleasedProductsV2` (gross/net weight, volume, Intrastat commodity code); marks from `cmr.defaults.marksPattern` |
| 13 Instructions | Incoterms + location, sales order, customer ref., default text |
| 14 Payment | Incoterms in `forwardIncoterms` (EXW/FCA/FAS/FOB) → carriage forward, else paid |
| 16 Carrier | `ShippingCarriers` via sales order ShippingCarrierId |
| 19, 20, 21 | settings defaults; established date = issue date |

**D365 connection is shared with the COC app** (Settings → D365 → "Same as COC app", default). Mode, base URL, tenant and client ID are read server-side from the COC app's settings (`coc_app_settings`, same Supabase project), so both apps always hit the same D365 environment. The client secret never sits in the browser or in these tables: set `D365_CLIENT_SECRET` on the CMR server to the same value as the COC server. If live mode is on and something is missing, the wizard shows a clear "not configured" error instead of falling back to DEMO data. Switch to "Own connection for CMR" only if CMR must use a different environment.

Entity names are configurable in **Settings → D365**. Field names are read from candidate lists, so a missing property never breaks the page — it produces a warning instead of an invented value. Use **`GET /api/d365/probe?company=XXX`** (admin) against the live environment to list the real property names of every configured entity and adjust if needed.

## Setup

```bash
npm install
cp .env.example .env.local      # Supabase URL + service-role key, AUTH_SECRET, Entra ID, D365
npm run dev
```

- Schema: `supabase/migrations/0001_init.sql` (idempotent, additive — only `cmr_*` objects). **Already applied** to project `ollhtyeflpggdazrsqsq`.
- First login as an `ADMIN_EMAILS` user → **Admin → Templates → "Create standard CMR"** seeds the 24-box layout (or upload your pre-printed CMR PDF — 1 page reused for all copies, or 4 pages = 4 copies).
- **Settings**: D365 mode `live` + credentials, default company, `cmr.defaults` (companies shown first, forward Incoterms, default packing, box 19/20 texts, place of issue), numbering per company, Teams webhook (off by default — use a logistics channel, not the COC one).
- **Users**: restrict users to their legal entities (allowed companies).
- `D365_MODE=mock` gives two DEMO packing slips in company `DEMO` (UI shows a DEMO badge; such CMRs are flagged `data_mode = mock`).

## API

| Method | Path | |
|---|---|---|
| GET | `/api/d365/packing-slips?company=&q=&from=&to=` | search, with existing CMR numbers |
| GET | `/api/d365/packing-slips/{id}?company=` | prefill (values, sources, goods, warnings) |
| GET | `/api/d365/probe?company=` | entity field discovery (admin) |
| POST | `/api/cmr/preview` | DRAFT PDF, nothing stored |
| GET / POST | `/api/cmr` | register / issue |
| GET | `/api/cmr/{id}` · `/api/cmr/{id}/pdf[?copy=1..4&download=1]` | detail / PDF |
| POST | `/api/cmr/{id}/cancel` · `/api/cmr/{id}/retry` | cancel with reason / re-store PDF |

Docs 01–06 in `docs/` describe the shared platform (template schema, designer, SharePoint, auth) inherited from COC.
