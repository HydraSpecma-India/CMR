"use client";

import { useMemo, useState } from "react";
import { Type, TextCursorInput, Image as ImageIcon, PenTool, Calendar, Clock, CalendarClock, Minus, Square, Table2, CheckSquare, ChevronDown, Search, Database, Hand, Cpu, Sparkles } from "lucide-react";
import { useDesigner, type FieldDef } from "./store";
import type { ElementType } from "@/lib/template/schema";
import { cn } from "@/lib/utils/cn";

interface PaletteItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  type: ElementType;
  extra?: Record<string, unknown>;
  width?: number;
  height?: number;
  hint?: string;
}

const BASIC: PaletteItem[] = [
  { label: "Text", icon: Type, type: "text" },
  { label: "Field", icon: TextCursorInput, type: "field", hint: "Generic field – pick the source in properties" },
  { label: "Image", icon: ImageIcon, type: "image", width: 100, height: 60 },
  { label: "Logo", icon: ImageIcon, type: "image", width: 90, height: 34, extra: { name: "Logo" } },
  { label: "Signature", icon: PenTool, type: "signature", width: 180, height: 40 },
  { label: "Date", icon: Calendar, type: "field", extra: { fieldName: "CMRDate", binding: { format: "yyyy-MM-dd" } } },
  { label: "Time", icon: Clock, type: "field", extra: { fieldName: "CurrentTime", binding: { format: "HH:mm" } } },
  { label: "DateTime", icon: CalendarClock, type: "field", extra: { fieldName: "CurrentDateTime", binding: { format: "yyyy-MM-dd HH:mm" } }, width: 160 },
  { label: "Line", icon: Minus, type: "line", width: 200, height: 0 },
  { label: "Rectangle", icon: Square, type: "rect", width: 160, height: 60 },
  { label: "Table", icon: Table2, type: "table", width: 300, height: 54 },
  { label: "Checkbox", icon: CheckSquare, type: "checkbox", width: 10, height: 10 },
  { label: "Dropdown", icon: ChevronDown, type: "field", extra: { fieldName: "CarriagePaid" } },
  { label: "Multiline", icon: Type, type: "field", extra: { fieldName: "Comments", style: { valign: "top" } }, width: 200, height: 60 },
];

const SOURCE_ICON: Record<string, React.ComponentType<{ className?: string }>> = { D365FO: Database, MANUAL: Hand, SYSTEM: Cpu, CUSTOM: Sparkles };
const SOURCE_TEXT: Record<string, string> = { D365FO: "text-blue-700", MANUAL: "text-amber-700", SYSTEM: "text-violet-700", STATIC: "text-ink-600", SIGNATURE: "text-teal-700", IMAGE: "text-teal-700", CUSTOM: "text-pink-700" };

function itemFor(f: FieldDef): PaletteItem {
  if (f.data_type === "SIGNATURE") return { label: f.display_name, icon: PenTool, type: "signature", extra: { fieldName: f.field_name }, width: 180, height: 40 };
  if (f.data_type === "IMAGE") return { label: f.display_name, icon: ImageIcon, type: "image", extra: { fieldName: f.field_name }, width: 100, height: 60 };
  if (f.data_type === "BOOLEAN") return { label: f.display_name, icon: CheckSquare, type: "checkbox", extra: { fieldName: f.field_name }, width: 10, height: 10 };
  const multiline = f.data_type === "MULTILINE";
  const fmt = (f.config_json?.format as string | undefined) ?? undefined;
  return {
    label: f.display_name,
    icon: SOURCE_ICON[f.source_type] ?? TextCursorInput,
    type: "field",
    extra: { fieldName: f.field_name, ...(multiline ? { style: { valign: "top" } } : {}), ...(fmt ? { binding: { format: fmt } } : {}) },
    width: multiline ? 200 : f.data_type === "DATETIME" ? 160 : 140,
    height: multiline ? 60 : 18,
  };
}

export function ElementPalette() {
  const fields = useDesigner((s) => s.fields);
  const addElement = useDesigner((s) => s.addElement);
  const readOnly = useDesigner((s) => s.readOnly);
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const map = new Map<string, FieldDef[]>();
    for (const f of fields) {
      if (q && !`${f.display_name} ${f.field_name}`.toLowerCase().includes(q.toLowerCase())) continue;
      const g = map.get(f.category) ?? [];
      g.push(f);
      map.set(f.category, g);
    }
    const order = ["D365FO Fields", "Manual Fields", "System Fields", "Custom Fields"];
    // Template data-entry groups ("Data entry · Page 2" …) first, in page order
    const rank = (c: string) => (c.startsWith("Data entry") ? -1 : order.indexOf(c) === -1 ? 99 : order.indexOf(c));
    return [...map.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [fields, q]);

  const place = (item: PaletteItem) => {
    if (readOnly) return;
    addElement(item.type, undefined, undefined, { ...(item.width !== undefined ? { width: item.width } : {}), ...(item.height !== undefined ? { height: item.height } : {}), ...item.extra });
  };

  const dragStart = (e: React.DragEvent, item: PaletteItem) => {
    e.dataTransfer.setData("application/x-cmr-element", JSON.stringify({ type: item.type, extra: item.extra, width: item.width, height: item.height }));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-ink-200 bg-white">
      <div className="border-b border-ink-200 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Elements</div>
      <div className="grid grid-cols-2 gap-1 p-2">
        {BASIC.map((item) => (
          <button
            key={item.label}
            draggable={!readOnly}
            onDragStart={(e) => dragStart(e, item)}
            onClick={() => place(item)}
            title={item.hint ?? `Click to add, or drag onto the page`}
            className="flex items-center gap-1.5 rounded border border-ink-200 px-2 py-1.5 text-left text-xs text-ink-700 hover:border-ink-400 hover:bg-ink-50 active:cursor-grabbing disabled:opacity-50"
            disabled={readOnly}
          >
            <item.icon className="h-3.5 w-3.5 shrink-0 text-ink-500" />
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 border-y border-ink-200 px-2 py-1.5">
        <Search className="h-3.5 w-3.5 text-ink-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search fields…" className="h-6 w-full bg-transparent text-xs outline-none placeholder:text-ink-400" />
      </div>

      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 && <div className="p-3 text-xs text-ink-500">No fields match.</div>}
        {groups.map(([category, list]) => (
          <div key={category}>
            <div className="sticky top-0 bg-ink-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500">{category}</div>
            {list.map((f) => {
              const item = itemFor(f);
              const Icon = item.icon;
              return (
                <button
                  key={f.id}
                  draggable={!readOnly}
                  onDragStart={(e) => dragStart(e, item)}
                  onClick={() => place(item)}
                  disabled={readOnly}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-ink-50 disabled:opacity-50"
                  title={`${f.field_name} · ${f.data_type} · ${f.source_type}`}
                >
                  <Icon className={cn("h-3.5 w-3.5 shrink-0", SOURCE_TEXT[f.source_type])} />
                  <span className="min-w-0 flex-1 truncate text-ink-800">{f.display_name}</span>
                  <span className="text-[10px] text-ink-400">{f.data_type.toLowerCase()}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
