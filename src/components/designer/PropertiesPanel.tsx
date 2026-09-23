"use client";

import { useRef, useState } from "react";
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignCenterVertical, AlignEndVertical, Lock, Unlock, Eye, EyeOff, Trash2, Copy, ArrowUpToLine, ArrowDownToLine, Upload, Plus, Minus } from "lucide-react";
import { FORM_LANGUAGES } from "@/lib/cmr/i18n";
import { useDesigner, useSelectedElements } from "./store";
import type { TemplateElement, TextStyle } from "@/lib/template/schema";
import { cn } from "@/lib/utils/cn";
import { api } from "@/lib/utils/fetcher";
import { toast } from "@/components/ui/toast";

const FONTS = ["Helvetica", "Times-Roman", "Courier"];

/* ── tiny inputs tuned for a dense panel ── */
function Num({ label, value, onChange, step = 1, min, max, suffix }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string }) {
  const [local, setLocal] = useState(String(value));
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setLocal(String(Math.round(value * 100) / 100));
  }
  const commit = () => {
    const n = parseFloat(local);
    if (!Number.isNaN(n) && n !== value) onChange(min !== undefined && n < min ? min : max !== undefined && n > max ? max : n);
    else setLocal(String(Math.round(value * 100) / 100));
  };
  return (
    <label className="flex items-center gap-1 text-xs text-ink-600">
      <span className="w-7 shrink-0">{label}</span>
      <input
        type="number"
        step={step}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="h-7 w-full min-w-0 rounded border border-ink-300 px-1.5 text-xs text-ink-900 focus:border-brand-500 focus:outline-none"
      />
      {suffix && <span className="text-ink-400">{suffix}</span>}
    </label>
  );
}
function Txt({ label, value, onChange, placeholder, multiline }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  const [local, setLocal] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setLocal(value);
  }
  const cls = "w-full rounded border border-ink-300 px-1.5 text-xs text-ink-900 focus:border-brand-500 focus:outline-none";
  return (
    <label className="block text-xs text-ink-600">
      <span className="mb-0.5 block">{label}</span>
      {multiline ? (
        <textarea value={local} placeholder={placeholder} onChange={(e) => setLocal(e.target.value)} onBlur={() => local !== value && onChange(local)} className={cn(cls, "min-h-16 py-1")} />
      ) : (
        <input value={local} placeholder={placeholder} onChange={(e) => setLocal(e.target.value)} onBlur={() => local !== value && onChange(local)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className={cn(cls, "h-7")} />
      )}
    </label>
  );
}
function Sel({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="block text-xs text-ink-600">
      <span className="mb-0.5 block">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-full rounded border border-ink-300 bg-white px-1 text-xs text-ink-900 focus:border-brand-500 focus:outline-none">
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
function Chk({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-ink-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5 accent-ink-900" />
      {label}
    </label>
  );
}
function Color({ label, value, onChange, allowNone }: { label: string; value: string | null | undefined; onChange: (v: string | null) => void; allowNone?: boolean }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-ink-600">
      <span className="w-14 shrink-0">{label}</span>
      <input type="color" value={value ?? "#ffffff"} onChange={(e) => onChange(e.target.value)} className="h-6 w-8 cursor-pointer rounded border border-ink-300 p-0" />
      {allowNone && (
        <button type="button" onClick={() => onChange(null)} className={cn("rounded border px-1.5 py-0.5 text-[10px]", value == null ? "border-ink-900 bg-ink-900 text-white" : "border-ink-300")}>none</button>
      )}
    </label>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-ink-200 px-3 py-2.5">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">{title}</div>
      <div className="grid gap-2">{children}</div>
    </div>
  );
}
function IconToggle({ on, onClick, title, children }: { on: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick} className={cn("flex h-7 w-7 items-center justify-center rounded border", on ? "border-ink-900 bg-ink-900 text-white" : "border-ink-300 text-ink-600 hover:bg-ink-50")}>
      {children}
    </button>
  );
}

export function PropertiesPanel() {
  const selected = useSelectedElements();
  const fields = useDesigner((s) => s.fields);
  const readOnly = useDesigner((s) => s.readOnly);
  const { updateElement, updateElements, removeSelected, duplicateSelected, reorder } = useDesigner.getState();

  if (readOnly) {
    return (
      <aside className="w-72 shrink-0 border-l border-ink-200 bg-white p-4 text-xs text-ink-500">
        This version is {" "}<b>read-only</b>. Create a new version from the template page to make changes.
        {selected.length === 1 && <pre className="mt-3 max-h-96 overflow-auto rounded bg-ink-50 p-2 text-[10px]">{JSON.stringify(selected[0], null, 1)}</pre>}
      </aside>
    );
  }

  if (selected.length === 0) return <TemplateProperties />;

  if (selected.length > 1) {
    return (
      <aside className="w-72 shrink-0 overflow-y-auto border-l border-ink-200 bg-white">
        <Section title={`${selected.length} elements selected`}>
          <div className="flex gap-1">
            <button className="flex-1 rounded border border-ink-300 px-2 py-1 text-xs hover:bg-ink-50" onClick={duplicateSelected}><Copy className="mr-1 inline h-3 w-3" />Duplicate</button>
            <button className="flex-1 rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50" onClick={removeSelected}><Trash2 className="mr-1 inline h-3 w-3" />Delete</button>
          </div>
          <p className="text-[11px] text-ink-500">Use the alignment tools in the toolbar. Shared style changes:</p>
          {selected.every((e) => "style" in e && e.type !== "checkbox") && (
            <Num label="Size" value={(selected[0] as { style: TextStyle }).style.fontSize} step={0.5} min={4} onChange={(v) => updateElements(selected.map((e) => e.id), { style: { fontSize: v } })} suffix="pt" />
          )}
        </Section>
      </aside>
    );
  }

  const el = selected[0];
  const set = (patch: Record<string, unknown>) => updateElement(el.id, patch);
  const setStyle = (patch: Partial<TextStyle>) => set({ style: patch });
  const def = "fieldName" in el && el.fieldName ? fields.find((f) => f.field_name === el.fieldName) : undefined;
  const hasText = el.type === "text" || el.type === "field" || el.type === "table";
  const style = hasText ? (el as { style: TextStyle }).style : null;

  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-l border-ink-200 bg-white">
      <div className="flex items-center justify-between border-b border-ink-200 px-3 py-2">
        <div>
          <div className="text-xs font-semibold capitalize text-ink-900">{el.type}{el.name ? ` · ${el.name}` : ""}</div>
          <div className="text-[10px] text-ink-400">{el.id}</div>
        </div>
        <div className="flex gap-0.5">
          <IconToggle on={el.locked} onClick={() => set({ locked: !el.locked })} title={el.locked ? "Unlock" : "Lock"}>{el.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}</IconToggle>
          <IconToggle on={el.hidden} onClick={() => set({ hidden: !el.hidden })} title={el.hidden ? "Show" : "Hide"}>{el.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</IconToggle>
          <IconToggle on={false} onClick={duplicateSelected} title="Duplicate (Ctrl+D)"><Copy className="h-3.5 w-3.5" /></IconToggle>
          <IconToggle on={false} onClick={removeSelected} title="Delete"><Trash2 className="h-3.5 w-3.5 text-red-600" /></IconToggle>
        </div>
      </div>

      <Section title="Position & size">
        <div className="grid grid-cols-2 gap-2">
          <Num label="X" value={el.x} onChange={(v) => set({ x: v })} step={0.5} />
          <Num label="Y" value={el.y} onChange={(v) => set({ y: v })} step={0.5} />
          <Num label="W" value={el.width} onChange={(v) => set({ width: v })} step={0.5} min={0} />
          <Num label="H" value={el.height} onChange={(v) => set({ height: v })} step={0.5} min={0} />
          <Num label="Rot" value={el.rotation} onChange={(v) => set({ rotation: v })} suffix="°" />
          <Num label="Op" value={el.opacity} onChange={(v) => set({ opacity: v })} step={0.05} min={0} max={1} />
        </div>
        <div className="flex gap-1">
          <button className="flex-1 rounded border border-ink-300 py-1 text-[11px] hover:bg-ink-50" onClick={() => reorder(el.id, "front")}><ArrowUpToLine className="mr-1 inline h-3 w-3" />To front</button>
          <button className="flex-1 rounded border border-ink-300 py-1 text-[11px] hover:bg-ink-50" onClick={() => reorder(el.id, "back")}><ArrowDownToLine className="mr-1 inline h-3 w-3" />To back</button>
        </div>
        <Txt label="Name (designer only)" value={el.name ?? ""} onChange={(v) => set({ name: v || undefined })} />
      </Section>

      {el.type === "text" && (
        <Section title="Text">
          <Txt label="Content" value={el.text} onChange={(v) => set({ text: v })} multiline />
          <Color label="Background" value={el.background ?? null} onChange={(v) => set({ background: v })} allowNone />
          <BorderProps border={el.border} onChange={(b) => set({ border: b })} />
        </Section>
      )}

      {(el.type === "field" || el.type === "signature" || el.type === "checkbox") && (
        <Section title="Field source">
          <FieldPicker value={"fieldName" in el ? el.fieldName ?? "" : ""} onChange={(v) => set({ fieldName: v || undefined })} allow={el.type === "signature" ? ["SIGNATURE"] : el.type === "checkbox" ? ["BOOLEAN"] : undefined} />
          {def ? (
            <div className="rounded bg-ink-50 p-2 text-[11px] text-ink-600">
              <div><b>Source:</b> {def.source_type} · <b>Type:</b> {def.data_type}</div>
              <div><b>Technical:</b> {def.field_name}</div>
              {def.unit && <div><b>Unit:</b> {def.unit}</div>}
              {def.source_type === "D365FO" && <div className="text-blue-700">Value retrieved from D365FO</div>}
              {def.source_type === "MANUAL" && <div className="text-amber-700">Manual entry during CMR creation</div>}
              {def.source_type === "SYSTEM" && <div className="text-violet-700">System generated ({String(def.config_json?.systemKey ?? "")})</div>}
            </div>
          ) : (
            "fieldName" in el && el.fieldName && <div className="rounded bg-amber-50 p-2 text-[11px] text-amber-800">No field definition named “{el.fieldName}”. Create it under Admin → Field Definitions or pick another.</div>
          )}
          {el.type !== "checkbox" && (
            <>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <Chk label="Required" checked={el.binding.required ?? def?.required ?? false} onChange={(v) => set({ binding: { required: v } })} />
                <Chk label="Read-only" checked={el.binding.readOnly ?? def?.read_only ?? false} onChange={(v) => set({ binding: { readOnly: v } })} />
                <Chk label="Allow override" checked={el.binding.allowOverride ?? def?.allow_override ?? false} onChange={(v) => set({ binding: { allowOverride: v } })} />
                {el.type === "field" && <Chk label="Show label" checked={el.binding.showLabel ?? false} onChange={(v) => set({ binding: { showLabel: v } })} />}
              </div>
              <Txt label="Default value" value={el.binding.defaultValue ?? ""} onChange={(v) => set({ binding: { defaultValue: v || undefined } })} placeholder={def?.default_value ?? ""} />
              {el.type === "field" && <Txt label="Format" value={el.binding.format ?? ""} onChange={(v) => set({ binding: { format: v || undefined } })} placeholder={def?.data_type === "DATE" ? "yyyy-MM-dd" : def?.data_type === "NUMBER" ? "0.00" : ""} />}
              {el.type === "field" && <Txt label="Label" value={el.binding.label ?? ""} onChange={(v) => set({ binding: { label: v || undefined } })} placeholder={def?.display_name} />}
            </>
          )}
          {el.type === "checkbox" && <Chk label="Checked (static)" checked={el.checked} onChange={(v) => set({ checked: v })} />}
        </Section>
      )}

      {el.type === "field" && (
        <Section title="Box">
          <Color label="Background" value={el.background ?? null} onChange={(v) => set({ background: v })} allowNone />
          <BorderProps border={el.border} onChange={(b) => set({ border: b })} />
        </Section>
      )}

      {style && (
        <Section title="Typography">
          <Sel label="Font" value={style.fontFamily} onChange={(v) => setStyle({ fontFamily: v })} options={FONTS.map((f) => ({ value: f, label: f }))} />
          <div className="grid grid-cols-2 gap-2">
            <Num label="Size" value={style.fontSize} onChange={(v) => setStyle({ fontSize: v })} step={0.5} min={4} max={96} />
            <Num label="Line" value={style.lineHeight} onChange={(v) => setStyle({ lineHeight: v })} step={0.1} min={0.8} max={3} />
          </div>
          <div className="flex gap-1">
            <IconToggle on={style.bold} onClick={() => setStyle({ bold: !style.bold })} title="Bold"><Bold className="h-3.5 w-3.5" /></IconToggle>
            <IconToggle on={style.italic} onClick={() => setStyle({ italic: !style.italic })} title="Italic"><Italic className="h-3.5 w-3.5" /></IconToggle>
            <IconToggle on={style.underline} onClick={() => setStyle({ underline: !style.underline })} title="Underline"><Underline className="h-3.5 w-3.5" /></IconToggle>
            <span className="w-2" />
            <IconToggle on={style.align === "left"} onClick={() => setStyle({ align: "left" })} title="Align left"><AlignLeft className="h-3.5 w-3.5" /></IconToggle>
            <IconToggle on={style.align === "center"} onClick={() => setStyle({ align: "center" })} title="Align center"><AlignCenter className="h-3.5 w-3.5" /></IconToggle>
            <IconToggle on={style.align === "right"} onClick={() => setStyle({ align: "right" })} title="Align right"><AlignRight className="h-3.5 w-3.5" /></IconToggle>
          </div>
          <div className="flex gap-1">
            <IconToggle on={style.valign === "top"} onClick={() => setStyle({ valign: "top" })} title="Top"><AlignStartVertical className="h-3.5 w-3.5" /></IconToggle>
            <IconToggle on={style.valign === "middle"} onClick={() => setStyle({ valign: "middle" })} title="Middle"><AlignCenterVertical className="h-3.5 w-3.5" /></IconToggle>
            <IconToggle on={style.valign === "bottom"} onClick={() => setStyle({ valign: "bottom" })} title="Bottom"><AlignEndVertical className="h-3.5 w-3.5" /></IconToggle>
            <span className="w-2" />
            <Color label="Color" value={style.color} onChange={(v) => setStyle({ color: v ?? "#000000" })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Num label="Pad" value={style.padding} onChange={(v) => setStyle({ padding: v })} step={0.5} min={0} />
            <Num label="Spc" value={style.letterSpacing} onChange={(v) => setStyle({ letterSpacing: v })} step={0.1} />
          </div>
          <div className="flex items-center gap-3">
            <Chk label="Wrap" checked={style.wrap} onChange={(v) => setStyle({ wrap: v })} />
            <Sel label="" value={style.overflow} onChange={(v) => setStyle({ overflow: v as TextStyle["overflow"] })} options={[{ value: "shrink", label: "Shrink to fit" }, { value: "clip", label: "Clip" }, { value: "grow", label: "Grow" }]} />
          </div>
        </Section>
      )}

      {el.type === "image" && <ImageProps el={el} set={set} />}

      {el.type === "signature" && (
        <Section title="Box">
          <BorderProps border={el.border} onChange={(b) => set({ border: b })} />
        </Section>
      )}

      {el.type === "line" && (
        <Section title="Line">
          <Color label="Color" value={el.stroke.color} onChange={(v) => set({ stroke: { color: v ?? "#000" } })} />
          <div className="flex items-center gap-1.5 text-[11px] text-ink-500">
            <span>Preset:</span>
            {["#000000", "#334155", "#64748b", "#cbd5e1", "#2563eb"].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set({ stroke: { color: c } })}
                className="h-4 w-4 rounded-full border border-ink-300"
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
          <Num label="Width" value={el.stroke.width} onChange={(v) => set({ stroke: { width: v } })} step={0.25} min={0} suffix="pt" />
          <div className="flex items-center gap-1 pt-0.5">
            {[0.5, 0.75, 1, 1.5, 2].map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => set({ stroke: { width: w } })}
                className={cn(
                  "flex-1 rounded border py-0.5 text-[10px] font-mono transition-colors",
                  el.stroke.width === w ? "border-ink-900 bg-ink-900 text-white font-bold" : "border-ink-200 text-ink-600 hover:bg-ink-50"
                )}
              >
                {w}pt
              </button>
            ))}
          </div>
          <Sel label="Style" value={el.stroke.dash?.length ? "dashed" : "solid"} onChange={(v) => set({ stroke: { dash: v === "dashed" ? [4, 2] : undefined } })} options={[{ value: "solid", label: "Solid" }, { value: "dashed", label: "Dashed" }]} />
          <p className="text-[10px] text-ink-400">Tip: set H = 0 for a horizontal line, W = 0 for vertical.</p>
        </Section>
      )}

      {el.type === "rect" && (
        <Section title="Rectangle">
          <Color label="Border" value={el.stroke.color} onChange={(v) => set({ stroke: { color: v ?? "#000" } })} />
          <Num label="Width" value={el.stroke.width} onChange={(v) => set({ stroke: { width: v } })} step={0.25} min={0} suffix="pt" />
          <Color label="Fill" value={el.fill} onChange={(v) => set({ fill: v })} allowNone />
          <Num label="Rad" value={el.cornerRadius} onChange={(v) => set({ cornerRadius: v })} min={0} />
        </Section>
      )}

      {el.type === "checkbox" && (
        <Section title="Checkbox">
          <Color label="Color" value={el.style.color} onChange={(v) => set({ style: { color: v ?? "#000" } })} />
          <Num label="Line" value={el.style.lineWidth} onChange={(v) => set({ style: { lineWidth: v } })} step={0.25} min={0.25} />
        </Section>
      )}

      {el.type === "table" && <TableProps el={el} set={set} />}
    </aside>
  );
}

function BorderProps({ border, onChange }: { border?: { color: string; width: number }; onChange: (b: { color: string; width: number } | undefined) => void }) {
  const b = border ?? { color: "#000000", width: 0 };
  return (
    <div className="grid grid-cols-[1fr_auto] items-end gap-2">
      <Num label="Border" value={b.width} onChange={(v) => onChange(v > 0 ? { ...b, width: v } : undefined)} step={0.25} min={0} suffix="pt" />
      <input type="color" value={b.color} onChange={(e) => onChange({ ...b, width: b.width || 0.75, color: e.target.value })} className="h-6 w-8 cursor-pointer rounded border border-ink-300 p-0" />
    </div>
  );
}

function FieldPicker({ value, onChange, allow }: { value: string; onChange: (v: string) => void; allow?: string[] }) {
  const fields = useDesigner((s) => s.fields).filter((f) => !allow || allow.includes(f.data_type));
  const cats = [...new Set(fields.map((f) => f.category))];
  return (
    <label className="block text-xs text-ink-600">
      <span className="mb-0.5 block">Field</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-full rounded border border-ink-300 bg-white px-1 text-xs text-ink-900 focus:border-brand-500 focus:outline-none">
        <option value="">— select a field —</option>
        {cats.map((c) => (
          <optgroup key={c} label={c}>
            {fields.filter((f) => f.category === c).map((f) => (
              <option key={f.id} value={f.field_name}>{f.display_name}</option>
            ))}
          </optgroup>
        ))}
        {value && !fields.some((f) => f.field_name === value) && <option value={value}>{value} (undefined)</option>}
      </select>
    </label>
  );
}

function ImageProps({ el, set }: { el: Extract<TemplateElement, { type: "image" }>; set: (p: Record<string, unknown>) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const fields = useDesigner((s) => s.fields).filter((f) => f.data_type === "IMAGE");

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", el.name === "Logo" ? "logo" : "image");
      const res = await api<{ asset: { id: string; width_pt: number | null; height_pt: number | null } }>("/api/assets", { method: "POST", body: fd });
      const patch: Record<string, unknown> = { assetId: res.asset.id };
      if (res.asset.width_pt && res.asset.height_pt) {
        const r = res.asset.width_pt / res.asset.height_pt;
        patch.height = Math.round((el.width / r) * 100) / 100;
      }
      set(patch);
      toast.success("Image uploaded");
    } catch (e) {
      toast.error("Upload failed", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Image">
      <input ref={inputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <button onClick={() => inputRef.current?.click()} disabled={busy} className="flex items-center justify-center gap-1 rounded border border-ink-300 py-1.5 text-xs hover:bg-ink-50 disabled:opacity-50">
        <Upload className="h-3.5 w-3.5" /> {busy ? "Uploading…" : el.assetId ? "Replace image" : "Upload PNG / JPEG"}
      </button>
      {el.assetId && <div className="truncate text-[10px] text-ink-400">asset {el.assetId}</div>}
      {fields.length > 0 && (
        <Sel label="Or bind to image field" value={el.fieldName ?? ""} onChange={(v) => set({ fieldName: v || undefined })} options={[{ value: "", label: "— fixed image —" }, ...fields.map((f) => ({ value: f.field_name, label: f.display_name }))]} />
      )}
      <Sel label="Fit" value={el.fit} onChange={(v) => set({ fit: v })} options={[{ value: "contain", label: "Contain (keep ratio)" }, { value: "cover", label: "Cover (crop)" }, { value: "stretch", label: "Stretch" }]} />
      <BorderProps border={el.border} onChange={(b) => set({ border: b })} />
    </Section>
  );
}

function TableProps({ el, set }: { el: Extract<TemplateElement, { type: "table" }>; set: (p: Record<string, unknown>) => void }) {
  const [cell, setCell] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const fields = useDesigner((s) => s.fields);
  const cols = el.columns;
  const rows = el.rows;
  const cur = rows[cell.r]?.[cell.c];

  const setCols = (columns: typeof cols) => set({ columns, width: columns.reduce((s, c) => s + c.width, 0) });
  const setRows = (next: typeof rows) => set({ rows: next, height: (el.showHeader ? el.headerHeight : 0) + next.length * el.rowHeight });
  const addCol = () => {
    setCols([...cols, { width: 80, header: `Column ${cols.length + 1}` }]);
    set({ rows: rows.map((r) => [...r, { text: "" }]) });
  };
  const removeCol = () => {
    if (cols.length <= 1) return;
    setCols(cols.slice(0, -1));
    set({ rows: rows.map((r) => r.slice(0, -1)) });
  };
  const addRow = () => setRows([...rows, cols.map(() => ({ text: "" }))]);
  const removeRow = () => rows.length > 0 && setRows(rows.slice(0, -1));
  const setCellVal = (patch: Record<string, unknown>) => {
    const next = rows.map((r, ri) => r.map((c, ci) => (ri === cell.r && ci === cell.c ? { ...c, ...patch } : c)));
    set({ rows: next });
  };

  return (
    <>
      <Section title="Table structure">
        <div className="flex items-center justify-between text-xs">
          <span>Columns: {cols.length}</span>
          <div className="flex gap-1">
            <button className="rounded border border-ink-300 p-1 hover:bg-ink-50" onClick={removeCol}><Minus className="h-3 w-3" /></button>
            <button className="rounded border border-ink-300 p-1 hover:bg-ink-50" onClick={addCol}><Plus className="h-3 w-3" /></button>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span>Rows: {rows.length}</span>
          <div className="flex gap-1">
            <button className="rounded border border-ink-300 p-1 hover:bg-ink-50" onClick={removeRow}><Minus className="h-3 w-3" /></button>
            <button className="rounded border border-ink-300 p-1 hover:bg-ink-50" onClick={addRow}><Plus className="h-3 w-3" /></button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Num label="RowH" value={el.rowHeight} onChange={(v) => set({ rowHeight: v, height: (el.showHeader ? el.headerHeight : 0) + rows.length * v })} min={6} />
          <Num label="HdrH" value={el.headerHeight} onChange={(v) => set({ headerHeight: v, height: (el.showHeader ? v : 0) + rows.length * el.rowHeight })} min={6} />
        </div>
        <Chk label="Show header row" checked={el.showHeader} onChange={(v) => set({ showHeader: v, height: (v ? el.headerHeight : 0) + rows.length * el.rowHeight })} />
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <Num label="Border" value={el.border.width} onChange={(v) => set({ border: { width: v } })} step={0.25} min={0} suffix="pt" />
          <input type="color" value={el.border.color} onChange={(e) => set({ border: { color: e.target.value } })} className="h-6 w-8 cursor-pointer rounded border border-ink-300 p-0" />
        </div>
        <Color label="Header fill" value={el.headerStyle.fill ?? null} onChange={(v) => set({ headerStyle: { fill: v ?? undefined } })} allowNone />
      </Section>
      <Section title="Columns">
        {cols.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_64px] gap-1">
            <Txt label={i === 0 ? "Header" : ""} value={c.header} onChange={(v) => setCols(cols.map((x, j) => (j === i ? { ...x, header: v } : x)))} />
            <Num label={i === 0 ? "W" : ""} value={c.width} onChange={(v) => setCols(cols.map((x, j) => (j === i ? { ...x, width: v } : x)))} min={5} />
          </div>
        ))}
      </Section>
      <Section title="Cell content">
        <div className="grid grid-cols-2 gap-2">
          <Sel label="Row" value={String(cell.r)} onChange={(v) => setCell({ ...cell, r: Number(v) })} options={rows.map((_, i) => ({ value: String(i), label: `Row ${i + 1}` }))} />
          <Sel label="Column" value={String(cell.c)} onChange={(v) => setCell({ ...cell, c: Number(v) })} options={cols.map((c, i) => ({ value: String(i), label: c.header || `Col ${i + 1}` }))} />
        </div>
        {cur ? (
          <>
            <Txt label="Static text" value={cur.text ?? ""} onChange={(v) => setCellVal({ text: v, fieldName: undefined })} />
            <label className="block text-xs text-ink-600">
              <span className="mb-0.5 block">Or dynamic field</span>
              <select value={cur.fieldName ?? ""} onChange={(e) => setCellVal({ fieldName: e.target.value || undefined, ...(e.target.value ? { text: undefined } : {}) })} className="h-7 w-full rounded border border-ink-300 bg-white px-1 text-xs">
                <option value="">— none —</option>
                {fields.map((f) => (
                  <option key={f.id} value={f.field_name}>{f.display_name}</option>
                ))}
              </select>
            </label>
            <Num label="Span" value={cur.colSpan ?? 1} onChange={(v) => setCellVal({ colSpan: v > 1 ? v : undefined })} min={1} max={cols.length - cell.c} />
          </>
        ) : (
          <p className="text-[11px] text-ink-500">Add a row to edit cells.</p>
        )}
      </Section>
    </>
  );
}

function TemplateProperties() {
  const template = useDesigner((s) => s.template);
  const pageIndex = useDesigner((s) => s.pageIndex);
  const { updateSettings, updateTemplateMeta, commit } = useDesigner.getState();
  if (!template) return null;
  const wmDefaults = { enabled: false, text: "CMR", color: "copy", opacity: 0.12, size: 190, angle: 35, replaceHeading: true };
  const setWm = (patch: Partial<typeof wmDefaults>) => updateSettings({ watermark: { ...wmDefaults, ...template.settings.watermark, ...patch } });
  const page = template.pages[pageIndex];
  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-l border-ink-200 bg-white">
      <Section title="Template">
        <Txt label="Name" value={template.templateName} onChange={(v) => updateTemplateMeta({ templateName: v })} />
        <Txt label="Revision label" value={template.revision ?? ""} onChange={(v) => updateTemplateMeta({ revision: v })} placeholder="Rev 02" />
        <div className="grid grid-cols-2 gap-2">
          <Num label="W" value={template.page.width} onChange={(v) => updateTemplateMeta({ page: { ...template.page, width: v, size: "Custom" } })} suffix="pt" />
          <Num label="H" value={template.page.height} onChange={(v) => updateTemplateMeta({ page: { ...template.page, height: v, size: "Custom" } })} suffix="pt" />
        </div>
        <p className="text-[10px] text-ink-400">A4 = 595.28 × 841.89 pt. Page size is taken from the background PDF when one is set.</p>
      </Section>
      <Section title="Document settings">
        <Chk label="Signature required" checked={template.settings.signatureRequired} onChange={(v) => updateSettings({ signatureRequired: v })} />
        <Chk label="Allow date override" checked={template.settings.allowDateOverride} onChange={(v) => updateSettings({ allowDateOverride: v })} />
        <Sel label="Default font" value={template.settings.defaultFont} onChange={(v) => updateSettings({ defaultFont: v })} options={FONTS.map((f) => ({ value: f, label: f }))} />
        <Txt label="File name pattern" value={template.settings.fileNamePattern} onChange={(v) => updateSettings({ fileNamePattern: v })} placeholder="{CMRNumber}.pdf" />
      </Section>
      <Section title="CMR form & language">
        <Chk
          label="Use built-in standard CMR form"
          checked={Boolean(template.settings.standardForm)}
          onChange={(v) => updateSettings({ standardForm: v })}
        />
        <p className="text-[10px] text-ink-400">
          The app draws the 24-box form itself, so the second language and the watermark option apply. Switch off to print on an uploaded / pre-printed form.
        </p>
        <Sel
          label="Form language"
          value={template.settings.formLanguage ?? "de"}
          onChange={(v) => updateSettings({ formLanguage: v as "de" | "da" | "sv" })}
          options={FORM_LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
        />
        <p className="text-[10px] text-ink-400">Default only – every CMR can choose English/German, Danish or Swedish in the wizard.</p>
      </Section>
      <Section title="Watermark">
        <Chk
          label="Enable watermark"
          checked={Boolean(template.settings.watermark?.enabled)}
          onChange={(v) => updateSettings({ watermark: { ...wmDefaults, ...template.settings.watermark, enabled: v } })}
        />
        {template.settings.watermark?.enabled && (
          <>
            <Txt label="Text" value={template.settings.watermark.text} onChange={(v) => setWm({ text: v })} placeholder="CMR" />
            <Chk
              label="Replace the “CMR” heading"
              checked={template.settings.watermark.replaceHeading}
              onChange={(v) => setWm({ replaceHeading: v })}
            />
            <Sel
              label="Colour"
              value={template.settings.watermark.color === "copy" ? "copy" : "custom"}
              onChange={(v) => setWm({ color: v === "copy" ? "copy" : "#000000" })}
              options={[
                { value: "copy", label: "Colour of each copy" },
                { value: "custom", label: "Custom colour" },
              ]}
            />
            {template.settings.watermark.color !== "copy" && (
              <Color label="Custom" value={template.settings.watermark.color} onChange={(v) => setWm({ color: v || "#000000" })} />
            )}
            <div className="grid grid-cols-2 gap-2">
              <Num label="Opacity" value={template.settings.watermark.opacity} onChange={(v) => setWm({ opacity: Math.min(1, Math.max(0.02, v)) })} step={0.02} min={0.02} max={1} />
              <Num label="Angle" value={template.settings.watermark.angle} onChange={(v) => setWm({ angle: Math.min(90, Math.max(-90, v)) })} step={5} min={-90} max={90} suffix="°" />
            </div>
            <Num label="Size" value={template.settings.watermark.size} onChange={(v) => setWm({ size: Math.min(400, Math.max(20, v)) })} step={10} min={20} max={400} suffix="pt" />
            <p className="text-[10px] text-ink-400">
              Printed behind the filled-in values on every copy. “Replace the heading” removes the large CMR title of the built-in form; on an uploaded form the heading stays.
            </p>
          </>
        )}
      </Section>
      <Section title={`Page ${pageIndex + 1}`}>
        <Txt label="Page name" value={page.name ?? ""} onChange={(v) => commit((t) => (t.pages[pageIndex].name = v || undefined))} />
        {page.background ? (
          <>
            <Num label="BgOp" value={page.background.opacity} onChange={(v) => commit((t) => (t.pages[pageIndex].background!.opacity = v))} step={0.05} min={0} max={1} />
            <Num label="PDF pg" value={page.background.pageIndex + 1} onChange={(v) => commit((t) => (t.pages[pageIndex].background!.pageIndex = Math.max(0, Math.round(v) - 1)))} min={1} />
            <p className="text-[10px] text-ink-400">Which page of the uploaded background PDF this template page shows.</p>
          </>
        ) : (
          <p className="text-[11px] text-ink-500">No background. Use “Background” in the toolbar to upload a PDF or image.</p>
        )}
      </Section>
      <div className="px-3 py-3 text-[11px] text-ink-400">
        <div className="font-semibold text-ink-500">Shortcuts</div>
        <div>Del – delete · Ctrl+D – duplicate · Ctrl+C/V – copy/paste</div>
        <div>Ctrl+Z / Ctrl+Y – undo/redo · Arrows – nudge (Shift ×10)</div>
        <div>Shift+click – multi-select · drag on empty area – marquee</div>
      </div>
    </aside>
  );
}
