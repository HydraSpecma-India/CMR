# Template JSON schema

Canonical definition: `src/lib/template/schema.ts` (zod). Validated on every save and before every render. Coordinates are **PDF points, top-left origin**, A4 = 595.28 × 841.89 (the uploaded HydraSpecma CMR is 595.56 × 842.04 — page size is taken from the background when one is set).

```jsonc
{
  "schemaVersion": 1,
  "templateName": "HydraSpecma CMR 1070.0049",
  "templateType": "CMR",
  "version": 2,
  "revision": "Rev 02",
  "page": { "size": "A4", "orientation": "portrait", "width": 595.28, "height": 841.89 },
  "settings": {
    "defaultFont": "Helvetica",
    "signatureRequired": true,
    "allowDateOverride": false,
    "fileNamePattern": "{CMRNumber}.pdf"
  },
  "fonts": [ { "family": "Helvetica" }, { "family": "Arial", "assetId": "…ttf asset…" } ],
  "pages": [
    {
      "id": "page-1",
      "background": { "assetId": "a1f…", "pageIndex": 0, "opacity": 1 },   // page N of the uploaded PDF, or an image asset
      "elements": [
        { "id": "el-001", "type": "field", "fieldName": "CustomerPO", "x": 374, "y": 358, "width": 175, "height": 16,
          "style": { "fontFamily": "Helvetica", "fontSize": 10, "align": "left", "valign": "middle" } },
        { "id": "el-002", "type": "field", "fieldName": "TopLevelSerialNumber", "x": 430, "y": 379, "width": 120, "height": 16,
          "style": { "fontSize": 10 }, "binding": { "required": true, "readOnly": false } },
        { "id": "el-003", "type": "text", "text": "CERTIFICATE OF CONFORMITY", "x": 62, "y": 150, "width": 470, "height": 22,
          "style": { "fontSize": 14, "bold": true, "align": "center" } },
        { "id": "el-004", "type": "image", "assetId": "logo-asset", "x": 62, "y": 20, "width": 90, "height": 34, "fit": "contain", "opacity": 1 },
        { "id": "el-005", "type": "signature", "fieldName": "Signature", "x": 320, "y": 700, "width": 220, "height": 30 },
        { "id": "el-006", "type": "line", "x": 62, "y": 250, "width": 470, "height": 0, "stroke": { "color": "#000000", "width": 0.75 } },
        { "id": "el-007", "type": "rect", "x": 62, "y": 300, "width": 470, "height": 60, "stroke": { "color": "#000", "width": 0.75 }, "fill": null },
        { "id": "el-008", "type": "table", "x": 62, "y": 320, "width": 470,
          "columns": [ { "width": 160, "header": "Measure" }, { "width": 155, "header": "Result" }, { "width": 155, "header": "Signature" } ],
          "rows": [ [ { "text": "Flatness 1" }, { "fieldName": "Flatness1" }, { "fieldName": "InspectorInitials" } ] ],
          "rowHeight": 18, "headerStyle": { "bold": true, "fill": "#f2f2f2" }, "border": { "color": "#000", "width": 0.5 } },
        { "id": "el-009", "type": "checkbox", "fieldName": "PipeHeliumTest", "x": 62, "y": 640, "width": 10, "height": 10 }
      ]
    },
    { "id": "page-2", "background": { "assetId": "a1f…", "pageIndex": 2 }, "elements": [ /* Serial no. on appendix */ ] }
  ]
}
```

## Element types

| `type` | purpose | value source |
|---|---|---|
| `text` | static text, editable in designer | inline `text` |
| `field` | any configured field (D365FO/manual/system/custom/date/time/datetime/number/dropdown/multiline) | `fieldName` → `field_definitions` |
| `image` | logo / product image / other | `assetId` |
| `signature` | signature image box | `fieldName` (data_type SIGNATURE) |
| `checkbox` | boolean box (☐/☑) | `fieldName` (data_type BOOLEAN) or static `checked` |
| `line` | horizontal/vertical/diagonal (`x2,y2` optional) | – |
| `rect` | box with stroke/fill | – |
| `table` | grid; cells may hold text or `fieldName` | per cell |

Common properties on every element: `id, type, x, y, width, height, rotation (deg), opacity, locked, hidden, name`.
Text-bearing elements share `style`: `fontFamily, fontSize, bold, italic, underline, color, align (left|center|right), valign (top|middle|bottom), lineHeight, letterSpacing, padding, wrap (true|false), overflow (shrink|clip|grow)`, plus optional `border {color,width}` and `background`.
Field elements add `binding`: `{ required?, readOnly?, allowOverride?, defaultValue?, format?, placeholder?, label? }` — element-level overrides of the field definition (definition is the default; template can tighten).

## Why `fieldName` and not a field id
Templates reference fields by stable technical name, so a template exported to another environment (or a future document type) still resolves. Renaming a field is blocked while any published version references it.

## Rendering contract
`render(templateJson, dataContext, assets) → PDF bytes` where `dataContext = Record<fieldName, ResolvedValue>` and `ResolvedValue = { kind: 'text'|'number'|'date'|'boolean'|'image', value, formatted }`. The renderer walks `pages[].elements[]` and dispatches on `element.type` only.
