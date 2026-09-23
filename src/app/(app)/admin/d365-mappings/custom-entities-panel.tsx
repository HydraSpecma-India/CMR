"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Edit2, FlaskConical, GitMerge, Plus, Trash2, X } from "lucide-react";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Checkbox, Dialog, Field, Input, Select } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import { cn } from "@/lib/utils/cn";
import { MAPPING_SOURCES } from "@/lib/cmr/mapping-sources";
import { isPerLine, slugKey, validateCustomEntities, type CustomEntity, type Relation } from "@/lib/cmr/custom-entities";

type TestResult = {
  perLine: boolean;
  lines: number;
  trace: { filter: string; found: boolean; error?: string }[];
  records: (Record<string, string> | null)[];
};

const emptyRelation = (): Relation => ({ field: "", kind: "record", parent: "header", parentField: "", value: "", valueType: "text", enumType: "" });

/**
 * Admin-defined D365 entities joined to the packing slip by relations, e.g.
 * SalesOrderLines.SalesOrderNumber = Packing slip header.SalesId and LineNumber = Packing slip line.LineNum.
 */
export function CustomEntitiesPanel({
  entities,
  onChange,
  entityNames,
  live,
  company,
  propsFor,
}: {
  entities: CustomEntity[];
  onChange: (list: CustomEntity[]) => void;
  entityNames: Record<string, string>;
  live: boolean;
  company: string;
  propsFor: (key: string) => string[];
}) {
  const [edit, setEdit] = useState<{ index: number; value: CustomEntity } | null>(null);
  const [saving, setSaving] = useState(false);
  const [testPs, setTestPs] = useState("");
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const persist = async (list: CustomEntity[], msg: string) => {
    const errors = validateCustomEntities(list);
    if (errors.length) {
      toast.error("Please correct the relations", errors.join(" "));
      return false;
    }
    setSaving(true);
    try {
      const r = await api<{ entities: CustomEntity[] }>("/api/d365/custom-entities", { method: "PUT", json: { entities: list } });
      onChange(r.entities);
      toast.success(msg);
      return true;
    } catch (e) {
      toast.error("Could not save", (e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openNew = () => {
    setTest(null);
    setTestError(null);
    setEdit({ index: -1, value: { key: "", label: "", entity: "", companyFilter: true, relations: [emptyRelation()], orderBy: "", active: true } });
  };
  const openEdit = (i: number) => {
    setTest(null);
    setTestError(null);
    setEdit({ index: i, value: JSON.parse(JSON.stringify(entities[i])) });
  };

  const draftList = (): CustomEntity[] | null => {
    if (!edit) return null;
    const v = { ...edit.value, key: edit.value.key || slugKey(edit.value.label || edit.value.entity) };
    const list = [...entities];
    if (edit.index < 0) {
      // make the key unique
      let k = v.key;
      let n = 2;
      while (list.some((e) => e.key === k)) k = `${v.key}_${n++}`;
      v.key = k;
      list.push(v);
    } else list[edit.index] = v;
    return list;
  };

  const saveEdit = async () => {
    const list = draftList();
    if (!list) return;
    if (await persist(list, "Custom entity saved")) setEdit(null);
  };

  const remove = (i: number) => {
    const key = entities[i].key;
    const usedBy = entities.filter((e) => e.relations.some((r) => r.parent === key));
    if (usedBy.length) {
      toast.error("Still in use", `${usedBy.map((u) => u.label).join(", ")} relate to this entity.`);
      return;
    }
    void persist(entities.filter((_, j) => j !== i), "Custom entity removed (mappings that use it are ignored)");
  };

  const move = (i: number, d: -1 | 1) => {
    const list = [...entities];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    void persist(list, "Order saved");
  };

  const runTest = async () => {
    const list = draftList();
    if (!list || !edit) return;
    const key = edit.index < 0 ? list[list.length - 1].key : list[edit.index].key;
    setTesting(true);
    setTest(null);
    setTestError(null);
    try {
      const r = await api<TestResult>("/api/d365/custom-entities/test", {
        method: "POST",
        json: { company, packingSlipId: testPs.trim(), entities: list, key },
      });
      setTest(r);
    } catch (e) {
      setTestError((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const v = edit?.value;
  const set = (patch: Partial<CustomEntity>) => edit && setEdit({ ...edit, value: { ...edit.value, ...patch } });
  const setRel = (i: number, patch: Partial<Relation>) =>
    v && set({ relations: v.relations.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  // records a relation may point to: built-in + custom entities listed above the one being edited
  const parentOptions = (): { key: string; label: string }[] => {
    const upto = edit && edit.index >= 0 ? entities.slice(0, edit.index) : entities;
    return [
      ...MAPPING_SOURCES.map((s) => ({ key: s.key as string, label: `${s.label} (${entityNames[s.key]})` })),
      ...upto.map((c) => ({ key: c.key, label: `${c.label} (${c.entity}, custom)` })),
    ];
  };

  return (
    <Card>
      <CardHeader
        title="Custom D365 entities (relations)"
        description="Add any D365 OData entity and define how it relates to the packing slip records. Its fields can then be mapped to CMR fields below. Entities are loaded top to bottom, so an entity can relate to one listed above it."
        actions={
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4" /> Add entity
          </Button>
        }
      />
      <CardBody className="space-y-2">
        {!entities.length && <p className="text-sm text-ink-500">No custom entities yet.</p>}
        {entities.map((ce, i) => (
          <div key={ce.key} className={cn("flex flex-wrap items-start justify-between gap-3 rounded-md border border-ink-200 p-3", !ce.active && "opacity-60")}>
            <div className="min-w-0 text-xs">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <GitMerge className="h-4 w-4 text-sky-700" />
                <span className="font-semibold text-ink-900">{ce.label}</span>
                <span className="font-mono text-ink-600">{ce.entity}</span>
                <Badge tone={isPerLine(ce, entities) ? "info" : "brand"}>{isPerLine(ce, entities) ? "per goods line" : "per packing slip"}</Badge>
                {!ce.active && <Badge tone="neutral">inactive</Badge>}
                <span className="font-mono text-[11px] text-ink-400">{ce.key}</span>
              </div>
              <div className="mt-1 space-y-0.5 font-mono text-[11px] text-ink-700">
                {ce.companyFilter && <div>dataAreaId = company</div>}
                {ce.relations.map((r, j) => (
                  <div key={j}>
                    {r.field} ={" "}
                    {r.kind === "value" ? (
                      <span className="text-amber-800">“{r.value}”</span>
                    ) : (
                      <span className="text-sky-800">
                        {parentOptions().find((p) => p.key === r.parent)?.label.replace(/ \(.*/, "") ?? r.parent}.{r.parentField}
                      </span>
                    )}
                  </div>
                ))}
                {ce.orderBy && <div className="text-ink-500">order by {ce.orderBy} (first record is used)</div>}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="icon" variant="ghost" title="Move up" onClick={() => move(i, -1)} disabled={saving || i === 0}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" title="Move down" onClick={() => move(i, 1)} disabled={saving || i === entities.length - 1}>
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => openEdit(i)}>
                <Edit2 className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button size="icon" variant="ghost" title="Delete" onClick={() => remove(i)} disabled={saving}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardBody>

      <Dialog
        open={Boolean(edit)}
        onClose={() => setEdit(null)}
        width="max-w-3xl"
        title={edit && edit.index >= 0 ? `Edit custom entity – ${edit.value.label}` : "Add custom D365 entity"}
        footer={
          <>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
            <Button onClick={() => void saveEdit()} loading={saving} disabled={!v?.label.trim() || !v?.entity.trim()}>
              Save entity
            </Button>
          </>
        }
      >
        {v && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" hint="Shown in the mapping list">
                <Input value={v.label} onChange={(e) => set({ label: e.target.value })} placeholder="Sales order line" autoFocus />
              </Field>
              <Field label="D365 OData entity" hint="Public collection name, e.g. SalesOrderLines">
                <Input value={v.entity} onChange={(e) => set({ entity: e.target.value.trim() })} placeholder="SalesOrderLines" className="font-mono" />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-5">
              <Checkbox label="Filter by company (dataAreaId)" checked={v.companyFilter} onChange={(e) => set({ companyFilter: e.target.checked })} />
              <Checkbox label="Active" checked={v.active} onChange={(e) => set({ active: e.target.checked })} />
              <label className="flex items-center gap-2 text-xs text-ink-700">
                Order by
                <Input className="h-8 w-44 font-mono text-xs" value={v.orderBy ?? ""} onChange={(e) => set({ orderBy: e.target.value })} placeholder="e.g. InvoiceDate desc" />
              </label>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <div className="text-xs font-semibold text-ink-800">Relations (all must match)</div>
                <Button size="sm" variant="outline" onClick={() => set({ relations: [...v.relations, emptyRelation()] })} disabled={v.relations.length >= 6}>
                  <Plus className="h-3.5 w-3.5" /> Relation
                </Button>
              </div>
              <div className="space-y-2">
                {v.relations.map((r, i) => (
                  <div key={i} className="grid items-end gap-2 rounded border border-ink-200 p-2 sm:grid-cols-[1fr_auto_1.4fr_1fr_auto_auto]">
                    <Field label={`${v.entity || "Entity"} field`}>
                      <Input className="font-mono text-xs" value={r.field} onChange={(e) => setRel(i, { field: e.target.value.trim() })} placeholder="SalesOrderNumber" />
                    </Field>
                    <div className="pb-2 text-center text-sm font-semibold text-ink-500">=</div>
                    <Field label="Related record">
                      <Select
                        className="text-xs"
                        value={r.kind === "value" ? "__value" : r.parent}
                        onChange={(e) =>
                          e.target.value === "__value" ? setRel(i, { kind: "value" }) : setRel(i, { kind: "record", parent: e.target.value })
                        }
                      >
                        {parentOptions().map((p) => (
                          <option key={p.key} value={p.key}>{p.label}</option>
                        ))}
                        <option value="__value">Fixed value…</option>
                      </Select>
                    </Field>
                    {r.kind === "value" ? (
                      <Field label="Value">
                        <Input className="font-mono text-xs" value={r.value ?? ""} onChange={(e) => setRel(i, { value: e.target.value })} placeholder="e.g. Delivery" />
                      </Field>
                    ) : (
                      <Field label="Field of related record">
                        <Input
                          className="font-mono text-xs"
                          list={`parent-props-${i}`}
                          value={r.parentField ?? ""}
                          onChange={(e) => setRel(i, { parentField: e.target.value.trim() })}
                          placeholder="SalesId"
                        />
                        <datalist id={`parent-props-${i}`}>
                          {propsFor(r.parent ?? "").map((p) => (
                            <option key={p} value={p} />
                          ))}
                        </datalist>
                      </Field>
                    )}
                    <Field label="Type">
                      <Select className="w-24 text-xs" value={r.valueType} onChange={(e) => setRel(i, { valueType: e.target.value as Relation["valueType"] })}>
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                        <option value="enum">Enum</option>
                      </Select>
                    </Field>
                    <Button size="icon" variant="ghost" title="Remove relation" onClick={() => set({ relations: v.relations.filter((_, j) => j !== i) })} disabled={v.relations.length <= 1}>
                      <X className="h-4 w-4" />
                    </Button>
                    {r.valueType === "enum" && (
                      <div className="sm:col-span-6">
                        <Field label="Enum type" hint="as in the OData metadata">
                          <Input className="font-mono text-xs" value={r.enumType ?? ""} onChange={(e) => setRel(i, { enumType: e.target.value.trim() })} placeholder="Microsoft.Dynamics.DataEntities.NoYes" />
                        </Field>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-ink-500">
                Relating to <b>Packing slip line</b> or <b>Released product</b> makes this entity load once per goods line; its fields can then be mapped to the goods columns (boxes 6–12).
              </p>
            </div>

            <div className="rounded border border-ink-200 bg-ink-50 p-3">
              <div className="mb-2 flex flex-wrap items-end gap-2">
                <Field label={`Test with a packing slip of ${company || "the company"}`}>
                  <Input className="w-48 font-mono text-xs" value={testPs} onChange={(e) => setTestPs(e.target.value)} placeholder="e.g. D-10099713" />
                </Field>
                <Button variant="outline" onClick={() => void runTest()} loading={testing} disabled={!live || !testPs.trim() || !v.entity}>
                  <FlaskConical className="h-4 w-4" /> Test relations
                </Button>
                {!live && <span className="text-xs text-amber-700">Testing needs D365 in live mode.</span>}
              </div>
              {testError && <Alert tone="danger" title="Test failed">{testError}</Alert>}
              {test && (
                <div className="space-y-2 text-xs">
                  {test.trace.slice(0, 6).map((t, i) => (
                    <div key={i} className="font-mono">
                      <Badge tone={t.found ? "success" : t.error ? "danger" : "warning"}>{t.found ? "found" : t.error ? "error" : "no record"}</Badge>{" "}
                      <span className="text-ink-700">{t.filter || "—"}</span>
                      {t.error && <div className="mt-0.5 whitespace-pre-wrap text-red-700">{t.error}</div>}
                    </div>
                  ))}
                  {test.records.filter(Boolean).slice(0, 1).map((rec, i) => (
                    <div key={i} className="max-h-64 overflow-auto rounded border border-ink-200 bg-white">
                      <table className="w-full font-mono text-[11px]">
                        <tbody>
                          {Object.entries(rec!).map(([k, val]) => (
                            <tr key={k} className="border-b border-ink-100">
                              <td className="px-2 py-0.5 font-semibold text-ink-700">{k}</td>
                              <td className="px-2 py-0.5 text-ink-900">{val}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                  {test.perLine && <div className="text-ink-500">Per goods line: {test.lines} line(s); first record shown.</div>}
                </div>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </Card>
  );
}
