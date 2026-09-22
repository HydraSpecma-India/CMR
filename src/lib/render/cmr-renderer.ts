import "server-only";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { supabaseAdmin, Buckets } from "@/lib/db/supabase-admin";
import { buildCmrFormPdf } from "@/lib/cmr/form-pdf";
import { buildCmrSeed } from "@/lib/template/seed-cmr";
import { GOODS } from "@/lib/cmr/layout";
import type { CmrGoodsLine } from "@/lib/cmr/types";
import { logger } from "@/lib/logging/logger";

/**
 * Generic, template-driven renderer. Every element of every template page is painted from the
 * template JSON – nothing is special-cased per field name. Values come from `values`
 * (field name → text) and `signatures` (field name → PNG/JPEG data URL).
 */
export interface CmrRenderInput {
  templateVersionId?: string | null;
  values: Record<string, string>;
  signatures?: Record<string, string | undefined>;
  /** all goods lines – when there are more than fit on the form, a continuation sheet is added */
  goods?: CmrGoodsLine[];
  isDraft?: boolean;
  /** limit output to some copies (1-based page numbers); default all */
  pages?: number[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- template elements are validated by zod on save
type AnyEl = Record<string, any>;

const TTL = 300_000;
const versionCache = new Map<string, { json: AnyEl; bgAssetId: string | null; at: number }>();
const assetCache = new Map<string, { bytes: Uint8Array; mime: string }>();
let builtInForm: Uint8Array | null = null;

export function clearRenderCaches() {
  versionCache.clear();
  assetCache.clear();
}

async function loadVersion(id: string) {
  const c = versionCache.get(id);
  if (c && Date.now() - c.at < TTL) return c;
  const { data } = await supabaseAdmin().from("cmr_template_versions").select("template_json, background_asset_id").eq("id", id).maybeSingle();
  if (!data) return null;
  const v = { json: data.template_json as AnyEl, bgAssetId: (data.background_asset_id as string) ?? null, at: Date.now() };
  versionCache.set(id, v);
  return v;
}

async function loadAsset(id: string) {
  const c = assetCache.get(id);
  if (c) return c;
  const sb = supabaseAdmin();
  const { data: a } = await sb.from("cmr_template_assets").select("storage_path, mime_type").eq("id", id).maybeSingle();
  if (!a) return null;
  const { data: blob, error } = await sb.storage.from(Buckets.templateAssets).download(a.storage_path);
  if (error || !blob) return null;
  const v = { bytes: new Uint8Array(await blob.arrayBuffer()), mime: a.mime_type as string };
  assetCache.set(id, v);
  return v;
}

function hexColor(h?: string | null, fallback = rgb(0, 0, 0)) {
  const m = /^#?([0-9a-f]{6})$/i.exec(h || "");
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const TRUTHY = new Set(["yes", "true", "x", "1", "on", "checked", "ja"]);

interface FontSet {
  regular: PDFFont;
  bold: PDFFont;
}

async function loadFonts(pdf: PDFDocument): Promise<FontSet> {
  pdf.registerFontkit(fontkit);
  const dir = path.join(process.cwd(), "public", "fonts");
  let regular: PDFFont;
  let bold: PDFFont;
  try {
    regular = await pdf.embedFont(fs.readFileSync(path.join(dir, "DejaVuSansCondensed.ttf")), { subset: true });
    bold = await pdf.embedFont(fs.readFileSync(path.join(dir, "DejaVuSansCondensed-Bold.ttf")), { subset: true });
  } catch (e) {
    logger.warn("Unicode font not found – falling back to Helvetica (non-Latin-1 characters will be replaced)", { error: (e as Error).message });
    regular = await pdf.embedFont(StandardFonts.Helvetica);
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  }
  return { regular, bold };
}

/** Replace characters the font cannot encode. */
function safeText(font: PDFFont, s: string) {
  let out = "";
  for (const ch of s) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

function wrapLines(font: PDFFont, text: string, size: number, maxW: number, wrap: boolean): string[] {
  const paragraphs = text.replace(/\r/g, "").split("\n");
  if (!wrap) return paragraphs;
  const lines: string[] = [];
  for (const p of paragraphs) {
    const words = p.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let cur = "";
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) <= maxW || !cur) cur = test;
      else {
        lines.push(cur);
        cur = w;
      }
    }
    lines.push(cur);
  }
  return lines;
}

function drawTextBox(
  page: PDFPage,
  pageH: number,
  raw: string,
  box: { x: number; y: number; w: number; h: number },
  style: AnyEl,
  font: PDFFont,
) {
  if (!raw) return;
  const pad = typeof style.padding === "number" ? style.padding : 1;
  const text = safeText(font, raw);
  const maxW = Math.max(4, box.w - 2 * pad);
  const maxH = Math.max(4, box.h - 2 * pad);
  const lh = style.lineHeight || 1.15;
  const wrap = style.wrap !== false || text.includes("\n");
  let size = style.fontSize || 9;
  let lines = wrapLines(font, text, size, maxW, wrap);
  const fits = () => lines.length * size * lh <= maxH + 0.5 && lines.every((l) => font.widthOfTextAtSize(l, size) <= maxW + 0.1);
  while (!fits() && size > 5 && style.overflow !== "clip") {
    size -= 0.25;
    lines = wrapLines(font, text, size, maxW, wrap);
  }
  // hard clip: drop lines that don't fit, truncate long words
  const maxLines = Math.max(1, Math.floor((maxH + 0.5) / (size * lh)));
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, "…");
  }
  lines = lines.map((l) => {
    let s = l;
    while (s.length > 1 && font.widthOfTextAtSize(s, size) > maxW) s = s.slice(0, -1);
    return s;
  });
  const blockH = lines.length * size * lh;
  const valign = style.valign || "middle";
  const topOffset = valign === "top" ? pad : valign === "bottom" ? box.h - pad - blockH : (box.h - blockH) / 2;
  const color = hexColor(style.color);
  lines.forEach((ln, i) => {
    const w = font.widthOfTextAtSize(ln, size);
    const x = style.align === "center" ? box.x + (box.w - w) / 2 : style.align === "right" ? box.x + box.w - pad - w : box.x + pad;
    const baselineTop = box.y + topOffset + i * size * lh + size * 0.82;
    page.drawText(ln, { x, y: pageH - baselineTop, size, font, color });
    if (style.underline) {
      page.drawLine({ start: { x, y: pageH - baselineTop - 1 }, end: { x: x + w, y: pageH - baselineTop - 1 }, thickness: 0.5, color });
    }
  });
}

async function embedDataUrl(pdf: PDFDocument, dataUrl: string): Promise<PDFImage | null> {
  try {
    const b64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
    const bytes = Buffer.from(b64, "base64");
    const isJpg = dataUrl.startsWith("data:image/jp") || (bytes[0] === 0xff && bytes[1] === 0xd8);
    return isJpg ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
  } catch (e) {
    logger.warn("Could not embed image", { error: (e as Error).message });
    return null;
  }
}

function drawImageFit(page: PDFPage, pageH: number, img: PDFImage, box: { x: number; y: number; w: number; h: number }, fit: string = "contain") {
  let w = box.w;
  let h = box.h;
  if (fit !== "stretch") {
    const s = fit === "cover" ? Math.max(box.w / img.width, box.h / img.height) : Math.min(box.w / img.width, box.h / img.height);
    w = img.width * s;
    h = img.height * s;
  }
  page.drawImage(img, { x: box.x + (box.w - w) / 2, y: pageH - box.y - box.h + (box.h - h) / 2, width: w, height: h });
}

const interpolate = (s: string, values: Record<string, string>) => s.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (m, k) => (k in values ? values[k] : m));

export async function renderCmrPdf(rawInput: CmrRenderInput): Promise<Uint8Array> {
  // system values available to any field placed in the designer
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const input: CmrRenderInput = {
    ...rawInput,
    values: { CMRDate: today, CurrentDate: today, CurrentTime: time, CurrentDateTime: `${today} ${time}`, ...rawInput.values },
  };
  const pdf = await PDFDocument.create();
  pdf.setTitle(`CMR ${input.values.CMRNumber || ""}`.trim());
  pdf.setCreator("HydraSpecma CMR Platform");
  pdf.setProducer("pdf-lib");
  const fonts = await loadFonts(pdf);
  const timesR = await pdf.embedFont(StandardFonts.TimesRoman);
  const timesB = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const courR = await pdf.embedFont(StandardFonts.Courier);
  const courB = await pdf.embedFont(StandardFonts.CourierBold);
  const pickFont = (family: string | undefined, bold: boolean) =>
    family === "Times-Roman" ? (bold ? timesB : timesR) : family === "Courier" ? (bold ? courB : courR) : bold ? fonts.bold : fonts.regular;

  // 1. template
  let templateJson: AnyEl | null = null;
  if (input.templateVersionId) {
    const v = await loadVersion(input.templateVersionId);
    if (v) templateJson = v.json;
  }
  if (!templateJson) templateJson = buildCmrSeed(null) as unknown as AnyEl;

  const pageW = templateJson.page?.width || 595.28;
  const pageH = templateJson.page?.height || 841.89;
  const imageCache = new Map<string, PDFImage | null>();
  const bgDocCache = new Map<string, PDFDocument>();

  const wantPages: AnyEl[] = (templateJson.pages as AnyEl[]).filter((_, i) => !input.pages || input.pages.includes(i + 1));

  for (const tp of wantPages) {
    let page: PDFPage;
    // 2. background
    const bg = tp.background as { assetId: string; pageIndex?: number; opacity?: number } | null;
    const bgIndex = bg?.pageIndex ?? (templateJson.pages as AnyEl[]).indexOf(tp);
    let bgPdf: PDFDocument | null = null;
    let bgImage: PDFImage | null = null;
    if (bg?.assetId) {
      const a = await loadAsset(bg.assetId);
      if (a?.mime === "application/pdf") {
        bgPdf = bgDocCache.get(bg.assetId) ?? (await PDFDocument.load(a.bytes));
        bgDocCache.set(bg.assetId, bgPdf);
      } else if (a) {
        bgImage = a.mime === "image/png" ? await pdf.embedPng(a.bytes) : await pdf.embedJpg(a.bytes);
      } else {
        logger.warn("Template background asset missing – using built-in CMR form", { assetId: bg.assetId });
      }
    }
    if (!bg?.assetId || (!bgPdf && !bgImage)) {
      builtInForm ??= await buildCmrFormPdf();
      bgPdf = bgDocCache.get("__builtin") ?? (await PDFDocument.load(builtInForm));
      bgDocCache.set("__builtin", bgPdf);
    }
    if (bgPdf) {
      const idx = Math.min(Math.max(0, bgIndex), bgPdf.getPageCount() - 1);
      const [copied] = await pdf.copyPages(bgPdf, [idx]);
      page = pdf.addPage(copied);
    } else {
      page = pdf.addPage([pageW, pageH]);
      if (bgImage) page.drawImage(bgImage, { x: 0, y: 0, width: pageW, height: pageH, opacity: bg?.opacity ?? 1 });
    }
    const H = page.getHeight();

    // 3. elements
    for (const el of (tp.elements as AnyEl[]) ?? []) {
      if (el.hidden) continue;
      const box = { x: el.x, y: el.y, w: el.width, h: el.height };
      try {
        switch (el.type) {
          case "field": {
            const v = input.values[el.fieldName] ?? el.binding?.defaultValue ?? "";
            const st = el.style ?? {};
            if (el.background) page.drawRectangle({ x: box.x, y: H - box.y - box.h, width: box.w, height: box.h, color: hexColor(el.background, rgb(1, 1, 1)) });
            drawTextBox(page, H, String(v), box, st, pickFont(st.fontFamily, Boolean(st.bold)));
            break;
          }
          case "text": {
            const st = el.style ?? {};
            if (el.background) page.drawRectangle({ x: box.x, y: H - box.y - box.h, width: box.w, height: box.h, color: hexColor(el.background, rgb(1, 1, 1)) });
            drawTextBox(page, H, interpolate(String(el.text ?? ""), input.values), box, st, pickFont(st.fontFamily, Boolean(st.bold)));
            break;
          }
          case "checkbox": {
            const v = el.fieldName ? String(input.values[el.fieldName] ?? "").trim().toLowerCase() : el.checked ? "x" : "";
            if (TRUTHY.has(v)) {
              const c = hexColor(el.style?.color);
              const t = el.style?.lineWidth ?? 1.2;
              page.drawLine({ start: { x: box.x + 1.5, y: H - box.y - 1.5 }, end: { x: box.x + box.w - 1.5, y: H - box.y - box.h + 1.5 }, thickness: t, color: c });
              page.drawLine({ start: { x: box.x + 1.5, y: H - box.y - box.h + 1.5 }, end: { x: box.x + box.w - 1.5, y: H - box.y - 1.5 }, thickness: t, color: c });
            }
            break;
          }
          case "signature": {
            const data = input.signatures?.[el.fieldName];
            if (data) {
              if (!imageCache.has(data)) imageCache.set(data, await embedDataUrl(pdf, data));
              const img = imageCache.get(data);
              if (img) drawImageFit(page, H, img, { x: box.x + 2, y: box.y + 2, w: box.w - 4, h: box.h - 4 });
            }
            break;
          }
          case "image": {
            if (el.assetId) {
              const key = `asset:${el.assetId}`;
              if (!imageCache.has(key)) {
                const a = await loadAsset(el.assetId);
                imageCache.set(key, a ? (a.mime === "image/png" ? await pdf.embedPng(a.bytes) : a.mime === "image/jpeg" ? await pdf.embedJpg(a.bytes) : null) : null);
              }
              const img = imageCache.get(key);
              if (img) drawImageFit(page, H, img, box, el.fit);
            }
            break;
          }
          case "line": {
            page.drawLine({
              start: { x: box.x, y: H - box.y },
              end: { x: box.x + box.w, y: H - box.y - box.h },
              thickness: el.stroke?.width ?? 0.75,
              color: hexColor(el.stroke?.color),
              dashArray: el.stroke?.dash,
            });
            break;
          }
          case "rect": {
            page.drawRectangle({
              x: box.x,
              y: H - box.y - box.h,
              width: box.w,
              height: box.h,
              borderColor: (el.stroke?.width ?? 0.75) > 0 ? hexColor(el.stroke?.color) : undefined,
              borderWidth: el.stroke?.width ?? 0.75,
              color: el.fill ? hexColor(el.fill) : undefined,
            });
            break;
          }
          case "table": {
            const headerH = el.showHeader === false ? 0 : el.headerHeight ?? 18;
            const rowH = el.rowHeight ?? 18;
            const cols: AnyEl[] = el.columns ?? [];
            const border = { thickness: el.border?.width ?? 0.5, color: hexColor(el.border?.color) };
            let cx = box.x;
            if (headerH) {
              for (const c of cols) {
                page.drawRectangle({ x: cx, y: H - box.y - headerH, width: c.width, height: headerH, borderColor: border.color, borderWidth: border.thickness, color: el.headerStyle?.fill ? hexColor(el.headerStyle.fill) : undefined });
                drawTextBox(page, H, c.header ?? "", { x: cx, y: box.y, w: c.width, h: headerH }, { ...el.style, ...el.headerStyle, wrap: true }, pickFont(el.style?.fontFamily, true));
                cx += c.width;
              }
            }
            (el.rows as AnyEl[][] | undefined)?.forEach((row, ri) => {
              let x = box.x;
              let ci = 0;
              const top = box.y + headerH + ri * rowH;
              for (const cell of row) {
                const span = Math.max(1, cell.colSpan ?? 1);
                const w = cols.slice(ci, ci + span).reduce((n, c) => n + c.width, 0);
                page.drawRectangle({ x, y: H - top - rowH, width: w, height: rowH, borderColor: border.color, borderWidth: border.thickness });
                const val = cell.fieldName ? input.values[cell.fieldName] ?? "" : interpolate(cell.text ?? "", input.values);
                const st = { ...el.style, ...cell.style };
                drawTextBox(page, H, String(val), { x, y: top, w, h: rowH }, st, pickFont(st.fontFamily, Boolean(st.bold)));
                x += w;
                ci += span;
              }
            });
            break;
          }
        }
      } catch (err) {
        logger.warn("Could not draw element", { type: el.type, field: el.fieldName, error: (err as Error).message });
      }
    }

    if (input.isDraft) watermark(page, fonts.bold);
  }

  // 4. continuation sheet for goods lines that do not fit into boxes 6–12
  const goods = input.goods ?? [];
  if (goods.length > GOODS.rows) await addContinuation(pdf, goods, input.values, fonts, Boolean(input.isDraft));

  return pdf.save();
}

function watermark(page: PDFPage, font: PDFFont) {
  page.drawText("DRAFT / PREVIEW", { x: 110, y: 250, size: 62, font, color: rgb(0.75, 0.75, 0.75), rotate: degrees(45), opacity: 0.3 });
}

async function addContinuation(pdf: PDFDocument, goods: CmrGoodsLine[], values: Record<string, string>, fonts: FontSet, isDraft: boolean) {
  const cols = [
    { h: "Marks and Nos", w: 80, k: "marks" as const, a: "left" },
    { h: "Packages", w: 50, k: "packages" as const, a: "right" },
    { h: "Packing", w: 60, k: "packing" as const, a: "left" },
    { h: "Nature of the goods", w: 185, k: "nature" as const, a: "left" },
    { h: "Stat. No.", w: 60, k: "statNo" as const, a: "left" },
    { h: "Gross kg", w: 60, k: "grossWeight" as const, a: "right" },
    { h: "Volume m³", w: 60, k: "volume" as const, a: "right" },
  ];
  const rowH = 20;
  const perPage = 32;
  const pages = Math.ceil(goods.length / perPage);
  for (let p = 0; p < pages; p++) {
    const page = pdf.addPage([595.28, 841.89]);
    const H = page.getHeight();
    drawTextBox(page, H, `CMR No. ${values.CMRNumber ?? ""} – continuation sheet, boxes 6–12  (${p + 1}/${pages})`, { x: 20, y: 24, w: 555, h: 18 }, { fontSize: 11, bold: true }, fonts.bold);
    drawTextBox(page, H, `Sender: ${values.SenderName ?? ""}   ·   Consignee: ${values.ConsigneeName ?? ""}`, { x: 20, y: 44, w: 555, h: 14 }, { fontSize: 8 }, fonts.regular);
    let y = 66;
    let x = 20;
    for (const c of cols) {
      page.drawRectangle({ x, y: H - y - rowH, width: c.w, height: rowH, borderWidth: 0.6, borderColor: rgb(0, 0, 0), color: rgb(0.93, 0.93, 0.93) });
      drawTextBox(page, H, c.h, { x, y, w: c.w, h: rowH }, { fontSize: 7.5, bold: true, padding: 2 }, fonts.bold);
      x += c.w;
    }
    y += rowH;
    for (const g of goods.slice(p * perPage, (p + 1) * perPage)) {
      x = 20;
      for (const c of cols) {
        page.drawRectangle({ x, y: H - y - rowH, width: c.w, height: rowH, borderWidth: 0.4, borderColor: rgb(0, 0, 0) });
        drawTextBox(page, H, String(g[c.k] ?? ""), { x, y, w: c.w, h: rowH }, { fontSize: 7.5, align: c.a, padding: 2 }, fonts.regular);
        x += c.w;
      }
      y += rowH;
    }
    if (p === pages - 1) {
      drawTextBox(page, H, ["Total:", values.TotalPackages ? `${values.TotalPackages} packages` : "", values.TotalGrossWeight ? `${values.TotalGrossWeight} kg` : "", values.TotalVolume ? `${values.TotalVolume} m³` : ""].filter(Boolean).join("  "), { x: 20, y: y + 6, w: 555, h: 16 }, { fontSize: 9, bold: true, align: "right" }, fonts.bold);
    }
    if (isDraft) watermark(page, fonts.bold);
  }
}
