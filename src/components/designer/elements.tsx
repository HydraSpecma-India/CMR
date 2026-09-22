"use client";

import { useEffect, useState } from "react";
import { Group, Rect, Text, Line, Image as KImage } from "react-konva";
import type Konva from "konva";
import type { TemplateElement, TextStyle } from "@/lib/template/schema";
import type { FieldDef } from "./store";
import { loadAssetImage } from "./background";

/** Browser font fallbacks for the PDF standard fonts. */
export const FONT_MAP: Record<string, string> = {
  Helvetica: "Helvetica, Arial, sans-serif",
  "Times-Roman": "'Times New Roman', Times, serif",
  Courier: "'Courier New', Courier, monospace",
};
export const fontFamilyCss = (f: string) => FONT_MAP[f] ?? `${f}, Arial, sans-serif`;

const fontStyle = (s: TextStyle) => [s.bold && "bold", s.italic && "italic"].filter(Boolean).join(" ") || "normal";

function TextBox({ text, style, width, height, placeholder }: { text: string; style: TextStyle; width: number; height: number; placeholder?: boolean }) {
  return (
    <Text
      text={text}
      width={width}
      height={height}
      fontFamily={fontFamilyCss(style.fontFamily)}
      fontSize={style.fontSize}
      fontStyle={fontStyle(style)}
      textDecoration={style.underline ? "underline" : ""}
      fill={placeholder ? "#1d4ed8" : style.color}
      align={style.align}
      verticalAlign={style.valign}
      padding={style.padding}
      lineHeight={style.lineHeight}
      letterSpacing={style.letterSpacing}
      wrap={style.wrap ? "word" : "none"}
      ellipsis={style.overflow === "clip"}
      listening={false}
    />
  );
}

const SOURCE_COLORS: Record<string, string> = {
  D365FO: "#2563eb",
  MANUAL: "#d97706",
  SYSTEM: "#7c3aed",
  STATIC: "#475569",
  SIGNATURE: "#0f766e",
  IMAGE: "#0f766e",
  CUSTOM: "#db2777",
};

interface Props {
  el: TemplateElement;
  fields: FieldDef[];
  selected: boolean;
  designMode: boolean;
}

/** Renders one template element on the Konva canvas (children of a positioned <Group>). */
export function ElementBody({ el, fields, selected, designMode }: Props) {
  const w = el.width;
  const h = el.height;

  switch (el.type) {
    case "text":
      return (
        <>
          {(el.background || el.border?.width) && (
            <Rect width={w} height={h} fill={el.background ?? undefined} stroke={el.border?.width ? el.border.color : undefined} strokeWidth={el.border?.width ?? 0} listening={false} />
          )}
          <TextBox text={el.text} style={el.style} width={w} height={h} />
        </>
      );

    case "field": {
      const def = fields.find((f) => f.field_name === el.fieldName);
      const source = def?.source_type ?? "CUSTOM";
      const label = el.binding.showLabel ? el.binding.label ?? def?.display_name ?? el.fieldName : `{${def?.display_name ?? el.fieldName}}`;
      return (
        <>
          <Rect
            width={w}
            height={h}
            fill={el.background ?? (designMode ? `${SOURCE_COLORS[source] ?? "#64748b"}14` : undefined)}
            stroke={el.border?.width ? el.border.color : designMode ? SOURCE_COLORS[source] ?? "#64748b" : undefined}
            strokeWidth={el.border?.width || (designMode ? 0.6 : 0)}
            dash={designMode && !el.border?.width ? [3, 2] : undefined}
            listening={false}
          />
          <TextBox text={label} style={el.style} width={w} height={h} placeholder={designMode} />
        </>
      );
    }

    case "image":
      return <ImageBody el={el} designMode={designMode} />;

    case "signature":
      return (
        <>
          <Rect width={w} height={h} stroke={el.border?.width ? el.border.color : designMode ? SOURCE_COLORS.SIGNATURE : undefined} strokeWidth={el.border?.width || (designMode ? 0.6 : 0)} dash={designMode ? [3, 2] : undefined} fill={designMode ? "#0f766e10" : undefined} listening={false} />
          {designMode && <Text text="✍ Signature" width={w} height={h} align="center" verticalAlign="middle" fontSize={Math.min(10, h * 0.5)} fill={SOURCE_COLORS.SIGNATURE} listening={false} />}
        </>
      );

    case "checkbox":
      return (
        <>
          <Rect width={w} height={h} stroke={el.style.color} strokeWidth={el.style.lineWidth} listening={false} />
          {(el.checked || (designMode && el.fieldName)) && (
            <Line points={[w * 0.2, h * 0.5, w * 0.42, h * 0.75, w * 0.8, h * 0.22]} stroke={designMode && !el.checked ? "#94a3b8" : el.style.color} strokeWidth={el.style.lineWidth * 1.2} lineCap="round" lineJoin="round" listening={false} />
          )}
        </>
      );

    case "line":
      return (
        <>
          <Line points={[0, 0, w, h]} stroke={el.stroke.color} strokeWidth={el.stroke.width} dash={el.stroke.dash} listening={false} />
          {/* fat invisible hit area */}
          <Line points={[0, 0, w, h]} stroke="transparent" strokeWidth={Math.max(8, el.stroke.width)} />
        </>
      );

    case "rect":
      return <Rect width={w} height={h} stroke={el.stroke.width ? el.stroke.color : undefined} strokeWidth={el.stroke.width} dash={el.stroke.dash} fill={el.fill ?? (designMode ? "rgba(0,0,0,0.001)" : undefined)} cornerRadius={el.cornerRadius} />;

    case "table":
      return <TableBody el={el} fields={fields} designMode={designMode} />;
  }
  void selected;
  return null;
}

function ImageBody({ el, designMode }: { el: Extract<TemplateElement, { type: "image" }>; designMode: boolean }) {
  const [loaded, setLoaded] = useState<{ assetId: string; img: HTMLImageElement } | null>(null);
  useEffect(() => {
    let alive = true;
    const id = el.assetId;
    if (id) loadAssetImage(id).then((i) => alive && setLoaded({ assetId: id, img: i })).catch(() => {});
    return () => {
      alive = false;
    };
  }, [el.assetId]);
  const img = loaded && loaded.assetId === el.assetId ? loaded.img : null;

  const w = el.width;
  const h = el.height;
  let dw = w, dh = h, dx = 0, dy = 0;
  if (img && el.fit !== "stretch") {
    const r = img.width / img.height;
    if (el.fit === "contain") {
      if (w / h > r) { dh = h; dw = h * r; } else { dw = w; dh = w / r; }
    } else {
      if (w / h > r) { dw = w; dh = w / r; } else { dh = h; dw = h * r; }
    }
    dx = (w - dw) / 2;
    dy = (h - dh) / 2;
  }
  return (
    <>
      <Rect width={w} height={h} stroke={el.border?.width ? el.border.color : designMode && !img ? "#94a3b8" : undefined} strokeWidth={el.border?.width || (designMode && !img ? 0.6 : 0)} dash={!img && designMode ? [3, 2] : undefined} fill={!img && designMode ? "#f1f5f9" : undefined} />
      {img ? (
        <Group clipX={0} clipY={0} clipWidth={w} clipHeight={h}>
          <KImage image={img} x={dx} y={dy} width={dw} height={dh} crop={el.crop} listening={false} />
        </Group>
      ) : (
        designMode && <Text text={el.fieldName ? `{${el.fieldName}}` : "Image"} width={w} height={h} align="center" verticalAlign="middle" fontSize={9} fill="#64748b" listening={false} />
      )}
    </>
  );
}

function TableBody({ el, fields, designMode }: { el: Extract<TemplateElement, { type: "table" }>; fields: FieldDef[]; designMode: boolean }) {
  const cols = el.columns;
  const totalW = cols.reduce((s, c) => s + c.width, 0);
  const headerH = el.showHeader ? el.headerHeight : 0;
  const totalH = headerH + el.rows.length * el.rowHeight;
  const nodes: React.ReactNode[] = [];
  const hStyle = { ...el.style, ...el.headerStyle } as TextStyle;

  let x = 0;
  if (el.showHeader) {
    cols.forEach((c, ci) => {
      nodes.push(<Rect key={`h${ci}`} x={x} y={0} width={c.width} height={headerH} fill={el.headerStyle.fill} listening={false} />);
      nodes.push(<Group key={`ht${ci}`} x={x} y={0}><TextBox text={c.header} style={hStyle} width={c.width} height={headerH} /></Group>);
      x += c.width;
    });
  }
  el.rows.forEach((row, ri) => {
    let cx = 0;
    const y = headerH + ri * el.rowHeight;
    row.forEach((cell, ci) => {
      const col = cols[ci];
      if (!col) return;
      const span = cell.colSpan ?? 1;
      const cw = cols.slice(ci, ci + span).reduce((s, c) => s + c.width, 0);
      const def = cell.fieldName ? fields.find((f) => f.field_name === cell.fieldName) : undefined;
      const text = cell.fieldName ? (designMode ? `{${def?.display_name ?? cell.fieldName}}` : "") : cell.text ?? "";
      const style = { ...el.style, ...(cell.style ?? {}) } as TextStyle;
      nodes.push(
        <Group key={`c${ri}-${ci}`} x={cx} y={y}>
          {cell.fieldName && designMode && <Rect width={cw} height={el.rowHeight} fill={`${SOURCE_COLORS[def?.source_type ?? "CUSTOM"] ?? "#64748b"}14`} listening={false} />}
          <TextBox text={text} style={style} width={cw} height={el.rowHeight} placeholder={Boolean(cell.fieldName) && designMode} />
        </Group>,
      );
      cx += cw;
    });
  });

  // grid lines
  const bw = el.border.width;
  if (bw > 0) {
    let gx = 0;
    for (let ci = 0; ci <= cols.length; ci++) {
      nodes.push(<Line key={`v${ci}`} points={[gx, 0, gx, totalH]} stroke={el.border.color} strokeWidth={bw} listening={false} />);
      gx += cols[ci]?.width ?? 0;
    }
    const rowsCount = el.rows.length + (el.showHeader ? 1 : 0);
    let gy = 0;
    for (let ri = 0; ri <= rowsCount; ri++) {
      nodes.push(<Line key={`hl${ri}`} points={[0, gy, totalW, gy]} stroke={el.border.color} strokeWidth={bw} listening={false} />);
      gy += ri === 0 && el.showHeader ? headerH : el.rowHeight;
    }
  }
  return (
    <>
      <Rect width={totalW} height={totalH} fill="rgba(0,0,0,0.001)" />
      {nodes}
    </>
  );
}

/** Table geometry is derived from columns/rows – keep width/height in sync. */
export function tableSize(el: Extract<TemplateElement, { type: "table" }>) {
  return {
    width: el.columns.reduce((s, c) => s + c.width, 0),
    height: (el.showHeader ? el.headerHeight : 0) + el.rows.length * el.rowHeight,
  };
}

export type KonvaNode = Konva.Node;
