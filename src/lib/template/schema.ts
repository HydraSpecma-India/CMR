import { z } from "zod";

/**
 * Template JSON schema (see docs/03-TEMPLATE-SCHEMA.md).
 * Coordinates are PDF points with a top-left origin. Client-safe module.
 */

export const A4 = { width: 595.28, height: 841.89 } as const;

export const FontFamilySchema = z.enum(["Helvetica", "Times-Roman", "Courier"]).or(z.string().min(1));

export const TextStyleSchema = z.object({
  fontFamily: FontFamilySchema.default("Helvetica"),
  fontSize: z.number().min(4).max(96).default(10),
  bold: z.boolean().default(false),
  italic: z.boolean().default(false),
  underline: z.boolean().default(false),
  color: z.string().default("#000000"),
  align: z.enum(["left", "center", "right"]).default("left"),
  valign: z.enum(["top", "middle", "bottom"]).default("middle"),
  lineHeight: z.number().min(0.8).max(3).default(1.2),
  letterSpacing: z.number().default(0),
  padding: z.number().min(0).default(2),
  wrap: z.boolean().default(true),
  overflow: z.enum(["shrink", "clip", "grow"]).default("shrink"),
});
export type TextStyle = z.infer<typeof TextStyleSchema>;

export const StrokeSchema = z.object({
  color: z.string().default("#000000"),
  width: z.number().min(0).max(20).default(0.75),
  dash: z.array(z.number()).optional(),
});

export const BorderSchema = z.object({
  color: z.string().default("#000000"),
  width: z.number().min(0).max(10).default(0),
});

/** Element-level overrides of a field definition. */
export const BindingSchema = z.object({
  required: z.boolean().optional(),
  readOnly: z.boolean().optional(),
  allowOverride: z.boolean().optional(),
  defaultValue: z.string().optional(),
  format: z.string().optional(),
  placeholder: z.string().optional(),
  label: z.string().optional(),
  /** designer-only: show label text on the canvas instead of the placeholder */
  showLabel: z.boolean().optional(),
});
export type Binding = z.infer<typeof BindingSchema>;

const BaseElement = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().min(0),
  height: z.number().min(0),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  locked: z.boolean().default(false),
  hidden: z.boolean().default(false),
});

export const TextElementSchema = BaseElement.extend({
  type: z.literal("text"),
  text: z.string().default("Text"),
  style: TextStyleSchema.prefault({}),
  border: BorderSchema.optional(),
  background: z.string().nullable().optional(),
});

export const FieldElementSchema = BaseElement.extend({
  type: z.literal("field"),
  fieldName: z.string().min(1),
  style: TextStyleSchema.prefault({}),
  binding: BindingSchema.prefault({}),
  border: BorderSchema.optional(),
  background: z.string().nullable().optional(),
});

export const ImageElementSchema = BaseElement.extend({
  type: z.literal("image"),
  assetId: z.string().nullable().default(null),
  /** optional: bind to an IMAGE-typed field instead of a fixed asset */
  fieldName: z.string().optional(),
  fit: z.enum(["contain", "cover", "stretch"]).default("contain"),
  crop: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(),
  border: BorderSchema.optional(),
});

export const SignatureElementSchema = BaseElement.extend({
  type: z.literal("signature"),
  fieldName: z.string().default("Signature"),
  binding: BindingSchema.prefault({}),
  border: BorderSchema.optional(),
});

export const CheckboxElementSchema = BaseElement.extend({
  type: z.literal("checkbox"),
  fieldName: z.string().optional(),
  checked: z.boolean().default(false),
  binding: BindingSchema.prefault({}),
  style: z.object({ color: z.string().default("#000000"), lineWidth: z.number().default(1) }).prefault({}),
});

export const LineElementSchema = BaseElement.extend({
  type: z.literal("line"),
  stroke: StrokeSchema.prefault({}),
});

export const RectElementSchema = BaseElement.extend({
  type: z.literal("rect"),
  stroke: StrokeSchema.prefault({}),
  fill: z.string().nullable().default(null),
  cornerRadius: z.number().min(0).default(0),
});

export const TableCellSchema = z.object({
  text: z.string().optional(),
  fieldName: z.string().optional(),
  style: TextStyleSchema.partial().optional(),
  colSpan: z.number().int().min(1).optional(),
});

export const TableElementSchema = BaseElement.extend({
  type: z.literal("table"),
  columns: z.array(z.object({ width: z.number().min(5), header: z.string().default("") })).min(1),
  rows: z.array(z.array(TableCellSchema)).default([]),
  rowHeight: z.number().min(6).default(18),
  headerHeight: z.number().min(6).default(18),
  showHeader: z.boolean().default(true),
  style: TextStyleSchema.prefault({}),
  headerStyle: TextStyleSchema.partial().extend({ fill: z.string().optional() }).prefault({ bold: true, fill: "#f2f2f2" }),
  border: StrokeSchema.prefault({ width: 0.5 }),
});

export const ElementSchema = z.discriminatedUnion("type", [
  TextElementSchema,
  FieldElementSchema,
  ImageElementSchema,
  SignatureElementSchema,
  CheckboxElementSchema,
  LineElementSchema,
  RectElementSchema,
  TableElementSchema,
]);
export type TemplateElement = z.infer<typeof ElementSchema>;
export type ElementType = TemplateElement["type"];

export const BackgroundSchema = z.object({
  assetId: z.string(),
  pageIndex: z.number().int().min(0).default(0),
  opacity: z.number().min(0).max(1).default(1),
});

export const PageSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  background: BackgroundSchema.nullable().default(null),
  elements: z.array(ElementSchema).default([]),
});
export type TemplatePage = z.infer<typeof PageSchema>;

export const TemplateSettingsSchema = z.object({
  defaultFont: FontFamilySchema.default("Helvetica"),
  signatureRequired: z.boolean().default(true),
  allowDateOverride: z.boolean().default(false),
  fileNamePattern: z.string().default("{CMRNumber}.pdf"),
});

export const TemplateSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  templateName: z.string().min(1),
  templateType: z.string().min(1).default("CMR"),
  version: z.number().int().min(1).default(1),
  revision: z.string().optional(),
  page: z
    .object({
      size: z.enum(["A4", "Letter", "Custom"]).default("A4"),
      orientation: z.enum(["portrait", "landscape"]).default("portrait"),
      width: z.number().positive().default(A4.width),
      height: z.number().positive().default(A4.height),
    })
    .prefault({}),
  settings: TemplateSettingsSchema.prefault({}),
  fonts: z.array(z.object({ family: z.string(), assetId: z.string().optional() })).default([]),
  pages: z.array(PageSchema).min(1),
});
export type TemplateJson = z.infer<typeof TemplateSchema>;

/** Parses + fills defaults. Throws ZodError with issues on invalid input. */
export function parseTemplate(input: unknown): TemplateJson {
  return TemplateSchema.parse(input);
}

export function safeParseTemplate(input: unknown) {
  return TemplateSchema.safeParse(input);
}

/** Collect every fieldName referenced anywhere in the template (fields, signatures, checkboxes, table cells, image bindings). */
export function collectFieldNames(t: TemplateJson): string[] {
  const names = new Set<string>();
  for (const page of t.pages) {
    for (const el of page.elements) {
      if ("fieldName" in el && el.fieldName) names.add(el.fieldName);
      if (el.type === "table") for (const row of el.rows) for (const cell of row) if (cell.fieldName) names.add(cell.fieldName);
    }
  }
  return [...names];
}
