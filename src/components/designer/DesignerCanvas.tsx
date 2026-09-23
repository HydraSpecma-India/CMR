"use client";

import { memo, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Stage, Layer, Rect, Group, Transformer, Image as KImage, Line, Text as KText } from "react-konva";
import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useDesigner, type FieldDef } from "./store";
import { ElementBody, tableSize } from "./elements";
import { loadBackgroundImage } from "./background";
import type { TemplateElement } from "@/lib/template/schema";
import type { ElementType } from "@/lib/template/schema";

interface Props {
  assetMimeTypes: Record<string, string>;
  onDropElement?: (type: ElementType, x: number, y: number, extra?: Record<string, unknown>) => void;
}

const GRID = 5;
const snap = (v: number, on: boolean) => (on ? Math.round(v / GRID) * GRID : Math.round(v * 100) / 100);

export function DesignerCanvas({ assetMimeTypes, onDropElement }: Props) {
  const template = useDesigner((s) => s.template);
  const pageIndex = useDesigner((s) => s.pageIndex);
  const zoom = useDesigner((s) => s.zoom);
  const selectedIds = useDesigner((s) => s.selectedIds);
  const readOnly = useDesigner((s) => s.readOnly);
  const gridSnap = useDesigner((s) => s.gridSnap);
  const showGrid = useDesigner((s) => s.showGrid);
  const fields = useDesigner((s) => s.fields);

  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const [bgState, setBgState] = useState<{ key: string; img: HTMLImageElement | null; error: string | null }>({ key: "", img: null, error: null });
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [dropTarget, setDropTarget] = useState(false);
  const [inlineEditing, setInlineEditing] = useState<{ id: string; text: string } | null>(null);

  const page = template?.pages[pageIndex];
  const pw = template?.page.width ?? 595;
  const ph = template?.page.height ?? 842;

  // ── background ───────────────────────────────────────────────────────────
  const settings = template?.settings;
  const wm = settings?.watermark;
  const std = Boolean(settings?.standardForm);
  // built-in form: rendered by the server in the template's language, without heading when the watermark replaces it
  const stdKey = `std:lang=${settings?.formLanguage ?? "de"}&noHeading=${wm?.enabled && wm.replaceHeading ? 1 : 0}`;
  const assetId = std ? stdKey : page?.background?.assetId || "00000000-0000-0000-0000-000000000001";
  const bgPageIndex = page?.background?.pageIndex ?? pageIndex;
  const bgKey = `${assetId}:${bgPageIndex}`;

  useEffect(() => {
    let alive = true;
    const mime = !std && page?.background && assetMimeTypes[page.background.assetId] ? assetMimeTypes[page.background.assetId] : "application/pdf";
    loadBackgroundImage(assetId, mime, bgPageIndex)
      .then((img) => alive && setBgState({ key: bgKey, img, error: null }))
      .catch((e) => alive && setBgState({ key: bgKey, img: null, error: (e as Error).message }));
    return () => {
      alive = false;
    };
  }, [assetId, bgPageIndex, bgKey, assetMimeTypes, std, page?.background]);

  const bg = bgState.key === bgKey ? bgState.img : null;
  const bgError = bgState.key === bgKey ? bgState.error : null;

  // ── transformer binding ──────────────────────────────────────────────────
  useEffect(() => {
    const tr = trRef.current;
    const layer = layerRef.current;
    if (!tr || !layer) return;
    const nodes = selectedIds
      .map((id) => layer.findOne(`#${CSS.escape(id)}`))
      .filter((n): n is Konva.Node => Boolean(n) && !(n as Konva.Node).getAttr("locked"));
    tr.nodes(readOnly ? [] : nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, page?.elements, readOnly, zoom]);

  // ── mouse: selection + marquee ───────────────────────────────────────────
  const onMouseDown = useCallback((e: KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const clickedEmpty = e.target === stage || e.target.name() === "page-bg";
    if (!clickedEmpty) return;
    if (!e.evt.shiftKey) useDesigner.getState().select([]);
    const p = stage.getRelativePointerPosition();
    if (p) setMarquee({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  }, []);
  const onMouseMove = useCallback(() => {
    if (!marquee) return;
    const p = stageRef.current?.getRelativePointerPosition();
    if (p) setMarquee({ ...marquee, x2: p.x, y2: p.y });
  }, [marquee]);
  const onMouseUp = useCallback(() => {
    if (!marquee || !page) return;
    const box = { x: Math.min(marquee.x1, marquee.x2), y: Math.min(marquee.y1, marquee.y2), w: Math.abs(marquee.x2 - marquee.x1), h: Math.abs(marquee.y2 - marquee.y1) };
    if (box.w > 3 && box.h > 3) {
      const hits = page.elements.filter((el) => !el.hidden && el.x < box.x + box.w && el.x + el.width > box.x && el.y < box.y + box.h && el.y + el.height > box.y).map((e) => e.id);
      useDesigner.getState().select(hits);
    }
    setMarquee(null);
  }, [marquee, page]);

  const onElementClick = useCallback((e: KonvaEventObject<MouseEvent | TouchEvent>, id: string) => {
    e.cancelBubble = true;
    const state = useDesigner.getState();
    if (state.readOnly) return state.select([id]);
    if ("shiftKey" in e.evt && e.evt.shiftKey) state.toggleSelect(id);
    else if (!state.selectedIds.includes(id)) state.select([id]);
  }, []);

  const onElementDblClick = useCallback((id: string) => {
    const state = useDesigner.getState();
    if (state.readOnly) return;
    const el = state.template?.pages[state.pageIndex]?.elements.find((element) => element.id === id);
    if (el && el.type === "text") {
      setInlineEditing({ id: el.id, text: el.text });
    }
  }, []);

  // ── drag / transform ─────────────────────────────────────────────────────
  const onDragEnd = useCallback((e: KonvaEventObject<DragEvent>, id: string) => {
    const node = e.target;
    const state = useDesigner.getState();
    const page = state.template?.pages[state.pageIndex];
    const dx = snap(node.x(), state.gridSnap) - (page?.elements.find((el) => el.id === id)?.x ?? 0);
    const dy = snap(node.y(), state.gridSnap) - (page?.elements.find((el) => el.id === id)?.y ?? 0);
    const ids = state.selectedIds.includes(id) ? state.selectedIds : [id];
    state.commit((t) => {
      for (const el of t.pages[state.pageIndex].elements) {
        if (ids.includes(el.id) && !el.locked) {
          el.x = snap(el.x + dx, state.gridSnap);
          el.y = snap(el.y + dy, state.gridSnap);
        }
      }
    });
    // Konva already moved the dragged node; other selected nodes were moved by the transformer group drag
  }, []);

  const onTransformEnd = useCallback(() => {
    const tr = trRef.current;
    if (!tr) return;
    const state = useDesigner.getState();
    const page = state.template?.pages[state.pageIndex];
    if (!page) return;
    const patches: Record<string, Record<string, unknown>> = {};
    for (const node of tr.nodes()) {
      const id = node.id();
      const sx = node.scaleX();
      const sy = node.scaleY();
      const el = page?.elements.find((e) => e.id === id);
      if (!el) continue;
      const w = Math.max(el.type === "line" ? 0 : 4, el.width * sx);
      const h = Math.max(el.type === "line" ? 0 : 4, el.height * sy);
      node.scaleX(1);
      node.scaleY(1);
      const patch: Record<string, unknown> = { x: snap(node.x(), state.gridSnap), y: snap(node.y(), state.gridSnap), width: snap(w, state.gridSnap), height: snap(h, state.gridSnap), rotation: Math.round(node.rotation() * 10) / 10 };
      if (el.type === "table") {
        // scale columns proportionally, keep row heights
        const ratio = w / el.width;
        patch.columns = el.columns.map((c) => ({ ...c, width: Math.max(5, Math.round(c.width * ratio * 100) / 100) }));
        const rowRatio = h / el.height;
        patch.rowHeight = Math.max(6, Math.round(el.rowHeight * rowRatio * 100) / 100);
        patch.headerHeight = Math.max(6, Math.round(el.headerHeight * rowRatio * 100) / 100);
      }
      patches[id] = patch;
    }
    state.commit((t) => {
      for (const el of t.pages[state.pageIndex].elements) if (patches[el.id]) Object.assign(el, patches[el.id]);
    });
  }, []);

  // ── HTML5 drop from palette ──────────────────────────────────────────────
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDropTarget(false);
      const stage = stageRef.current;
      if (!stage || !onDropElement || readOnly) return;
      const raw = e.dataTransfer.getData("application/x-cmr-element");
      if (!raw) return;
      const data = JSON.parse(raw) as { type: ElementType; extra?: Record<string, unknown>; width?: number; height?: number };
      stage.setPointersPositions(e.nativeEvent);
      const p = stage.getRelativePointerPosition();
      if (!p) return;
      const w = data.width ?? 140;
      const h = data.height ?? 18;
      onDropElement(data.type, snap(p.x - w / 2, gridSnap), snap(p.y - h / 2, gridSnap), data.extra);
    },
    [onDropElement, readOnly, gridSnap],
  );

  // ── grid lines ───────────────────────────────────────────────────────────
  const gridLines = useMemo(() => {
    if (!showGrid) return null;
    const lines: React.ReactNode[] = [];
    for (let x = 0; x <= pw; x += 10) lines.push(<Line key={`gx${x}`} points={[x, 0, x, ph]} stroke={x % 50 === 0 ? "#cbd5e1" : "#e8ecf1"} strokeWidth={0.5} listening={false} />);
    for (let y = 0; y <= ph; y += 10) lines.push(<Line key={`gy${y}`} points={[0, y, pw, y]} stroke={y % 50 === 0 ? "#cbd5e1" : "#e8ecf1"} strokeWidth={0.5} listening={false} />);
    return lines;
  }, [showGrid, pw, ph]);

  if (!template || !page) return null;

  return (
    <div
      className="relative inline-block shadow-xl"
      style={{ width: pw * zoom, height: ph * zoom, outline: dropTarget ? "2px dashed #f2b705" : undefined }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        if (!dropTarget) setDropTarget(true);
      }}
      onDragLeave={() => setDropTarget(false)}
      onDrop={onDrop}
    >
      <Stage
        ref={stageRef}
        width={pw * zoom}
        height={ph * zoom}
        scaleX={zoom}
        scaleY={zoom}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onTouchStart={onMouseDown as never}
      >
        <Layer listening={false}>
          <Rect name="page-bg" x={0} y={0} width={pw} height={ph} fill="#ffffff" />
          {bg && <KImage image={bg} x={0} y={0} width={pw} height={ph} opacity={page.background?.opacity ?? 1} />}
          {wm?.enabled && wm.text.trim() && (() => {
            const COPY = ["#C8102E", "#1F4E9E", "#1E7B34", "#222222"];
            const fill = wm.color === "copy" ? COPY[pageIndex % 4] : wm.color;
            const rad = (wm.angle * Math.PI) / 180;
            // same shrink-to-fit as the PDF renderer (approx. bold glyph width 0.68 × size)
            let size = wm.size;
            const fits = (sz: number) => {
              const w = wm.text.trim().length * sz * 0.68;
              const h = sz * 0.72;
              return Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad)) <= pw * 0.92 && Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad)) <= ph * 0.92;
            };
            while (size > 10 && !fits(size)) size -= 2;
            const w = wm.text.trim().length * size * 0.68;
            return (
              <KText
                text={wm.text.trim()}
                x={pw / 2}
                y={ph / 2}
                width={w * 1.2}
                offsetX={(w * 1.2) / 2}
                offsetY={size * 0.5}
                align="center"
                fontSize={size}
                fontStyle="bold"
                fontFamily="Helvetica, Arial, sans-serif"
                fill={fill}
                opacity={wm.opacity}
                rotation={-wm.angle}
                listening={false}
              />
            );
          })()}
          {gridLines}
        </Layer>
        <Layer ref={layerRef}>
          <Rect name="page-bg" x={0} y={0} width={pw} height={ph} fill="rgba(0,0,0,0.001)" />
          {page.elements.map((el) => (
            <ElementNode
              key={el.id}
              el={el}
              fields={fields}
              selected={selectedIds.includes(el.id)}
              draggable={!readOnly && !el.locked}
              onClick={onElementClick}
              onDblClick={onElementDblClick}
              onDragEnd={onDragEnd}
            />
          ))}
          <Transformer
            ref={trRef}
            rotateEnabled
            rotationSnaps={[0, 90, 180, 270]}
            keepRatio={false}
            ignoreStroke
            anchorSize={7}
            anchorStroke="#0f172a"
            anchorFill="#ffffff"
            borderStroke="#0f172a"
            borderDash={[3, 3]}
            boundBoxFunc={(oldBox, newBox) => (newBox.width < 2 || newBox.height < 0 ? oldBox : newBox)}
            onTransformEnd={onTransformEnd}
          />
          {marquee && (
            <Rect
              x={Math.min(marquee.x1, marquee.x2)}
              y={Math.min(marquee.y1, marquee.y2)}
              width={Math.abs(marquee.x2 - marquee.x1)}
              height={Math.abs(marquee.y2 - marquee.y1)}
              fill="rgba(15,23,42,0.08)"
              stroke="#0f172a"
              strokeWidth={1 / zoom}
              dash={[4, 3]}
              listening={false}
            />
          )}
        </Layer>
      </Stage>
      {inlineEditing && (() => {
        const editingEl = page?.elements.find((e) => e.id === inlineEditing.id);
        if (!editingEl || editingEl.type !== "text") return null;
        return (
          <textarea
            autoFocus
            value={inlineEditing.text}
            onChange={(e) => setInlineEditing({ ...inlineEditing, text: e.target.value })}
            onBlur={() => {
              useDesigner.getState().commit((t) => {
                const target = t.pages[pageIndex].elements.find((e) => e.id === inlineEditing.id);
                if (target && target.type === "text") target.text = inlineEditing.text;
              });
              setInlineEditing(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setInlineEditing(null);
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
            className="absolute z-30 rounded border-2 border-brand-500 bg-white p-1.5 text-xs shadow-xl focus:outline-none"
            style={{
              left: editingEl.x * zoom,
              top: editingEl.y * zoom,
              width: Math.max(editingEl.width * zoom, 160),
              minHeight: Math.max(editingEl.height * zoom, 32),
              fontSize: Math.max(11, (editingEl.style.fontSize ?? 10) * zoom),
              fontFamily: editingEl.style.fontFamily,
              fontWeight: editingEl.style.bold ? "bold" : "normal",
            }}
          />
        );
      })()}
      {bgError && <div className="absolute left-2 top-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">Background failed: {bgError}</div>}
      {!bg && !bgError && <div className="absolute left-2 top-2 rounded bg-white/90 shadow-sm border border-ink-200 px-2.5 py-1 text-xs font-medium text-ink-600">Rendering certificate layout…</div>}
    </div>
  );
}

const ElementNode = memo(function ElementNode({
  el,
  fields,
  selected,
  draggable,
  onClick,
  onDblClick,
  onDragEnd,
}: {
  el: TemplateElement;
  fields: FieldDef[];
  selected: boolean;
  draggable: boolean;
  onClick: (e: KonvaEventObject<MouseEvent | TouchEvent>, id: string) => void;
  onDblClick?: (id: string) => void;
  onDragEnd: (e: KonvaEventObject<DragEvent>, id: string) => void;
}) {
  if (el.hidden) return null;
  const size = el.type === "table" ? tableSize(el) : { width: el.width, height: el.height };
  const isLine = el.type === "line";
  const hitW = isLine && el.width < 14 ? 14 : Math.max(size.width, 8);
  const hitH = isLine && el.height < 14 ? 14 : Math.max(size.height, 8);
  const hitX = isLine && el.width < 14 ? -7 : 0;
  const hitY = isLine && el.height < 14 ? -7 : size.height < 6 ? -3 : 0;

  return (
    <Group
      id={el.id}
      x={el.x}
      y={el.y}
      width={size.width}
      height={size.height}
      rotation={el.rotation}
      opacity={el.opacity}
      draggable={draggable}
      locked={el.locked}
      onClick={(e) => onClick(e, el.id)}
      onTap={(e) => onClick(e, el.id)}
      onDblClick={() => onDblClick?.(el.id)}
      onDblTap={() => onDblClick?.(el.id)}
      onDragEnd={(e) => onDragEnd(e, el.id)}
    >
      {/* generous hit area so lines and small elements are easily clickable */}
      <Rect x={hitX} y={hitY} width={hitW} height={hitH} fill="transparent" />
      <ElementBody el={el} fields={fields} selected={selected} designMode />
      {el.locked && selected && <Rect width={size.width} height={size.height} stroke="#ef4444" strokeWidth={1} dash={[2, 2]} listening={false} />}
    </Group>
  );
});
