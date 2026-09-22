/**
 * Standard CMR consignment note (UNECE Convention, Geneva 1956) – single source of truth for
 *  • the vector form printed as template background   (src/lib/cmr/form-pdf.ts)
 *  • the seed template placing one field per box       (src/lib/template/seed-cmr.ts)
 *  • the wizard sections (box → field names)           (src/app/(app)/cmr/new/cmr-wizard.tsx)
 *
 * Coordinates are PDF points on A4 (595.28 × 841.89) with a TOP-LEFT origin, exactly like the
 * template JSON. Client-safe (no server imports).
 */

export const PAGE = { width: 595.28, height: 841.89 } as const;
export const X0 = 20;
export const X1 = 575;
export const XM = 297.5; // left / right column split

/** The four legal copies of a CMR. One template page per copy. */
export const CMR_COPIES = [
  { no: 1, en: "Copy for sender", de: "Exemplar für den Absender", color: "#C8102E" },
  { no: 2, en: "Copy for consignee", de: "Exemplar für den Empfänger", color: "#1F4E9E" },
  { no: 3, en: "Copy for carrier", de: "Exemplar für den Frachtführer", color: "#1E7B34" },
  { no: 4, en: "Administrative copy", de: "Verwaltungsexemplar", color: "#222222" },
] as const;

export const CMR_LEGAL_CLAUSE =
  "This carriage is subject, notwithstanding any clause to the contrary, to the Convention on the Contract for the International Carriage of Goods by Road (CMR).";

export interface Box {
  no: string;
  en: string;
  de: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const L = (no: string, en: string, de: string, y: number, h: number): Box => ({ no, en, de, x: X0, y, w: XM - X0, h });
const R = (no: string, en: string, de: string, y: number, h: number): Box => ({ no, en, de, x: XM, y, w: X1 - XM, h });

/** Numbered boxes (goods table 6–12 is described separately). */
export const BOXES: Box[] = [
  L("1", "Sender (name, address, country)", "Absender (Name, Anschrift, Land)", 20, 76),
  L("2", "Consignee (name, address, country)", "Empfänger (Name, Anschrift, Land)", 96, 76),
  R("16", "Carrier (name, address, country)", "Frachtführer (Name, Anschrift, Land)", 96, 76),
  L("3", "Place of delivery of the goods (place, country)", "Auslieferungsort des Gutes (Ort, Land)", 172, 38),
  R("17", "Successive carriers (name, address, country)", "Nachfolgende Frachtführer", 172, 76),
  L("4", "Place and date of taking over the goods (place, country, date)", "Ort und Tag der Übernahme des Gutes", 210, 38),
  L("5", "Documents attached", "Beigefügte Dokumente", 248, 44),
  R("18", "Carrier's reservations and observations", "Vorbehalte und Bemerkungen der Frachtführer", 248, 44),
  L("13", "Sender's instructions (customs and other formalities)", "Anweisungen des Absenders (Zoll- und sonstige amtliche Behandlung)", 502, 70),
  R("19", "Special agreements", "Besondere Vereinbarungen", 502, 56),
  L("14", "Instructions as to payment for carriage", "Frachtzahlungsanweisungen", 572, 38),
  R("20", "To be paid by", "Zu zahlen vom", 558, 92),
  L("15", "Cash on delivery", "Rückerstattung / Nachnahme", 610, 40),
  { no: "21", en: "Established in", de: "Ausgefertigt in", x: X0, y: 650, w: X1 - X0, h: 26 },
  { no: "22", en: "Signature and stamp of the sender", de: "Unterschrift und Stempel des Absenders", x: X0, y: 676, w: 185, h: 104 },
  { no: "23", en: "Signature and stamp of the carrier", de: "Unterschrift und Stempel des Frachtführers", x: 205, y: 676, w: 185, h: 104 },
  { no: "24", en: "Goods received – signature and stamp of the consignee", de: "Gut empfangen – Unterschrift und Stempel des Empfängers", x: 390, y: 676, w: 185, h: 104 },
];

/** Title block (top right) */
export const TITLE_BOX = { x: XM, y: 20, w: X1 - XM, h: 76 } as const;

/** Goods table – boxes 6 to 12 */
export const GOODS = {
  y: 292,
  headerH: 30,
  rowH: 24,
  rows: 6,
  totalsH: 18,
  adrH: 18,
  columns: [
    { key: "Marks", no: "6", en: "Marks and Nos", de: "Kennzeichen u. Nummern", w: 80, align: "left" },
    { key: "Packages", no: "7", en: "Number of packages", de: "Anzahl der Packstücke", w: 55, align: "right" },
    { key: "Packing", no: "8", en: "Method of packing", de: "Art der Verpackung", w: 70, align: "left" },
    { key: "Nature", no: "9", en: "Nature of the goods", de: "Bezeichnung des Gutes", w: 170, align: "left" },
    { key: "StatNo", no: "10", en: "Statistical number", de: "Statistische Nummer", w: 60, align: "left" },
    { key: "GrossWeight", no: "11", en: "Gross weight in kg", de: "Bruttogewicht in kg", w: 60, align: "right" },
    { key: "Volume", no: "12", en: "Volume in m³", de: "Umfang in m³", w: 60, align: "right" },
  ],
} as const;

export type GoodsColumnKey = (typeof GOODS.columns)[number]["key"];

export const goodsField = (row: number, key: GoodsColumnKey) => `Goods${row}${key}`;
export const goodsTop = () => GOODS.y + GOODS.headerH;
export const totalsTop = () => GOODS.y + GOODS.headerH + GOODS.rows * GOODS.rowH;
export const adrTop = () => totalsTop() + GOODS.totalsH;
export const goodsBottom = () => adrTop() + GOODS.adrH;

/** Field placement per box: [fieldName, x, y, w, h, opts]. y is absolute (top-left). */
export interface FieldSlot {
  field: string;
  label: string;
  box: string;
  x: number;
  y: number;
  w: number;
  h: number;
  multiline?: boolean;
  fontSize?: number;
  bold?: boolean;
  align?: "left" | "center" | "right";
  kind?: "field" | "checkbox" | "signature";
}

const inBox = (no: string) => BOXES.find((b) => b.no === no)!;
const slot = (
  box: string,
  field: string,
  label: string,
  dx: number,
  dy: number,
  w: number | "fill",
  h: number | "fill",
  extra: Partial<FieldSlot> = {},
): FieldSlot => {
  const b = inBox(box);
  return {
    box,
    field,
    label,
    x: b.x + dx,
    y: b.y + dy,
    w: w === "fill" ? b.w - dx - 4 : w,
    h: h === "fill" ? b.h - dy - 3 : h,
    ...extra,
  };
};

export const FIELD_SLOTS: FieldSlot[] = [
  // header
  { box: "T", field: "CMRNumber", label: "CMR number", x: XM + 166, y: 37, w: X1 - XM - 170, h: 14, bold: true, fontSize: 10, align: "right" },
  slot("1", "SenderName", "Sender name", 4, 16, "fill", 12, { bold: true }),
  slot("1", "SenderAddress", "Sender address", 4, 28, "fill", "fill", { multiline: true }),
  slot("2", "ConsigneeName", "Consignee name", 4, 16, "fill", 12, { bold: true }),
  slot("2", "ConsigneeAddress", "Consignee address", 4, 28, "fill", "fill", { multiline: true }),
  slot("16", "CarrierName", "Carrier name", 4, 16, "fill", 12, { bold: true }),
  slot("16", "CarrierAddress", "Carrier address", 4, 28, "fill", 30, { multiline: true }),
  slot("16", "VehicleRegistration", "Vehicle / trailer registration", 4, 60, "fill", 12, { fontSize: 8 }),
  slot("3", "DeliveryPlace", "Place of delivery", 4, 16, "fill", 18, { multiline: true }),
  slot("17", "SuccessiveCarriers", "Successive carriers", 4, 16, "fill", "fill", { multiline: true }),
  slot("4", "TakingOverPlace", "Place of taking over", 4, 16, 190, 18, { multiline: true }),
  slot("4", "TakingOverDate", "Date of taking over", 196, 16, "fill", 18, { align: "right" }),
  slot("5", "DocumentsAttached", "Documents attached", 4, 14, "fill", "fill", { multiline: true }),
  slot("18", "CarrierReservations", "Carrier's reservations", 4, 14, "fill", "fill", { multiline: true }),
  slot("13", "SenderInstructions", "Sender's instructions", 4, 16, "fill", "fill", { multiline: true }),
  slot("19", "SpecialAgreements", "Special agreements", 4, 14, "fill", "fill", { multiline: true }),
  slot("14", "CarriagePaid", "Carriage paid (Frei)", 6, 17, 9, 9, { kind: "checkbox" }),
  slot("14", "CarriageForward", "Carriage forward (Unfrei)", 120, 17, 9, 9, { kind: "checkbox" }),
  slot("15", "CashOnDelivery", "Cash on delivery", 4, 14, "fill", "fill"),
  slot("20", "ToBePaidBy", "To be paid by", 4, 14, "fill", "fill", { multiline: true, fontSize: 8 }),
  slot("21", "EstablishedPlace", "Established in (place)", 70, 4, 250, 18),
  slot("21", "EstablishedDate", "Established on (date)", 360, 4, 190, 18),
  slot("22", "SenderSignature", "Sender signature", 6, 24, 173, 56, { kind: "signature" }),
  slot("22", "SenderSignatoryName", "Signed by (sender)", 6, 82, 173, 12, { fontSize: 7.5, align: "center" }),
  slot("23", "CarrierSignature", "Carrier signature", 6, 24, 173, 56, { kind: "signature" }),
  slot("23", "CarrierSignatoryName", "Signed by (carrier / driver)", 6, 82, 173, 12, { fontSize: 7.5, align: "center" }),
];

/** Goods rows + totals + ADR as field slots (generated). */
export function goodsSlots(): FieldSlot[] {
  const out: FieldSlot[] = [];
  for (let r = 1; r <= GOODS.rows; r++) {
    let x = X0;
    for (const c of GOODS.columns) {
      out.push({
        box: c.no,
        field: goodsField(r, c.key),
        label: `Line ${r} – ${c.en}`,
        x: x + 1,
        y: goodsTop() + (r - 1) * GOODS.rowH + 1,
        w: c.w - 2,
        h: GOODS.rowH - 2,
        multiline: c.key === "Nature" || c.key === "Marks" || c.key === "Packing",
        fontSize: 8,
        align: c.align,
      });
      x += c.w;
    }
  }
  // totals row under 7, 11, 12
  let x = X0;
  for (const c of GOODS.columns) {
    const map: Partial<Record<GoodsColumnKey, string>> = { Packages: "TotalPackages", GrossWeight: "TotalGrossWeight", Volume: "TotalVolume" };
    const f = map[c.key];
    if (f) out.push({ box: c.no, field: f, label: `Total – ${c.en}`, x: x + 1, y: totalsTop() + 1, w: c.w - 2, h: GOODS.totalsH - 2, fontSize: 8, bold: true, align: "right" });
    x += c.w;
  }
  // ADR row
  const y = adrTop() + 2;
  out.push({ box: "ADR", field: "AdrClass", label: "ADR class", x: X0 + 70, y, w: 60, h: GOODS.adrH - 4, fontSize: 8 });
  out.push({ box: "ADR", field: "AdrNumber", label: "ADR UN number", x: X0 + 180, y, w: 70, h: GOODS.adrH - 4, fontSize: 8 });
  out.push({ box: "ADR", field: "AdrLetter", label: "ADR letter / packing group", x: X0 + 300, y, w: 60, h: GOODS.adrH - 4, fontSize: 8 });
  out.push({ box: "ADR", field: "AdrDescription", label: "ADR description", x: X0 + 400, y, w: X1 - X0 - 404, h: GOODS.adrH - 4, fontSize: 8 });
  return out;
}

export const ALL_SLOTS = (): FieldSlot[] => [...FIELD_SLOTS, ...goodsSlots()];

/** Wizard sections – which fields the user sees under which box heading. */
export const WIZARD_SECTIONS: { title: string; boxes: string; fields: string[] }[] = [
  { title: "Sender", boxes: "Box 1", fields: ["SenderName", "SenderAddress"] },
  { title: "Consignee", boxes: "Box 2", fields: ["ConsigneeName", "ConsigneeAddress"] },
  { title: "Delivery & taking over", boxes: "Boxes 3–4", fields: ["DeliveryPlace", "TakingOverPlace", "TakingOverDate"] },
  { title: "Documents attached", boxes: "Box 5", fields: ["DocumentsAttached"] },
  { title: "Carrier", boxes: "Boxes 16–18", fields: ["CarrierName", "CarrierAddress", "VehicleRegistration", "SuccessiveCarriers", "CarrierReservations"] },
  { title: "Dangerous goods (ADR)", boxes: "Goods table", fields: ["AdrClass", "AdrNumber", "AdrLetter", "AdrDescription"] },
  { title: "Instructions & payment", boxes: "Boxes 13–15, 19–20", fields: ["SenderInstructions", "CarriagePaid", "CarriageForward", "CashOnDelivery", "SpecialAgreements", "ToBePaidBy"] },
  { title: "Established & signatures", boxes: "Boxes 21–23", fields: ["EstablishedPlace", "EstablishedDate", "SenderSignatoryName", "CarrierSignatoryName"] },
];

/** Fields the CMR must contain to be legally valid (checklist in "CMR rules and definitions"). */
export const REQUIRED_FIELDS = [
  "SenderName",
  "SenderAddress",
  "ConsigneeName",
  "ConsigneeAddress",
  "CarrierName",
  "DeliveryPlace",
  "TakingOverPlace",
  "TakingOverDate",
  "EstablishedPlace",
  "EstablishedDate",
] as const;

export const labelFor = (field: string) => ALL_SLOTS().find((s) => s.field === field)?.label ?? field;
export const isCheckboxField = (field: string) => ALL_SLOTS().some((s) => s.field === field && s.kind === "checkbox");
export const isMultilineField = (field: string) => ALL_SLOTS().some((s) => s.field === field && s.multiline);
