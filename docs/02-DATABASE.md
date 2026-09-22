# Database schema (Supabase PostgreSQL)

Source of truth for this document is `supabase/migrations/*.sql`. **All tables are prefixed `cmr_` and buckets `cmr-`** so the app can share a Supabase project with other applications without collisions. Everything here is application configuration, processing state and audit — **never ERP master data** (D365FO owns that).

```
users ──────────────┐
                    │ created_by / updated_by (soft FK to users.id)
templates ──< template_versions ──< (template_json: pages[].elements[])
    │                  │
    │                  └──< cmr_documents ──< cmr_document_values
    │                                │            (one row per field on the CMR)
    │                                ├──< cmr_process_steps   (per-step log & retry state)
    │                                ├──< sharepoint_documents
    │                                └──< audit_logs (entity_type='cmr_document')
field_definitions ─────────────────── referenced by template_json elements (fieldName) and cmr_document_values.field_id
d365_field_mappings ─── 1:1 extension of field_definitions where source_type = 'D365FO'
signatures ───────────── user signature images (private storage)
template_assets ──────── backgrounds/logos/images used by templates (private storage)
app_settings ─────────── key/value JSON (SharePoint folder pattern, qty enforcement, number format…)
cmr_number_sequences ─── year-scoped counter used only when D365FO is not the number authority
audit_logs
```

## Tables

### cmr_users
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| entra_object_id | text UNIQUE | `oid` claim |
| email | text UNIQUE | |
| display_name | text | |
| role | text | `Admin` \| `Quality` \| `Production` \| `Viewer` (CHECK) |
| active | boolean | default true |
| last_login_at | timestamptz | |
| created_at / updated_at | timestamptz | |

### cmr_templates
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| name | text | |
| description | text | |
| template_type | text | `CMR`, `InspectionCertificate`, … (CHECK against `template_types` list in app_settings, free text allowed) |
| status | text | `active` \| `archived` |
| active_version_id | uuid → template_versions | the single published version used for new documents (nullable) |
| created_by / updated_by | uuid | |
| created_at / updated_at | timestamptz | |

### cmr_template_versions
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| template_id | uuid → templates | |
| version_number | int | unique per template |
| revision | text | free label, e.g. `Rev 02` |
| status | text | `draft` \| `published` \| `deprecated` |
| template_json | jsonb | validated against the zod `TemplateSchema` at write time |
| background_asset_id | uuid → template_assets | (per-page backgrounds are also inside template_json; this is a convenience pointer to the uploaded source PDF) |
| change_note | text | |
| published_at / published_by | | set on publish; **row becomes immutable by trigger** |
| created_by / created_at | | |
| UNIQUE (template_id, version_number) | | |

Trigger `template_versions_immutable`: raises if `template_json` or `background_asset_id` change while `status = 'published'`.

### cmr_template_assets
Backgrounds, logos, static images. Files live in private Supabase Storage bucket `template-assets`; the row is the metadata.
| column | type |
|---|---|
| id uuid PK, template_id uuid → templates (nullable for shared assets), kind text (`background` \| `logo` \| `image`), file_name text, mime_type text, storage_path text, page_count int, width_pt numeric, height_pt numeric, sha256 text, created_by, created_at |

### cmr_field_definitions
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| field_name | text UNIQUE | technical key, `^[A-Za-z][A-Za-z0-9_]*$` |
| display_name | text | friendly label shown in designer |
| description | text | |
| data_type | text | `TEXT` `MULTILINE` `NUMBER` `DATE` `TIME` `DATETIME` `BOOLEAN` `DROPDOWN` `IMAGE` `SIGNATURE` |
| source_type | text | `D365FO` `MANUAL` `SYSTEM` `STATIC` `SIGNATURE` `IMAGE` `CUSTOM` |
| category | text | palette grouping (`D365FO Fields`, `Manual Fields`, `Custom Fields`, `System Fields`) |
| required | boolean | |
| read_only | boolean | |
| allow_override | boolean | manual override of resolved value |
| default_value | text | |
| unit | text | e.g. `°C` |
| validation_json | jsonb | `{minLength,maxLength,regex,min,max,minDate,maxDate,options[]}` |
| config_json | jsonb | source-specific: D365 `{entity,property,path}`; SYSTEM `{systemKey}`; STATIC `{value}`; DROPDOWN `{options}`; `format` |
| is_system_defined | boolean | seeded fields, cannot be deleted (can be deactivated) |
| active | boolean | |
| sort_order | int | |
| created_by / created_at / updated_at | | |

### cmr_d365_field_mappings
Kept as its own table so mapping can be audited/edited independently of the field.
| column | type |
|---|---|
| id uuid PK, field_id uuid → field_definitions UNIQUE, entity text, property text, path text (dotted for expanded navigation), odata_type text, transform text (`none` \| `trim` \| `upper` \| `dateOnly` …), active bool, created_at, updated_at |

### cmr_documents
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| cmr_number | text UNIQUE nullable | assigned once at VALIDATED |
| template_id | uuid → templates | |
| template_version_id | uuid → template_versions | **exact version used** |
| template_version_number | int | denormalised for display |
| production_order | text | |
| item_number | text | |
| item_description | text | |
| serial_number | text | Top Level Serial Number (manual) |
| customer_po | text | |
| sales_order | text | |
| sales_line | text | |
| customer_account | text | |
| quantity | numeric | current production qty on this CMR |
| status | text | `DRAFT` `DATA_RETRIEVED` `VALIDATED` `PDF_GENERATED` `UPLOAD_FAILED` `UPLOADED` `D365_UPDATE_PENDING` `D365_UPDATE_FAILED` `COMPLETED` `CANCELLED` |
| d365_context_json | jsonb | snapshot of D365 payload used (for audit/regeneration parity) |
| generated_pdf_path | text | transient Supabase Storage path |
| pdf_sha256 | text | |
| sharepoint_url | text | |
| sharepoint_item_id | text | |
| d365_record_key | text | key of CMRDocumentEntity row |
| last_error | text | user-safe message |
| idempotency_key | text UNIQUE | |
| created_by / created_at | | |
| completed_by / completed_at | | |
| UNIQUE (production_order, serial_number) WHERE status <> 'CANCELLED' | | duplicate protection |

### cmr_document_values
| column | type |
|---|---|
| id uuid PK, cmr_document_id uuid → cmr_documents, field_id uuid → field_definitions (nullable when element has no definition), field_name text, source_type text, value_text text, value_json jsonb, resolved_at timestamptz |

### cmr_process_steps
| column | type |
|---|---|
| id uuid PK, cmr_document_id uuid, step text (`D365_FETCH` `VALIDATE` `RENDER` `SP_UPLOAD` `D365_UPDATE`), status text (`STARTED` `OK` `FAILED`), attempt int, started_at, finished_at, duration_ms int, error text, details jsonb |

### cmr_sharepoint_documents
| column | type |
|---|---|
| id uuid PK, cmr_document_id uuid, site_id text, drive_id text, item_id text, folder_path text, file_name text, web_url text, etag text, size_bytes int, uploaded_at, uploaded_by |

### cmr_signatures
| column | type |
|---|---|
| id uuid PK, user_id uuid → users, label text, storage_path text (private bucket `signatures`), mime_type text, is_default bool, created_at |

### cmr_app_settings
| column | type |
|---|---|
| key text PK, value jsonb, description text, updated_by, updated_at |

Seeded keys: `sharepoint.folderPattern`, `sharepoint.siteId` (overrides env if set — **never** secrets), `cmr.numberFormat` (`CMR-{yyyy}-{seq:4}`), `cmr.numberAuthority` (`d365` \| `app`), `cmr.enforceRemainingQty`, `template.types`.

### cmr_number_sequences
| year int PK, last_value bigint | used with `UPDATE … RETURNING` inside a transaction (row lock) — only when `cmr.numberAuthority = app` |

### cmr_audit_logs
| column | type |
|---|---|
| id bigserial PK, entity_type text, entity_id text, action text (`CREATED` `EDITED` `PREVIEWED` `GENERATED` `SIGNED` `COMPLETED` `UPLOADED` `D365_UPDATED` `RETRIED` `FAILED` `PUBLISHED` `DEACTIVATED` …), user_id uuid, user_email text, cmr_number text, details jsonb, created_at |

## Security posture
* RLS enabled on every table; **no policies for `anon`/`authenticated`** → the browser cannot query Supabase at all. The server uses the service-role key.
* Storage buckets `cmr-template-assets`, `cmr-signatures`, `cmr-generated` are private; files are streamed through `/api/assets/*` after role checks.
