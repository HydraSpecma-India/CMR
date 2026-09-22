import { nanoid } from "nanoid";
import { A4, ElementSchema, type ElementType, type TemplateElement, type TemplateJson, type TemplatePage } from "./schema";

export const newId = (prefix = "el") => `${prefix}-${nanoid(8)}`;

export function emptyPage(name?: string): TemplatePage {
  return { id: newId("page"), name, background: null, elements: [] };
}

export function emptyTemplate(name: string, templateType = "CMR"): TemplateJson {
  return {
    schemaVersion: 1,
    templateName: name,
    templateType,
    version: 1,
    page: { size: "A4", orientation: "portrait", width: A4.width, height: A4.height },
    settings: { defaultFont: "Helvetica", signatureRequired: true, allowDateOverride: false, fileNamePattern: "{CMRNumber}.pdf" },
    fonts: [],
    pages: [emptyPage("Page 1")],
  };
}

/** Factory for a new element of a given type at (x, y). Runs through the schema so all defaults are filled. */
export function createElement(type: ElementType, x: number, y: number, extra: Record<string, unknown> = {}): TemplateElement {
  const base = { id: newId(), x, y, rotation: 0, opacity: 1, locked: false, hidden: false };
  let raw: Record<string, unknown>;
  switch (type) {
    case "text":
      raw = { ...base, type, text: "Text", width: 140, height: 18 };
      break;
    case "field":
      raw = { ...base, type, fieldName: "Field", width: 140, height: 18 };
      break;
    case "image":
      raw = { ...base, type, assetId: null, width: 100, height: 60 };
      break;
    case "signature":
      raw = { ...base, type, fieldName: "Signature", width: 180, height: 40 };
      break;
    case "checkbox":
      raw = { ...base, type, width: 10, height: 10 };
      break;
    case "line":
      raw = { ...base, type, width: 200, height: 0 };
      break;
    case "rect":
      raw = { ...base, type, width: 160, height: 60 };
      break;
    case "table":
      raw = {
        ...base,
        type,
        width: 300,
        height: 18 * 3,
        columns: [
          { width: 100, header: "Column 1" },
          { width: 100, header: "Column 2" },
          { width: 100, header: "Column 3" },
        ],
        rows: [
          [{ text: "" }, { text: "" }, { text: "" }],
          [{ text: "" }, { text: "" }, { text: "" }],
        ],
      };
      break;
  }
  return ElementSchema.parse({ ...raw, ...extra });
}
