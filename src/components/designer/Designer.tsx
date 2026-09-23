"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, Save, Undo2, Redo2, ZoomIn, ZoomOut, Maximize, Upload, Grid3X3, Magnet, AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, Rocket, Lock, Type, Minus, ClipboardList } from "lucide-react";
import { useDesigner } from "./store";
import { safeParseTemplate } from "@/lib/template/schema";
import type { FieldDef } from "./store";
import { ElementPalette } from "./ElementPalette";
import { PropertiesPanel } from "./PropertiesPanel";
import { PagesPanel } from "./PagesPanel";
import { Badge, Button } from "@/components/ui";
import { toast, Toaster } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import type { TemplateJson, ElementType } from "@/lib/template/schema";
import { cn } from "@/lib/utils/cn";

const DesignerCanvas = dynamic(() => import("./DesignerCanvas").then((m) => m.DesignerCanvas), { ssr: false });

interface Props {
  templateId: string;
  versionId: string;
  versionNumber: number;
  versionStatus: string;
  templateName: string;
  initial: TemplateJson;
  fields: FieldDef[];
  assets: { id: string; mime_type: string; file_name: string; page_count: number | null; width_pt: number | null; height_pt: number | null }[];
  canEdit: boolean;
}

export function Designer(props: Props) {
  // Actions are stable. Reading them directly avoids subscribing this large
  // component to every store update in addition to the focused selectors below.
  const { init, setFields, undo, redo, removeSelected, duplicateSelected, copySelected, paste, nudge, select, setZoom, align, addElement, toggleGridSnap, toggleShowGrid, markSaved } = useDesigner.getState();
  const template = useDesigner((s) => s.template);
  const dirty = useDesigner((s) => s.dirty);
  const zoom = useDesigner((s) => s.zoom);
  const pageIndex = useDesigner((s) => s.pageIndex);
  const selectedIds = useDesigner((s) => s.selectedIds);
  const past = useDesigner((s) => s.past);
  const future = useDesigner((s) => s.future);
  const gridSnap = useDesigner((s) => s.gridSnap);
  const showGrid = useDesigner((s) => s.showGrid);
  const readOnly = !props.canEdit || props.versionStatus !== "draft";

  const router = useRouter();
  const [assets, setAssets] = useState(props.assets);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const assetMimeTypes = useMemo(
    () => Object.fromEntries(assets.map((a) => [a.id, a.mime_type])),
    [assets],
  );

  useEffect(() => {
    // fill defaults of newer settings (watermark, language, standard form) for older template versions
    const parsed = safeParseTemplate(props.initial);
    const t = (parsed.success ? parsed.data : props.initial) as typeof props.initial;
    const raw = props.initial as { settings?: { standardForm?: boolean } };
    if (parsed.success && raw.settings?.standardForm === undefined) {
      const stdIds = new Set(props.assets.filter((a) => a.file_name === "CMR-standard-form-4-copies.pdf").map((a) => a.id));
      parsed.data.settings.standardForm = parsed.data.pages.some((p) => p.background && stdIds.has(p.background.assetId));
    }
    init(t, readOnly);
    setFields(props.fields);
  }, [props.initial, props.fields, props.assets, readOnly, init, setFields]);

  // fit to width on mount
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !template) return;
    const z = Math.min(1.5, (el.clientWidth - 64) / template.page.width);
    setZoom(Math.max(0.4, Math.floor(z * 20) / 20));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(template)]);

  // ── save ────────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    const t = useDesigner.getState().template;
    if (!t || readOnly) return;
    setSaving(true);
    try {
      let bgAsset = t.pages.find((p) => p.background)?.background?.assetId ?? null;
      if (
        bgAsset === "builtin-hydraspecma" ||
        bgAsset === "default" ||
        bgAsset === "00000000-0000-0000-0000-000000000001"
      ) {
        bgAsset = "00000000-0000-0000-0000-000000000001";
      } else if (
        bgAsset &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bgAsset)
      ) {
        bgAsset = null;
      }
      await api(`/api/templates/${props.templateId}/versions/${props.versionId}`, {
        method: "PUT",
        json: { templateJson: t, revision: t.revision, backgroundAssetId: bgAsset },
      });
      markSaved();
      toast.success("Template saved");
    } catch (e) {
      toast.error("Save failed", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [props.templateId, props.versionId, readOnly, markSaved]);

  const publish = async () => {
    if (dirty) await save();
    if (!confirm(`Publish version ${props.versionNumber}? It becomes the active version and can no longer be edited.`)) return;
    setPublishing(true);
    try {
      await api(`/api/templates/${props.templateId}/versions/${props.versionId}/publish`, { method: "POST" });
      toast.success(`Version ${props.versionNumber} published`);
      markSaved();
      router.push(`/admin/templates/${props.templateId}`);
    } catch (e) {
      toast.error("Publish failed", (e as Error).message);
      setPublishing(false);
    }
  };

  // warn on unload
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (useDesigner.getState().dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  // ── keyboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement)?.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); save(); return; }
      if (readOnly) return;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateSelected(); return; }
      if (mod && e.key.toLowerCase() === "c") { e.preventDefault(); copySelected(); return; }
      if (mod && e.key.toLowerCase() === "v") { e.preventDefault(); paste(); return; }
      if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); select(useDesigner.getState().template?.pages[useDesigner.getState().pageIndex].elements.map((x) => x.id) ?? []); return; }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSelected(); return; }
      if (e.key === "Escape") { select([]); return; }
      const step = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowLeft") { e.preventDefault(); nudge(-step, 0); }
      if (e.key === "ArrowRight") { e.preventDefault(); nudge(step, 0); }
      if (e.key === "ArrowUp") { e.preventDefault(); nudge(0, -step); }
      if (e.key === "ArrowDown") { e.preventDefault(); nudge(0, step); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, undo, redo, duplicateSelected, copySelected, paste, removeSelected, nudge, select, readOnly]);

  // ── wheel zoom ───────────────────────────────────────────────────────────
  const onWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    setZoom(zoom * (e.deltaY < 0 ? 1.1 : 0.9));
  };

  // ── background upload ────────────────────────────────────────────────────
  const uploadBackground = async (file: File) => {
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "background");
      fd.append("templateId", props.templateId);
      const res = await api<{ asset: Props["assets"][number] }>("/api/assets", { method: "POST", body: fd });
      setAssets((a) => [res.asset, ...a]);
      const st = useDesigner.getState();
      const t = st.template!;
      const pageCount = res.asset.page_count ?? 1;
      const applyAll = pageCount > 1 && confirm(`The PDF has ${pageCount} pages. Create/assign one template page per PDF page? (Cancel = only the current page)`);
      st.commit((tt) => {
        if (res.asset.width_pt && res.asset.height_pt) tt.page = { ...tt.page, width: res.asset.width_pt, height: res.asset.height_pt, size: "Custom" };
        if (applyAll) {
          for (let i = 0; i < pageCount; i++) {
            if (!tt.pages[i]) tt.pages.push({ id: `page-${i + 1}-${Date.now()}`, name: `Page ${i + 1}`, background: null, elements: [] });
            tt.pages[i].background = { assetId: res.asset.id, pageIndex: i, opacity: 1 };
          }
        } else {
          tt.pages[st.pageIndex].background = { assetId: res.asset.id, pageIndex: 0, opacity: 1 };
        }
      });
      void t;
      toast.success("Background uploaded", `${res.asset.file_name} (${pageCount} page${pageCount > 1 ? "s" : ""})`);
    } catch (e) {
      toast.error("Background upload failed", (e as Error).message);
    }
  };

  const onDropElement = useCallback((type: ElementType, x: number, y: number, extra?: Record<string, unknown>) => addElement(type, x, y, extra), [addElement]);

  if (!template) return null;
  const multi = selectedIds.length > 1;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ink-100">
      {/* ── top bar ── */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-ink-200 bg-white px-3">
        <Link href={`/admin/templates/${props.templateId}`} className="flex items-center gap-1 rounded px-2 py-1 text-sm text-ink-600 hover:bg-ink-100" onClick={(e) => dirty && !confirm("Discard unsaved changes?") && e.preventDefault()}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div className="mx-2 h-6 w-px bg-ink-200" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{template.templateName}</div>
          <div className="text-[11px] text-ink-500">Version {props.versionNumber} · {template.revision ?? ""}</div>
        </div>
        <Badge tone={props.versionStatus === "draft" ? "info" : props.versionStatus === "published" ? "success" : "neutral"}>{props.versionStatus}</Badge>
        {readOnly && <Badge tone="warning"><Lock className="mr-1 h-3 w-3" />read-only</Badge>}
        {dirty && <Badge tone="warning">unsaved</Badge>}
        <Link
          href={`/admin/templates/${props.templateId}/inputs`}
          className="ml-1 flex items-center gap-1 rounded border border-ink-200 px-2 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50"
          title="Define the manual / QR fields for pages 2+ – they appear in the palette under “Data entry · Page N”"
          onClick={(e) => dirty && !confirm("Discard unsaved changes?") && e.preventDefault()}
        >
          <ClipboardList className="h-3.5 w-3.5 text-brand-600" /> Data fields
        </Link>

        <div className="mx-2 h-6 w-px bg-ink-200" />
        <ToolBtn title="Undo (Ctrl+Z)" disabled={!past.length || readOnly} onClick={undo}><Undo2 className="h-4 w-4" /></ToolBtn>
        <ToolBtn title="Redo (Ctrl+Y)" disabled={!future.length || readOnly} onClick={redo}><Redo2 className="h-4 w-4" /></ToolBtn>
        <div className="mx-2 h-6 w-px bg-ink-200" />
        <ToolBtn title="Align left" disabled={!selectedIds.length || readOnly} onClick={() => align("left")}><AlignLeft className="h-4 w-4" /></ToolBtn>
        <ToolBtn title="Align center" disabled={!selectedIds.length || readOnly} onClick={() => align("hcenter")}><AlignCenter className="h-4 w-4" /></ToolBtn>
        <ToolBtn title="Align right" disabled={!selectedIds.length || readOnly} onClick={() => align("right")}><AlignRight className="h-4 w-4" /></ToolBtn>
        <ToolBtn title="Align top" disabled={!selectedIds.length || readOnly} onClick={() => align("top")}><AlignStartVertical className="h-4 w-4" /></ToolBtn>
        <ToolBtn title="Align middle" disabled={!selectedIds.length || readOnly} onClick={() => align("vcenter")}><AlignCenterVertical className="h-4 w-4" /></ToolBtn>
        <ToolBtn title="Align bottom" disabled={!selectedIds.length || readOnly} onClick={() => align("bottom")}><AlignEndVertical className="h-4 w-4" /></ToolBtn>
        <ToolBtn title="Distribute horizontally" disabled={selectedIds.length < 3 || readOnly} onClick={() => align("hdist")}><AlignHorizontalDistributeCenter className="h-4 w-4" /></ToolBtn>
        <ToolBtn title="Distribute vertically" disabled={selectedIds.length < 3 || readOnly} onClick={() => align("vdist")}><AlignVerticalDistributeCenter className="h-4 w-4" /></ToolBtn>
        <div className="mx-2 h-6 w-px bg-ink-200" />
        <ToolBtn title="Toggle grid" active={showGrid} onClick={toggleShowGrid}><Grid3X3 className="h-4 w-4" /></ToolBtn>
        <ToolBtn title="Snap to 5pt grid" active={gridSnap} onClick={toggleGridSnap}><Magnet className="h-4 w-4" /></ToolBtn>
        <div className="mx-2 h-6 w-px bg-ink-200" />
        <ToolBtn title="Zoom out" onClick={() => setZoom(zoom / 1.2)}><ZoomOut className="h-4 w-4" /></ToolBtn>
        <span className="w-12 text-center text-xs tabular-nums text-ink-600">{Math.round(zoom * 100)}%</span>
        <ToolBtn title="Zoom in" onClick={() => setZoom(zoom * 1.2)}><ZoomIn className="h-4 w-4" /></ToolBtn>
        <div className="mx-2 h-6 w-px bg-ink-200" />
        {!readOnly && (
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => addElement("text", 60, 150, { text: "Edit this text", width: 180, height: 20 })}
              className="h-8 gap-1 px-2.5 text-xs font-semibold text-ink-800 hover:bg-brand-50 hover:border-brand-400 shadow-xs"
              title="Add editable text block onto page"
            >
              <Type className="h-3.5 w-3.5 text-brand-600" />
              + Text
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addElement("line", 55, 200, { width: 485, height: 0, stroke: { color: "#000000", width: 0.75 } })}
              className="h-8 gap-1 px-2.5 text-xs font-semibold text-ink-800 hover:bg-brand-50 hover:border-brand-400 shadow-xs"
              title="Add horizontal divider line"
            >
              <Minus className="h-3.5 w-3.5 text-brand-600" />
              + Line
            </Button>
          </div>
        )}

        <div className="flex-1" />
        <input ref={bgInputRef} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={(e) => e.target.files?.[0] && uploadBackground(e.target.files[0])} />
        {!readOnly && (
          <Button variant="outline" size="sm" onClick={() => bgInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> Background
          </Button>
        )}
        {!readOnly && (
          <Button size="sm" onClick={save} loading={saving} disabled={!dirty}>
            <Save className="h-3.5 w-3.5" /> Save
          </Button>
        )}
        {!readOnly && (
          <Button size="sm" variant="secondary" onClick={publish} loading={publishing}>
            <Rocket className="h-3.5 w-3.5" /> Publish
          </Button>
        )}
      </header>

      {/* ── body ── */}
      <div className="flex min-h-0 flex-1">
        <ElementPalette />
        <PagesPanel />
        <div ref={scrollRef} className="designer-canvas-wrap relative min-w-0 flex-1 overflow-auto" onWheel={onWheel}>
          <div className="flex min-h-full min-w-max items-start justify-center p-8">
            <DesignerCanvas assetMimeTypes={assetMimeTypes} onDropElement={onDropElement} />
          </div>
          <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/90 px-2 py-1 text-[11px] text-ink-500 shadow">
            Page {pageIndex + 1} / {template.pages.length} · {template.page.width.toFixed(0)} × {template.page.height.toFixed(0)} pt · {selectedIds.length ? `${selectedIds.length} selected` : "nothing selected"}
            {multi && " · align tools active"}
          </div>
        </div>
        <PropertiesPanel />
      </div>
      <Toaster />
    </div>
  );
}

function ToolBtn({ title, onClick, disabled, active, children }: { title: string; onClick: () => void; disabled?: boolean; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn("flex h-8 w-8 items-center justify-center rounded text-ink-700 hover:bg-ink-100 disabled:opacity-30 disabled:hover:bg-transparent", active && "bg-ink-900 text-white hover:bg-ink-900")}
    >
      {children}
    </button>
  );
}
