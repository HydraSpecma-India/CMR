-- ============================================================================
-- CMR Platform – initial schema (all tables prefixed cmr_, buckets cmr-)
-- Lives next to the COC platform (coc_*) in the same Supabase project without
-- touching it. Apply once: paste into the Supabase SQL editor or `supabase db push`.
-- RLS is enabled on every table with NO policies → only the server (service-role
-- key) can read/write. The browser never talks to Supabase directly.
-- ============================================================================

create extension if not exists "pgcrypto";

create or replace function cmr_set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- users & roles
-- ---------------------------------------------------------------------------
create table if not exists cmr_users (
  id                uuid primary key default gen_random_uuid(),
  entra_object_id   text unique,
  email             text not null unique,
  display_name      text,
  role              text not null default 'Viewer',
  active            boolean not null default true,
  last_login_at     timestamptz,
  password_hash     text,
  allowed_companies text[] default array['ALL'],
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
drop trigger if exists cmr_users_updated on cmr_users;
create trigger cmr_users_updated before update on cmr_users for each row execute function cmr_set_updated_at();

create table if not exists cmr_roles (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  description  text,
  is_system    boolean not null default false,
  capabilities text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
drop trigger if exists cmr_roles_updated on cmr_roles;
create trigger cmr_roles_updated before update on cmr_roles for each row execute function cmr_set_updated_at();

-- ---------------------------------------------------------------------------
-- template assets, templates & versions
-- ---------------------------------------------------------------------------
create table if not exists cmr_template_assets (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid,
  kind          text not null check (kind in ('background','logo','image','font')),
  file_name     text not null,
  mime_type     text not null,
  storage_path  text not null unique,
  size_bytes    integer not null,
  page_count    integer,
  width_pt      numeric,
  height_pt     numeric,
  sha256        text,
  created_by    uuid references cmr_users(id),
  created_at    timestamptz not null default now()
);

create table if not exists cmr_templates (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  description          text,
  template_type        text not null default 'CMR',
  status               text not null default 'active' check (status in ('active','archived')),
  active_version_id    uuid,
  applicable_companies text[] default array['ALL'],
  applicable_items     text[] default array['*'],
  created_by           uuid references cmr_users(id),
  updated_by           uuid references cmr_users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
drop trigger if exists cmr_templates_updated on cmr_templates;
create trigger cmr_templates_updated before update on cmr_templates for each row execute function cmr_set_updated_at();

create table if not exists cmr_template_versions (
  id                   uuid primary key default gen_random_uuid(),
  template_id          uuid not null references cmr_templates(id) on delete cascade,
  version_number       integer not null,
  revision             text,
  status               text not null default 'draft' check (status in ('draft','published','deprecated','deleted')),
  template_json        jsonb not null,
  background_asset_id  uuid references cmr_template_assets(id),
  change_note          text,
  published_at         timestamptz,
  published_by         uuid references cmr_users(id),
  created_by           uuid references cmr_users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (template_id, version_number)
);
drop trigger if exists cmr_template_versions_updated on cmr_template_versions;
create trigger cmr_template_versions_updated before update on cmr_template_versions for each row execute function cmr_set_updated_at();

do $$ begin
  alter table cmr_templates add constraint cmr_templates_active_version_fk
    foreign key (active_version_id) references cmr_template_versions(id) on delete set null;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table cmr_template_assets add constraint cmr_template_assets_template_fk
    foreign key (template_id) references cmr_templates(id) on delete set null;
exception when duplicate_object then null; end $$;

create or replace function cmr_template_versions_immutable() returns trigger language plpgsql as $$
begin
  if old.status = 'published' and (
       new.template_json is distinct from old.template_json
    or new.background_asset_id is distinct from old.background_asset_id
    or new.version_number is distinct from old.version_number
  ) then
    raise exception 'Published template versions are immutable (version %). Create a new version instead.', old.version_number
      using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists cmr_template_versions_guard on cmr_template_versions;
create trigger cmr_template_versions_guard before update on cmr_template_versions
  for each row execute function cmr_template_versions_immutable();

-- ---------------------------------------------------------------------------
-- field definitions + D365 mappings
-- ---------------------------------------------------------------------------
create table if not exists cmr_field_definitions (
  id                 uuid primary key default gen_random_uuid(),
  field_name         text not null unique check (field_name ~ '^[A-Za-z][A-Za-z0-9_]*$'),
  display_name       text not null,
  description        text,
  data_type          text not null check (data_type in
                     ('TEXT','MULTILINE','NUMBER','DATE','TIME','DATETIME','BOOLEAN','DROPDOWN','IMAGE','SIGNATURE')),
  source_type        text not null check (source_type in
                     ('D365FO','MANUAL','SYSTEM','STATIC','SIGNATURE','IMAGE','CUSTOM')),
  category           text not null default 'Custom Fields',
  required           boolean not null default false,
  read_only          boolean not null default false,
  allow_override     boolean not null default true,
  default_value      text,
  unit               text,
  validation_json    jsonb not null default '{}'::jsonb,
  config_json        jsonb not null default '{}'::jsonb,
  is_system_defined  boolean not null default false,
  active             boolean not null default true,
  sort_order         integer not null default 100,
  created_by         uuid references cmr_users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
drop trigger if exists cmr_field_definitions_updated on cmr_field_definitions;
create trigger cmr_field_definitions_updated before update on cmr_field_definitions for each row execute function cmr_set_updated_at();

create table if not exists cmr_d365_field_mappings (
  id          uuid primary key default gen_random_uuid(),
  field_id    uuid not null unique references cmr_field_definitions(id) on delete cascade,
  entity      text not null,
  property    text not null,
  path        text,
  odata_type  text,
  transform   text not null default 'none',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists cmr_d365_field_mappings_updated on cmr_d365_field_mappings;
create trigger cmr_d365_field_mappings_updated before update on cmr_d365_field_mappings for each row execute function cmr_set_updated_at();

-- ---------------------------------------------------------------------------
-- CMR documents
-- ---------------------------------------------------------------------------
create table if not exists cmr_documents (
  id                       uuid primary key default gen_random_uuid(),
  cmr_number               text unique,
  company                  text not null,
  template_id              uuid references cmr_templates(id),
  template_version_id      uuid references cmr_template_versions(id),
  template_version_number  integer,
  packing_slip_id          text not null,
  sales_order              text,
  customer_account         text,
  customer_ref             text,
  consignee_name           text,
  delivery_place           text,
  taking_over_date         date,
  carrier_name             text,
  vehicle_registration     text,
  incoterms                text,
  total_packages           numeric,
  total_gross_weight_kg    numeric,
  total_volume_m3          numeric,
  status                   text not null default 'DRAFT' check (status in
                           ('DRAFT','PDF_GENERATED','UPLOAD_FAILED','UPLOADED','COMPLETED','CANCELLED')),
  form_values_json         jsonb not null default '{}'::jsonb,
  goods_json               jsonb not null default '[]'::jsonb,
  d365_context_json        jsonb,
  data_mode                text not null default 'live' check (data_mode in ('live','mock')),
  generated_pdf_path       text,
  pdf_sha256               text,
  sharepoint_url           text,
  sharepoint_item_id       text,
  last_error               text,
  cancel_reason            text,
  idempotency_key          text unique,
  created_by               uuid references cmr_users(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  completed_by             uuid references cmr_users(id),
  completed_at             timestamptz,
  cancelled_by             uuid references cmr_users(id),
  cancelled_at             timestamptz
);
drop trigger if exists cmr_documents_updated on cmr_documents;
create trigger cmr_documents_updated before update on cmr_documents for each row execute function cmr_set_updated_at();
-- one valid CMR per packing slip and company (cancel to re-issue)
create unique index if not exists cmr_documents_packing_slip_uq
  on cmr_documents (company, packing_slip_id)
  where status <> 'CANCELLED';
create index if not exists cmr_documents_status_idx  on cmr_documents (status);
create index if not exists cmr_documents_created_idx on cmr_documents (created_at desc);
create index if not exists cmr_documents_so_idx      on cmr_documents (company, sales_order);

create table if not exists cmr_document_values (
  id               uuid primary key default gen_random_uuid(),
  cmr_document_id  uuid not null references cmr_documents(id) on delete cascade,
  field_id         uuid references cmr_field_definitions(id),
  field_name       text not null,
  source_type      text not null,
  value_text       text,
  value_json       jsonb,
  resolved_at      timestamptz not null default now(),
  unique (cmr_document_id, field_name)
);

create table if not exists cmr_process_steps (
  id               uuid primary key default gen_random_uuid(),
  cmr_document_id  uuid not null references cmr_documents(id) on delete cascade,
  step             text not null check (step in ('D365_FETCH','VALIDATE','RENDER','SP_UPLOAD','D365_UPDATE','TEAMS_WEBHOOK','CANCEL')),
  status           text not null check (status in ('STARTED','OK','FAILED')),
  attempt          integer not null default 1,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  duration_ms      integer,
  error            text,
  details          jsonb
);
create index if not exists cmr_process_steps_doc_idx on cmr_process_steps (cmr_document_id, started_at);

create table if not exists cmr_sharepoint_documents (
  id               uuid primary key default gen_random_uuid(),
  cmr_document_id  uuid not null references cmr_documents(id) on delete cascade,
  site_id          text,
  drive_id         text,
  item_id          text,
  folder_path      text,
  file_name        text,
  web_url          text,
  etag             text,
  size_bytes       integer,
  uploaded_at      timestamptz not null default now(),
  uploaded_by      uuid references cmr_users(id)
);

create table if not exists cmr_signatures (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references cmr_users(id) on delete cascade,
  label         text,
  storage_path  text not null unique,
  mime_type     text not null,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists cmr_number_sequences (
  year        integer primary key,
  last_value  bigint not null default 0
);

create table if not exists cmr_app_settings (
  key          text primary key,
  value        jsonb not null,
  description  text,
  updated_by   uuid references cmr_users(id),
  updated_at   timestamptz not null default now()
);

create table if not exists cmr_audit_logs (
  id           bigserial primary key,
  entity_type  text not null,
  entity_id    text,
  action       text not null,
  user_id      uuid,
  user_email   text,
  cmr_number   text,
  details      jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists cmr_audit_logs_entity_idx  on cmr_audit_logs (entity_type, entity_id);
create index if not exists cmr_audit_logs_created_idx on cmr_audit_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: enabled everywhere, no policies (server-only access)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select unnest(array['cmr_users','cmr_roles','cmr_template_assets','cmr_templates','cmr_template_versions',
                               'cmr_field_definitions','cmr_d365_field_mappings','cmr_documents','cmr_document_values',
                               'cmr_process_steps','cmr_sharepoint_documents','cmr_signatures','cmr_number_sequences',
                               'cmr_app_settings','cmr_audit_logs'])
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Storage buckets (private)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('cmr-template-assets', 'cmr-template-assets', false, 20971520, array['application/pdf','image/png','image/jpeg','font/ttf','application/octet-stream']),
  ('cmr-signatures',      'cmr-signatures',      false,  2097152, array['image/png','image/jpeg']),
  ('cmr-generated',       'cmr-generated',       false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Seed: settings
-- ---------------------------------------------------------------------------
insert into cmr_app_settings (key, value, description) values
  ('template.types',            '["CMR"]', 'Available template types'),
  ('cmr.numberFormat',          '"CMR-{company}-{yyyy}-{seq:5}"', 'Default CMR number pattern (company-wise counters)'),
  ('cmr.numberAuthority',       '"app"', 'app – CMR numbers are issued by this app'),
  ('cmr.oneCmrPerPackingSlip', 'true', 'Only one valid CMR per packing slip'),
  ('cmr.defaults',              '{"forwardIncoterms":["EXW","FCA","FAS","FOB"],"defaultPacking":"Pallet","marksPattern":"{CustomerRef}","senderInstructions":"","specialAgreements":"","toBePaidBy":"","establishedPlace":"","companies":[]}', 'CMR prefill defaults'),
  ('d365.connectionSource',     '"coc"', 'coc = use the D365 connection of the COC app; own = CMR-specific connection'),
  ('d365.packingSlipHeaderEntity', '"CustPackingSlipJourBiEntities"', 'Packing slip header entity'),
  ('d365.packingSlipLineEntity',   '"CustPackingSlipTransBiEntities"', 'Packing slip line entity'),
  ('d365.salesOrderEntity',        '"SalesOrderHeadersV2"', 'Sales order header entity'),
  ('sharepoint.rootFolder',     '"CMR"', 'SharePoint root folder'),
  ('sharepoint.folderPattern',  '"{root}/{yyyy}/{company}"', 'Folder pattern'),
  ('sharepoint.fileNamePattern','"{CMRNumber}.pdf"', 'File name pattern'),
  ('signature.required',        'false', 'Sender signature required before issuing'),
  ('teams.enabled',             'false', 'Post issued CMRs to a Teams channel')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Seed: roles
-- ---------------------------------------------------------------------------
insert into cmr_roles (name, description, is_system, capabilities) values
  ('Admin',     'Full access',                                        true, array['viewDashboard','createCmr','completeCmr','viewCmr','viewTemplates','manageTemplates','manageFields','manageSettings','manageUsers','manageSignatures','viewAudit']),
  ('Logistics', 'Issue, cancel and re-issue CMRs; manage signatures', true, array['viewDashboard','createCmr','completeCmr','viewCmr','viewTemplates','manageSignatures','viewAudit']),
  ('Shipping',  'Issue CMRs at the gate',                             true, array['viewDashboard','createCmr','viewCmr','viewTemplates','manageSignatures']),
  ('Viewer',    'Read-only',                                          true, array['viewDashboard','viewCmr'])
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Seed: field definitions – one per CMR box (editable in Admin → Field Definitions)
-- ---------------------------------------------------------------------------
insert into cmr_field_definitions (field_name, display_name, data_type, source_type, category, required, is_system_defined, sort_order, description)
values
  ('CMRNumber',            'CMR number',                         'TEXT',      'SYSTEM', 'System Fields', false, true,  1, 'Issued by the app per company'),
  ('SenderName',           'Box 1 – Sender name',                'TEXT',      'D365FO', 'Box 1–5',       true,  true, 10, 'LegalEntities.Name'),
  ('SenderAddress',        'Box 1 – Sender address',             'MULTILINE', 'D365FO', 'Box 1–5',       true,  true, 11, 'LegalEntities address + VAT'),
  ('ConsigneeName',        'Box 2 – Consignee name',             'TEXT',      'D365FO', 'Box 1–5',       true,  true, 12, 'SalesOrderHeadersV2.DeliveryAddressName'),
  ('ConsigneeAddress',     'Box 2 – Consignee address',          'MULTILINE', 'D365FO', 'Box 1–5',       true,  true, 13, 'Sales order delivery address + customer VAT'),
  ('DeliveryPlace',        'Box 3 – Place of delivery',          'TEXT',      'D365FO', 'Box 1–5',       true,  true, 14, 'Delivery city, country'),
  ('TakingOverPlace',      'Box 4 – Place of taking over',       'TEXT',      'D365FO', 'Box 1–5',       true,  true, 15, 'Shipping warehouse city, country'),
  ('TakingOverDate',       'Box 4 – Date of taking over',        'DATE',      'D365FO', 'Box 1–5',       true,  true, 16, 'Packing slip date'),
  ('DocumentsAttached',    'Box 5 – Documents attached',         'MULTILINE', 'D365FO', 'Box 1–5',       false, true, 17, 'Packing slip + invoice numbers'),
  ('SenderInstructions',   'Box 13 – Sender''s instructions',    'MULTILINE', 'D365FO', 'Box 13–21',     false, true, 30, 'Incoterms, sales order, customer reference'),
  ('CarriagePaid',         'Box 14 – Carriage paid',             'BOOLEAN',   'SYSTEM', 'Box 13–21',     false, true, 31, 'Ticked for Incoterms not listed as "forward"'),
  ('CarriageForward',      'Box 14 – Carriage forward',          'BOOLEAN',   'SYSTEM', 'Box 13–21',     false, true, 32, 'Ticked for EXW/FCA/FAS/FOB (configurable)'),
  ('CashOnDelivery',       'Box 15 – Cash on delivery',          'TEXT',      'MANUAL', 'Box 13–21',     false, true, 33, null),
  ('CarrierName',          'Box 16 – Carrier name',              'TEXT',      'D365FO', 'Box 16–18',     true,  true, 20, 'ShippingCarriers via SalesOrder.ShippingCarrierId'),
  ('CarrierAddress',       'Box 16 – Carrier address',           'MULTILINE', 'D365FO', 'Box 16–18',     false, true, 21, null),
  ('VehicleRegistration',  'Box 16 – Vehicle / trailer reg.',    'TEXT',      'MANUAL', 'Box 16–18',     false, true, 22, null),
  ('SuccessiveCarriers',   'Box 17 – Successive carriers',       'MULTILINE', 'MANUAL', 'Box 16–18',     false, true, 23, null),
  ('CarrierReservations',  'Box 18 – Carrier''s reservations',   'MULTILINE', 'MANUAL', 'Box 16–18',     false, true, 24, null),
  ('SpecialAgreements',    'Box 19 – Special agreements',        'MULTILINE', 'STATIC', 'Box 13–21',     false, true, 34, null),
  ('ToBePaidBy',           'Box 20 – To be paid by',             'MULTILINE', 'STATIC', 'Box 13–21',     false, true, 35, null),
  ('EstablishedPlace',     'Box 21 – Established in',            'TEXT',      'D365FO', 'Box 13–21',     true,  true, 36, null),
  ('EstablishedDate',      'Box 21 – Established on',            'DATE',      'SYSTEM', 'Box 13–21',     true,  true, 37, null),
  ('SenderSignature',      'Box 22 – Sender signature',          'SIGNATURE', 'SIGNATURE','Signatures',  false, true, 40, null),
  ('SenderSignatoryName',  'Box 22 – Signed by',                 'TEXT',      'SYSTEM', 'Signatures',    false, true, 41, null),
  ('CarrierSignature',     'Box 23 – Carrier signature',         'SIGNATURE', 'SIGNATURE','Signatures',  false, true, 42, 'Normally signed on paper at pick-up'),
  ('CarrierSignatoryName', 'Box 23 – Driver name',               'TEXT',      'MANUAL', 'Signatures',    false, true, 43, null),
  ('AdrClass',             'ADR class',                          'TEXT',      'MANUAL', 'Goods 6–12',    false, true, 60, null),
  ('AdrNumber',            'ADR UN number',                      'TEXT',      'MANUAL', 'Goods 6–12',    false, true, 61, null),
  ('AdrLetter',            'ADR letter / packing group',         'TEXT',      'MANUAL', 'Goods 6–12',    false, true, 62, null),
  ('AdrDescription',       'ADR description',                    'TEXT',      'MANUAL', 'Goods 6–12',    false, true, 63, null),
  ('TotalPackages',        'Box 7 – Total packages',             'NUMBER',    'SYSTEM', 'Goods 6–12',    false, true, 64, null),
  ('TotalGrossWeight',     'Box 11 – Total gross weight kg',     'NUMBER',    'SYSTEM', 'Goods 6–12',    false, true, 65, null),
  ('TotalVolume',          'Box 12 – Total volume m³',           'NUMBER',    'SYSTEM', 'Goods 6–12',    false, true, 66, null)
on conflict (field_name) do nothing;

-- goods lines 1–6 × boxes 6–12
insert into cmr_field_definitions (field_name, display_name, data_type, source_type, category, is_system_defined, sort_order)
select 'Goods' || r || c.key, 'Line ' || r || ' – ' || c.label,
       case when c.key in ('Packages','GrossWeight','Volume') then 'NUMBER' else 'TEXT' end,
       'D365FO', 'Goods 6–12', true, 100 + r * 10 + c.ord
from generate_series(1, 6) r,
     (values ('Marks','Box 6 Marks and Nos',1), ('Packages','Box 7 Packages',2), ('Packing','Box 8 Method of packing',3),
             ('Nature','Box 9 Nature of the goods',4), ('StatNo','Box 10 Statistical number',5),
             ('GrossWeight','Box 11 Gross weight kg',6), ('Volume','Box 12 Volume m³',7)) as c(key, label, ord)
on conflict (field_name) do nothing;

insert into cmr_number_sequences (year, last_value) values (extract(year from now())::int, 0)
on conflict do nothing;

alter function public.cmr_set_updated_at() set search_path = public, pg_temp;
alter function public.cmr_template_versions_immutable() set search_path = public, pg_temp;
