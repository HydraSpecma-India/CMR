# API design

All routes are Next.js Route Handlers under `src/app/api`. Every handler:
1. `const session = await requireSession()` (401 if missing)
2. `requireRole(session, [...])` (403)
3. validates body with zod (400 with `{ error, issues }`)
4. calls a service; never returns stack traces — errors are mapped to `{ error: { code, message } }` and logged with a `requestId`.

Roles: **A**dmin, **Q**uality, **P**roduction, **V**iewer.

## Auth
| Method | Path | Roles | Notes |
|---|---|---|---|
| * | `/api/auth/[...nextauth]` | public | Auth.js (Entra ID) |
| GET | `/api/me` | any | session + role |
| GET | `/api/health` | public | `{ ok, d365Mode, storageMode }` — no secrets |

## Templates (Phase 1)
| Method | Path | Roles | |
|---|---|---|---|
| GET | `/api/templates` | A Q P V | list (+ active version summary) |
| POST | `/api/templates` | A | create template + version 1 (draft) |
| GET | `/api/templates/:id` | A Q P V | template + versions |
| PATCH | `/api/templates/:id` | A | rename / description / type / archive |
| POST | `/api/templates/:id/duplicate` | A | copy active or latest version into new template |
| DELETE | `/api/templates/:id` | A | only if no versions were ever published & no documents |
| POST | `/api/templates/:id/versions` | A | new draft version (copied from `fromVersionId` or active) |
| GET | `/api/templates/:id/versions/:versionId` | A Q P V | full template_json |
| PUT | `/api/templates/:id/versions/:versionId` | A | save draft JSON (rejected if published) |
| POST | `/api/templates/:id/versions/:versionId/publish` | A | validate → set published, set `templates.active_version_id`, deprecate previous |
| POST | `/api/templates/:id/versions/:versionId/deactivate` | A | published → deprecated; template has no active version afterwards |
| DELETE | `/api/templates/:id/versions/:versionId` | A | draft only (soft-delete → `status='deleted'`, restorable) |
| POST | `/api/templates/:id/versions/:versionId/restore` | A | deleted draft → draft |
| POST | `/api/templates/:id/versions/:versionId/preview` | A Q P V | render with sample data → PDF (Phase 3/4) |

## Assets (Phase 1)
| Method | Path | Roles | |
|---|---|---|---|
| POST | `/api/assets` | A | multipart upload (PDF/PNG/JPEG ≤ 20 MB) → `template_assets` row + page count / size |
| GET | `/api/assets/:id` | any signed-in | streams file (private bucket) |
| GET | `/api/assets/:id/page/:n.png` | any signed-in | rasterised page for designer background (rendered client-side with PDF.js in Phase 1; server raster optional later) |
| DELETE | `/api/assets/:id` | A | if unreferenced |

## Fields (Phase 2)
| Method | Path | Roles | |
|---|---|---|---|
| GET | `/api/fields` | any | active definitions grouped by category |
| POST | `/api/fields` | A | create (custom/manual/system/static) |
| PATCH | `/api/fields/:id` | A | update; rename blocked if referenced by published version |
| DELETE | `/api/fields/:id` | A | deactivate |
| GET/PUT | `/api/fields/:id/d365-mapping` | A | entity/property/path |
| GET | `/api/d365/entities` | A | metadata: entity list & properties from `$metadata` (live) or mock catalogue |

## D365FO (Phase 3/5)
| Method | Path | Roles | |
|---|---|---|---|
| GET | `/api/d365/production-orders?q=` | A Q P | search |
| GET | `/api/d365/production-orders/:id` | A Q P | full `CMRProductionData` row + quantity summary |
| GET | `/api/d365/customer-po/:productionOrder` | A Q P | resolved PO chain (explicit, for troubleshooting) |
| POST | `/api/d365/cmr` | server-internal | create CMRDocumentEntity |
| PATCH | `/api/d365/cmr/:key` | server-internal | update |

## CMR workflow (Phase 3–5)
| Method | Path | Roles | |
|---|---|---|---|
| POST | `/api/cmr` | P Q A | create DRAFT `{templateId, productionOrder}` → fetches D365, returns manual field schema |
| PUT | `/api/cmr/:id/values` | P Q A | save manual values (validated) |
| POST | `/api/cmr/:id/signature` | P Q A | upload / pad PNG |
| POST | `/api/cmr/:id/preview` | P Q A | watermarked PDF stream |
| POST | `/api/cmr/:id/generate` | P Q A | validate → reserve number → render → store → **UPLOAD → D365** (continues automatically; each step recorded) |
| POST | `/api/cmr/:id/retry` | P Q A | `{ step: 'SP_UPLOAD' \| 'D365_UPDATE' }` |
| POST | `/api/cmr/:id/complete` | Q A | quality review sign-off |
| GET | `/api/cmr` | any | history with filters + paging |
| GET | `/api/cmr/:id` | any | detail incl. steps/audit |
| GET | `/api/cmr/:id/pdf` | any | streams stored PDF (or redirects to SharePoint) |

## SharePoint (Phase 4)
| POST | `/api/sharepoint/upload` | server-internal | used by workflow |
| GET | `/api/sharepoint/test` | A | connectivity check: site → drive → root folder |

## Automation (Phase 6)
| POST | `/api/automation/cmr` | `X-Api-Key` | headless create+generate using manual values in body; returns status URL |
| GET | `/api/automation/cmr/:id` | `X-Api-Key` | status polling |

## Admin misc
| GET/PUT | `/api/settings` | A | app_settings |
| GET/PATCH | `/api/users`, `/api/users/:id` | A | roles |
| GET | `/api/audit?entity=&id=&q=` | A Q | |
| GET/POST/DELETE | `/api/signatures` | any (own), A (all) | |
