import { route, json } from "@/lib/api/handler";
import { requireCapability, requireRole, requireSession } from "@/lib/auth/guards";
import { createFieldDefinition, listFieldDefinitions } from "@/lib/db/repositories/fields";
import { z } from "zod";

const createFieldSchema = z.object({
  field_name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/, "Field name must start with letter and contain only alphanumeric/underscores"),
  display_name: z.string().min(1, "Display name is required"),
  description: z.string().optional().nullable(),
  data_type: z.enum(["TEXT", "MULTILINE", "NUMBER", "DATE", "TIME", "DATETIME", "BOOLEAN", "DROPDOWN", "IMAGE", "SIGNATURE"]),
  source_type: z.enum(["D365FO", "MANUAL", "SYSTEM", "STATIC", "SIGNATURE", "IMAGE", "CUSTOM"]),
  category: z.string().default("Custom Fields"),
  required: z.boolean().default(false),
  read_only: z.boolean().default(false),
  allow_override: z.boolean().default(false),
  default_value: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  sort_order: z.number().default(100),
});

export const GET = route(async (req) => {
  await requireCapability("viewTemplates");
  const includeInactive = req.nextUrl.searchParams.get("all") === "1";
  return json({ fields: await listFieldDefinitions({ includeInactive }) });
});

export const POST = route(async (req) => {
  const session = await requireSession();
  requireRole(session, ["Admin"]);

  const body = await req.json();
  const parsed = createFieldSchema.parse(body);

  const field = await createFieldDefinition({
    ...parsed,
    description: parsed.description ?? null,
    default_value: parsed.default_value ?? null,
    unit: parsed.unit ?? null,
    validation_json: {},
    config_json: {},
    active: true,
  });

  return json({ ok: true, field }, { status: 201 });
});
