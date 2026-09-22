import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  BOXES, CMR_COPIES, CMR_LEGAL_CLAUSE, GOODS, PAGE, TITLE_BOX, X0, X1, XM,
  adrTop, goodsBottom, totalsTop,
} from "./layout";

/**
 * Builds the empty, standard 24-box CMR consignment note as a 4-page vector PDF
 * (one page per legal copy: sender red, consignee blue, carrier green, administrative black).
 * It is uploaded as the background of the seeded "Standard CMR" template, so the admin
 * can later replace it with a scanned company form in the designer without code changes.
 */
export async function buildCmrFormPdf(opts: { companyLine?: string } = {}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("CMR – International consignment note (blank form)");
  pdf.setCreator("HydraSpecma CMR Platform");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  for (const copy of CMR_COPIES) {
    const page = pdf.addPage([PAGE.width, PAGE.height]);
    drawForm(page, { regular, bold, italic }, hex(copy.color), copy, opts.companyLine);
  }
  return pdf.save();
}

function hex(h: string) {
  const n = parseInt(h.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont };

function drawForm(page: PDFPage, f: Fonts, ink: ReturnType<typeof rgb>, copy: (typeof CMR_COPIES)[number], companyLine?: string) {
  const H = PAGE.height;
  const Y = (top: number) => H - top; // top-left → pdf
  const rect = (x: number, top: number, w: number, h: number, width = 0.8) =>
    page.drawRectangle({ x, y: Y(top + h), width: w, height: h, borderColor: ink, borderWidth: width });
  const hline = (x1: number, x2: number, top: number, width = 0.6) =>
    page.drawLine({ start: { x: x1, y: Y(top) }, end: { x: x2, y: Y(top) }, thickness: width, color: ink });
  const vline = (x: number, top1: number, top2: number, width = 0.6) =>
    page.drawLine({ start: { x, y: Y(top1) }, end: { x, y: Y(top2) }, thickness: width, color: ink });
  const text = (s: string, x: number, top: number, size: number, font = f.regular, color = ink) =>
    page.drawText(s, { x, y: Y(top) - size, size, font, color });
  const fitText = (s: string, x: number, top: number, maxW: number, size: number, font = f.regular, color = ink) => {
    let sz = size;
    while (sz > 4 && font.widthOfTextAtSize(s, sz) > maxW) sz -= 0.25;
    text(s, x, top, sz, font, color);
  };
  const numBadge = (no: string, x: number, top: number) => {
    const w = f.bold.widthOfTextAtSize(no, 8) + 5;
    page.drawRectangle({ x, y: Y(top + 10), width: w, height: 10, color: ink });
    page.drawText(no, { x: x + 2.5, y: Y(top + 8.2), size: 8, font: f.bold, color: rgb(1, 1, 1) });
    return w;
  };

  // outer frame
  rect(X0, 20, X1 - X0, 760, 1.2);

  // ── title block (top right)
  const t = TITLE_BOX;
  rect(t.x, t.y, t.w, t.h);
  text("INTERNATIONAL CONSIGNMENT NOTE", t.x + 6, t.y + 5, 7.5, f.bold);
  text("Internationaler Frachtbrief", t.x + 6, t.y + 14, 6.5, f.italic);
  text("No.", t.x + 150, t.y + 20, 7, f.bold);
  page.drawText("CMR", { x: t.x + 6, y: Y(t.y + 52), size: 30, font: f.bold, color: ink });
  // legal clause, wrapped
  const clauseLines = wrap(CMR_LEGAL_CLAUSE, f.regular, 5.6, t.w - 80);
  clauseLines.forEach((ln, i) => text(ln, t.x + 74, t.y + 30 + i * 6.8, 5.6));
  // copy label
  const copyLabel = `${copy.no}  ${copy.en.toUpperCase()}`;
  text(copyLabel, t.x + 74, t.y + 64, 7, f.bold);
  text(copy.de, t.x + 74 + f.bold.widthOfTextAtSize(copyLabel, 7) + 6, t.y + 64.6, 6, f.italic);

  // ── numbered boxes
  for (const b of BOXES) {
    rect(b.x, b.y, b.w, b.h);
    const bw = numBadge(b.no, b.x + 2, b.y + 2);
    fitText(b.en, b.x + bw + 5, b.y + 2.5, b.w - bw - 10, 6.3, f.bold);
    fitText(b.de, b.x + bw + 5, b.y + 9, b.w - bw - 10, 5.2, f.italic);
  }

  // box 14 – check-box captions
  const b14 = BOXES.find((b) => b.no === "14")!;
  rect(b14.x + 6, b14.y + 17, 9, 9, 0.7);
  text("Carriage paid / Frei", b14.x + 19, b14.y + 18.5, 7);
  rect(b14.x + 120, b14.y + 17, 9, 9, 0.7);
  text("Carriage forward / Unfrei", b14.x + 133, b14.y + 18.5, 7);

  // box 20 – payment grid (Sender | Currency | Consignee)
  const b20 = BOXES.find((b) => b.no === "20")!;
  const gx = b20.x + 100;
  const cols = [gx, gx + 60, gx + 110, b20.x + b20.w];
  const gTop = b20.y + 16;
  hline(b20.x, b20.x + b20.w, gTop, 0.4);
  ["Sender", "Currency", "Consignee"].forEach((h, i) => text(h, cols[i] + 3, gTop + 2, 6, f.bold));
  const rows = ["Carriage charges", "Deductions", "Balance", "Supplementary charges", "Other charges", "TOTAL"];
  rows.forEach((r, i) => {
    const top = gTop + 11 + i * 10.5;
    hline(b20.x, b20.x + b20.w, top, 0.3);
    text(r, b20.x + 3, top + 2, 6, r === "TOTAL" ? f.bold : f.regular);
  });
  cols.slice(0, 3).forEach((cx) => vline(cx, gTop, b20.y + b20.h, 0.3));

  // box 21 caption for date
  const b21 = BOXES.find((b) => b.no === "21")!;
  text("on / am", b21.x + 330, b21.y + 11, 7);

  // boxes 22–24 – place/date line inside 24
  const b24 = BOXES.find((b) => b.no === "24")!;
  text("Place / Ort:", b24.x + 4, b24.y + 24, 6.5);
  text("Date / Datum:", b24.x + 4, b24.y + 36, 6.5);
  hline(b24.x + 52, b24.x + b24.w - 6, b24.y + 32, 0.3);
  hline(b24.x + 52, b24.x + b24.w - 6, b24.y + 44, 0.3);

  // ── goods table 6–12
  const gy = GOODS.y;
  rect(X0, gy, X1 - X0, goodsBottom() - gy);
  let x = X0;
  GOODS.columns.forEach((c, i) => {
    if (i > 0) vline(x, gy, totalsTop() + GOODS.totalsH);
    const bw = numBadge(c.no, x + 2, gy + 2);
    const lines = wrap(c.en, f.bold, 5.8, c.w - bw - 6);
    lines.slice(0, 2).forEach((ln, li) => text(ln, x + bw + 4, gy + 2.5 + li * 6.8, 5.8, f.bold));
    const deLines = wrap(c.de, f.italic, 5, c.w - 6);
    text(deLines[0] ?? "", x + 3, gy + 20, 5, f.italic);
    x += c.w;
  });
  hline(X0, X1, gy + GOODS.headerH, 0.8);
  for (let r = 1; r < GOODS.rows; r++) hline(X0, X1, gy + GOODS.headerH + r * GOODS.rowH, 0.25);
  hline(X0, X1, totalsTop(), 0.8);
  text("Total / Summe", X0 + 4, totalsTop() + 5, 7, f.bold);
  hline(X0, X1, adrTop(), 0.8);
  text("ADR  Class / Klasse", X0 + 4, adrTop() + 5, 6.5, f.bold);
  text("UN No.", X0 + 150, adrTop() + 5, 6.5, f.bold);
  text("Letter / Ziffer", X0 + 255, adrTop() + 5, 6.5, f.bold);
  text("Description", X0 + 365, adrTop() + 5, 6.5, f.bold);

  // ── footer band with copy colour
  page.drawRectangle({ x: X0, y: Y(806), width: X1 - X0, height: 18, color: ink });
  const footer = `${copy.no}  ${copy.en.toUpperCase()}  ·  ${copy.de}`;
  page.drawText(footer, { x: X0 + 6, y: Y(801.5), size: 8, font: f.bold, color: rgb(1, 1, 1) });
  const right = companyLine || "CMR – UNECE Convention, Geneva 19 May 1956";
  page.drawText(right, { x: X1 - 6 - f.regular.widthOfTextAtSize(right, 6.5), y: Y(800.5), size: 6.5, font: f.regular, color: rgb(1, 1, 1) });
  void XM;
}

function wrap(s: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}
