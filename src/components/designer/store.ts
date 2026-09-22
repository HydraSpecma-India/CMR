"use client";

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { TemplateJson, TemplateElement, TemplatePage, ElementType } from "@/lib/template/schema";
import { createElement, emptyPage, newId } from "@/lib/template/defaults";

export interface FieldDef {
  id: string;
  field_name: string;
  display_name: string;
  data_type: string;
  source_type: string;
  category: string;
  required: boolean;
  read_only: boolean;
  allow_override: boolean;
  default_value: string | null;
  unit: string | null;
  config_json: Record<string, unknown>;
  validation_json: Record<string, unknown>;
}

export type AlignKind = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom" | "hdist" | "vdist";

interface DesignerState {
  template: TemplateJson | null;
  pageIndex: number;
  selectedIds: string[];
  zoom: number;
  dirty: boolean;
  readOnly: boolean;
  fields: FieldDef[];
  past: TemplateJson[];
  future: TemplateJson[];
  clipboard: TemplateElement[];
  gridSnap: boolean;
  showGrid: boolean;

  init: (t: TemplateJson, readOnly: boolean) => void;
  setFields: (f: FieldDef[]) => void;
  setZoom: (z: number) => void;
  setPage: (i: number) => void;
  select: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  markSaved: () => void;
  toggleGridSnap: () => void;
  toggleShowGrid: () => void;

  /** all structural mutations go through commit() so undo/redo works */
  commit: (mutator: (t: TemplateJson) => void) => void;
  undo: () => void;
  redo: () => void;

  addElement: (type: ElementType, x?: number, y?: number, extra?: Record<string, unknown>) => string;
  updateElement: (id: string, patch: Partial<TemplateElement> | Record<string, unknown>) => void;
  updateElements: (ids: string[], patch: Record<string, unknown>) => void;
  removeSelected: () => void;
  duplicateSelected: () => void;
  copySelected: () => void;
  paste: () => void;
  nudge: (dx: number, dy: number) => void;
  align: (kind: AlignKind) => void;
  reorder: (id: string, dir: "front" | "back" | "forward" | "backward") => void;
  addPage: () => void;
  removePage: (i: number) => void;
  movePage: (from: number, to: number) => void;
  setPageBackground: (i: number, bg: TemplatePage["background"]) => void;
  updateSettings: (patch: Partial<TemplateJson["settings"]>) => void;
  updateTemplateMeta: (patch: Partial<Pick<TemplateJson, "templateName" | "revision" | "page">>) => void;
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const MAX_HISTORY = 100;

export const useDesigner = create<DesignerState>((set, get) => ({
  template: null,
  pageIndex: 0,
  selectedIds: [],
  zoom: 1,
  dirty: false,
  readOnly: false,
  fields: [],
  past: [],
  future: [],
  clipboard: [],
  gridSnap: false,
  showGrid: false,

  init: (t, readOnly) => set({ template: clone(t), readOnly, pageIndex: 0, selectedIds: [], past: [], future: [], dirty: false }),
  setFields: (fields) => set({ fields }),
  setZoom: (zoom) => set({ zoom: Math.min(4, Math.max(0.25, zoom)) }),
  setPage: (pageIndex) => set({ pageIndex, selectedIds: [] }),
  select: (selectedIds) => set({ selectedIds }),
  toggleSelect: (id) => set((s) => ({ selectedIds: s.selectedIds.includes(id) ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id] })),
  markSaved: () => set({ dirty: false }),
  toggleGridSnap: () => set((s) => ({ gridSnap: !s.gridSnap })),
  toggleShowGrid: () => set((s) => ({ showGrid: !s.showGrid })),

  commit: (mutator) => {
    const { template, past, readOnly } = get();
    if (!template || readOnly) return;
    const next = clone(template);
    mutator(next);
    set({ template: next, past: [...past.slice(-MAX_HISTORY), template], future: [], dirty: true });
  },
  undo: () => {
    const { past, template, future } = get();
    if (!past.length || !template) return;
    const prev = past[past.length - 1];
    set({ template: prev, past: past.slice(0, -1), future: [template, ...future], dirty: true, selectedIds: [] });
  },
  redo: () => {
    const { past, template, future } = get();
    if (!future.length || !template) return;
    const [next, ...rest] = future;
    set({ template: next, past: [...past, template], future: rest, dirty: true, selectedIds: [] });
  },

  addElement: (type, x, y, extra) => {
    const { template, pageIndex } = get();
    const el = createElement(type, x ?? (template ? template.page.width / 2 - 70 : 100), y ?? (template ? template.page.height / 2 - 9 : 100), extra);
    get().commit((t) => {
      t.pages[pageIndex].elements.push(el);
    });
    set({ selectedIds: [el.id] });
    return el.id;
  },
  updateElement: (id, patch) => get().updateElements([id], patch as Record<string, unknown>),
  updateElements: (ids, patch) =>
    get().commit((t) => {
      const page = t.pages[get().pageIndex];
      for (const el of page.elements) {
        if (ids.includes(el.id)) Object.assign(el, deepMerge(el as unknown as Record<string, unknown>, patch));
      }
    }),
  removeSelected: () => {
    const ids = get().selectedIds;
    if (!ids.length) return;
    get().commit((t) => {
      const page = t.pages[get().pageIndex];
      page.elements = page.elements.filter((e) => !ids.includes(e.id) || e.locked);
    });
    set({ selectedIds: [] });
  },
  duplicateSelected: () => {
    const { selectedIds, pageIndex, template } = get();
    if (!selectedIds.length || !template) return;
    const copies = template.pages[pageIndex].elements.filter((e) => selectedIds.includes(e.id)).map((e) => ({ ...clone(e), id: newId(), x: e.x + 10, y: e.y + 10 }));
    get().commit((t) => t.pages[pageIndex].elements.push(...copies));
    set({ selectedIds: copies.map((c) => c.id) });
  },
  copySelected: () => {
    const { selectedIds, pageIndex, template } = get();
    if (!template) return;
    set({ clipboard: clone(template.pages[pageIndex].elements.filter((e) => selectedIds.includes(e.id))) });
  },
  paste: () => {
    const { clipboard, pageIndex } = get();
    if (!clipboard.length) return;
    const copies = clipboard.map((e) => ({ ...clone(e), id: newId(), x: e.x + 10, y: e.y + 10 }));
    get().commit((t) => t.pages[pageIndex].elements.push(...copies));
    set({ selectedIds: copies.map((c) => c.id), clipboard: copies });
  },
  nudge: (dx, dy) => {
    const ids = get().selectedIds;
    if (!ids.length) return;
    get().commit((t) => {
      for (const el of t.pages[get().pageIndex].elements) if (ids.includes(el.id) && !el.locked) { el.x += dx; el.y += dy; }
    });
  },
  align: (kind) => {
    const { selectedIds, pageIndex, template } = get();
    if (!template) return;
    const els = template.pages[pageIndex].elements.filter((e) => selectedIds.includes(e.id));
    const bounds = els.length > 1
      ? { x1: Math.min(...els.map((e) => e.x)), y1: Math.min(...els.map((e) => e.y)), x2: Math.max(...els.map((e) => e.x + e.width)), y2: Math.max(...els.map((e) => e.y + e.height)) }
      : { x1: 0, y1: 0, x2: template.page.width, y2: template.page.height }; // single element aligns to page
    get().commit((t) => {
      const targets = t.pages[pageIndex].elements.filter((e) => selectedIds.includes(e.id) && !e.locked);
      const sorted = [...targets];
      switch (kind) {
        case "left": targets.forEach((e) => (e.x = bounds.x1)); break;
        case "right": targets.forEach((e) => (e.x = bounds.x2 - e.width)); break;
        case "hcenter": targets.forEach((e) => (e.x = (bounds.x1 + bounds.x2) / 2 - e.width / 2)); break;
        case "top": targets.forEach((e) => (e.y = bounds.y1)); break;
        case "bottom": targets.forEach((e) => (e.y = bounds.y2 - e.height)); break;
        case "vcenter": targets.forEach((e) => (e.y = (bounds.y1 + bounds.y2) / 2 - e.height / 2)); break;
        case "hdist": {
          if (sorted.length < 3) break;
          sorted.sort((a, b) => a.x - b.x);
          const total = sorted.reduce((s, e) => s + e.width, 0);
          const gap = (bounds.x2 - bounds.x1 - total) / (sorted.length - 1);
          let x = bounds.x1;
          for (const e of sorted) { e.x = x; x += e.width + gap; }
          break;
        }
        case "vdist": {
          if (sorted.length < 3) break;
          sorted.sort((a, b) => a.y - b.y);
          const total = sorted.reduce((s, e) => s + e.height, 0);
          const gap = (bounds.y2 - bounds.y1 - total) / (sorted.length - 1);
          let y = bounds.y1;
          for (const e of sorted) { e.y = y; y += e.height + gap; }
          break;
        }
      }
    });
  },
  reorder: (id, dir) =>
    get().commit((t) => {
      const els = t.pages[get().pageIndex].elements;
      const i = els.findIndex((e) => e.id === id);
      if (i < 0) return;
      const [el] = els.splice(i, 1);
      const j = dir === "front" ? els.length : dir === "back" ? 0 : dir === "forward" ? Math.min(els.length, i + 1) : Math.max(0, i - 1);
      els.splice(j, 0, el);
    }),
  addPage: () => {
    const n = (get().template?.pages.length ?? 0) + 1;
    get().commit((t) => t.pages.push(emptyPage(`Page ${n}`)));
    set({ pageIndex: n - 1, selectedIds: [] });
  },
  removePage: (i) => {
    const t = get().template;
    if (!t || t.pages.length <= 1) return;
    get().commit((tt) => tt.pages.splice(i, 1));
    set({ pageIndex: Math.max(0, Math.min(i, t.pages.length - 2)), selectedIds: [] });
  },
  movePage: (from, to) => {
    get().commit((t) => {
      const [p] = t.pages.splice(from, 1);
      t.pages.splice(to, 0, p);
    });
    set({ pageIndex: to });
  },
  setPageBackground: (i, bg) => get().commit((t) => (t.pages[i].background = bg)),
  updateSettings: (patch) => get().commit((t) => Object.assign(t.settings, patch)),
  updateTemplateMeta: (patch) => get().commit((t) => Object.assign(t, patch)),
}));

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
/** shallow-per-key merge with one level of object merging (style, binding, stroke…) */
function deepMerge(target: Record<string, unknown>, patch: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isObj(v) && isObj(target[k]) ? { ...(target[k] as object), ...v } : v;
  }
  return out;
}

/** selectors */
export const useCurrentPage = () => useDesigner((s) => s.template?.pages[s.pageIndex]);
export const useSelectedElements = () =>
  useDesigner(
    useShallow((s) => {
      const page = s.template?.pages[s.pageIndex];
      return page ? page.elements.filter((e) => s.selectedIds.includes(e.id)) : [];
    }),
  );
