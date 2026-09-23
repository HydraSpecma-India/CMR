"use client";

import { useMemo, useState } from "react";
import { Database, Edit2, Link2, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Card, CardBody, Checkbox, Dialog, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import type { D365MappingRow, FieldDefinitionRow } from "@/lib/db/repositories/fields";
import { GOODS_FIELD_RE, MAPPING_SOURCES, TRANSFORMS, resolveSourceKey, type MappingSourceKey } from "@/lib/cmr/mapping-sources";

type Probe = { key: string; label: string; entity: string; ok: boolean; count: number; fields: string[]; error?: string };

interface FormState {
  id?: string;
  field_id: string;
  entity: MappingSourceKey;
  property: string;
  path: string;
  transform: string;
  active: boolean;
}

export function MappingsClient({
  initialMappings,
  fields,
  entityNames,
  live,
  defaultCompany,
  dbError,
}: {
  initialMappings: D365MappingRow[];
  fields: FieldDefinitionRow[];
  entityNames: Record<string, string>;
  live: boolean;
  defaultCompany: string;
  dbError: string | null;
}) {
  const [mappings, setMappings] = useState<D365MappingRow[]>(initialMappings);
  const [onlyD365, setOnlyD365] = useState(true);
  const [hideGoodsRows, setHideGoodsRows] = useState(true);
  const [q, setQ] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [probe, setProbe] = useState<Probe[] | null>(null);
  const [probing, setProbing] = useState(false);
  const [company, setCompany] = useState(defaultCompany);

  const names = useMemo(
    () => Object.fromEntries(MAPPING_SOURCES.map((s) => [s.configKey, entityNames[s.key]])),
    [entityNames],
  );
  const byField = useMemo(() => new Map(mappings.map((m) => [m.field_id, m])), [mappings]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return fields
      .filter((f) => !onlyD365 || f.source_type === "D365FO" || byField.has(f.id))
      // goods rows 2–6 behave like row 1 (a mapping on any row applies to the whole column)
      .filter((f) => !hideGoodsRows || !/^Goods[2-9]/.test(f.field_name) || byField.has(f.id))
      .filter((f) => !needle || `${f.field_name} ${f.display_name} ${f.description ?? ""}`.toLowerCase().includes(needle));
  }, [fields, onlyD365, hideGoodsRows, q, byField]);

  const isGoods = (fieldName: string) => GOODS_FIELD_RE.test(fieldName);

  const openFor = (f: FieldDefinitionRow) => {
    const m = byField.get(f.id);
    setForm({
      id: m?.id,
      field_id: f.id,
      entity: (m && resolveSourceKey(m.entity, names)) || (isGoods(f.field_name) ? "line" : "salesOrder"),
      property: m?.property ?? "",
      path: m?.path ?? "",
      transform: m?.transform ?? "none",
      active: m?.active ?? true,
    });
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await api<{ mapping: D365MappingRow }>("/api/d365-mappings", {
        method: "PUT",
        json: { ...form, path: form.path || undefined },
      });
      setMappings((cur) => [...cur.filter((m) => m.field_id !== res.mapping.field_id), res.mapping]);
      toast.success("Mapping saved", "Used for the next packing slip that is opened.");
      setForm(null);
    } catch (e) {
      toast.error("Could not save the mapping", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (m: D365MappingRow) => {
    try {
      await api(`/api/d365-mappings?id=${m.id}`, { method: "DELETE" });
      setMappings((cur) => cur.filter((x) => x.id !== m.id));
      toast.success("Custom mapping removed", "The built-in mapping is used again.");
    } catch (e) {
      toast.error("Could not remove the mapping", (e as Error).message);
    }
  };

  const loadProbe = async () => {
    setProbing(true);
    try {
      const r = await api<{ mode: string; results: Probe[] }>(`/api/d365/probe?company=${encodeURIComponent(company)}`);
      if (r.mode !== "live") toast.info("D365 is in mock mode", "Switch to live mode to read the property names.");
      setProbe(r.results);
    } catch (e) {
      toast.error("Could not read D365 properties", (e as Error).message);
    } finally {
      setProbing(false);
    }
  };

  const propsFor = (key: string) => probe?.find((p) => p.key === key)?.fields ?? [];
  const selectedField = form ? fields.find((f) => f.id === form.field_id) : null;
  const sourceOptions = MAPPING_SOURCES.filter((s) => (selectedField && isGoods(selectedField.field_name) ? true : !s.perLine));

  return (
    <div className="w-full space-y-5 pb-16">
      <PageHeader
        title="D365FO Field Mapping"
        description="Every CMR field that is filled from D365. Fields without a custom mapping use the built-in mapping shown in the column “Built-in source”. Add a custom mapping to read a field from another D365 property."
      />

      {dbError && <Alert tone="danger" title="Supabase is not reachable">{dbError}</Alert>}

      <Card>
        <CardBody className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto_auto_auto] lg:items-end">
          <Field label="Search fields">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-400" />
              <Input className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Consignee, Carrier, Goods…" />
            </div>
          </Field>
          <Checkbox label="Only D365FO fields" checked={onlyD365} onChange={(e) => setOnlyD365(e.target.checked)} />
          <Checkbox label="Goods: show row 1 only" checked={hideGoodsRows} onChange={(e) => setHideGoodsRows(e.target.checked)} />
          <div className="flex items-end gap-2">
            <Field label="Company for property lookup">
              <Input className="w-28" value={company} onChange={(e) => setCompany(e.target.value.toUpperCase())} placeholder="HSDK" />
            </Field>
            <Button variant="outline" onClick={() => void loadProbe()} loading={probing} disabled={!live} title={live ? "Read one record of every entity to list its properties" : "D365 is in mock mode"}>
              <RefreshCw className="h-4 w-4" /> Load D365 properties
            </Button>
          </div>
        </CardBody>
      </Card>

      {probe && (
        <Card>
          <CardBody className="grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-3">
            {probe.map((p) => (
              <div key={p.key} className="rounded border border-ink-200 p-2">
                <div className="flex items-center gap-1.5 font-semibold text-ink-800">
                  <Database className="h-3.5 w-3.5" /> {p.label}
                  <Badge tone={p.ok && p.count ? "success" : p.ok ? "warning" : "danger"}>{p.ok ? `${p.fields.length} properties` : "error"}</Badge>
                </div>
                <div className="font-mono text-[11px] text-ink-500">{p.entity}</div>
                {p.error && <div className="mt-1 text-red-700">{p.error}</div>}
                {p.ok && !p.count && <div className="mt-1 text-amber-700">No record found for {company} – properties unknown.</div>}
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>CMR field</Th>
              <Th>Built-in source</Th>
              <Th>Custom mapping</Th>
              <Th>Status</Th>
              <Th className="text-right"> </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
              const m = byField.get(f.id);
              const key = m ? resolveSourceKey(m.entity, names) : null;
              const src = MAPPING_SOURCES.find((s) => s.key === key);
              return (
                <tr key={f.id} className="hover:bg-ink-50">
                  <Td>
                    <div className="font-medium text-ink-900">{f.display_name}</div>
                    <div className="font-mono text-[11px] text-ink-500">
                      {f.field_name}
                      {isGoods(f.field_name) && <span className="ml-1 font-sans text-ink-400">(applies to every goods line)</span>}
                    </div>
                  </Td>
                  <Td className="text-xs text-ink-600">{f.source_type === "D365FO" ? f.description || "Built-in D365 logic" : <Badge tone="neutral">{f.source_type}</Badge>}</Td>
                  <Td>
                    {m ? (
                      <div className="text-xs">
                        <Badge tone="brand">{src?.label ?? m.entity}</Badge>
                        <div className="mt-0.5 font-mono font-semibold text-ink-800">
                          {m.property}
                          {m.path ? `.${m.path}` : ""}
                        </div>
                        {m.transform !== "none" && <div className="text-ink-500">{TRANSFORMS.find((t) => t.value === m.transform)?.label ?? m.transform}</div>}
                      </div>
                    ) : (
                      <span className="text-xs text-ink-400">— built-in —</span>
                    )}
                  </Td>
                  <Td>{m ? <Badge tone={m.active ? "success" : "neutral"}>{m.active ? "Custom" : "Inactive"}</Badge> : <Badge tone="info">Built-in</Badge>}</Td>
                  <Td className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="sm" onClick={() => openFor(f)}>
                      {m ? <Edit2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      {m ? "Edit" : "Map"}
                    </Button>
                    {m && (
                      <Button variant="ghost" size="sm" onClick={() => void remove(m)} title="Remove the custom mapping">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </Td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-500">
                  No fields match. Clear the filters or add fields in Admin → Field Definitions.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>

      <Dialog
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={`D365 mapping – ${selectedField?.display_name ?? ""}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
            <Button onClick={() => void save()} loading={saving} disabled={!form?.property.trim()}>
              <Link2 className="h-4 w-4" /> Save mapping
            </Button>
          </>
        }
      >
        {form && selectedField && (
          <div className="space-y-4">
            <p className="text-xs text-ink-500">
              Built-in: {selectedField.description || "D365 logic in the app"}. The custom mapping replaces it; clear the value in the CMR
              wizard if D365 is empty for a packing slip.
            </p>
            <Field label="D365 record">
              <Select value={form.entity} onChange={(e) => setForm({ ...form, entity: e.target.value as MappingSourceKey })}>
                {sourceOptions.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label} – {entityNames[s.key]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="OData property">
                <Input
                  list="d365-props"
                  value={form.property}
                  onChange={(e) => setForm({ ...form, property: e.target.value })}
                  placeholder={propsFor(form.entity).length ? "Pick or type…" : "e.g. DeliveryAddressCity"}
                  autoFocus
                />
                <datalist id="d365-props">
                  {propsFor(form.entity).map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </Field>
              <Field label="Nested path" hint="Optional, e.g. Address.City">
                <Input value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Transform">
                <Select value={form.transform} onChange={(e) => setForm({ ...form, transform: e.target.value })}>
                  {TRANSFORMS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-end pb-2">
                <Checkbox label="Active" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              </div>
            </div>
            {!probe && live && <p className="text-[11px] text-ink-500">Tip: “Load D365 properties” lists the real property names to pick from.</p>}
          </div>
        )}
      </Dialog>
    </div>
  );
}
