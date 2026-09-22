import { route, json } from "@/lib/api/handler";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { deleteFieldDefinition, updateFieldDefinition } from "@/lib/db/repositories/fields";
import { z } from "zod";

const updateFieldSchema = z.object({
  display_name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  data_type: z.enum(["TEXT", "MULTILINE", "NUMBER", "DATE", "TIME", "DATETIME", "BOOLEAN", "DROPDOWN", "IMAGE", "SIGNATURE"]).optional(),
  source_type: z.enum(["D365FO", "MANUAL", "SYSTEM", "STATIC", "SIGNATURE", "IMAGE", "CUSTOM"]).optional(),
  category: z.string().optional(),
  required: z.boolean().optional(),
  read_only: z.boolean().optional(),
  allow_override: z.boolean().optional(),
  default_value: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  active: z.boolean().optional(),
  sort_order: z.number().optional(),
});

export const PATCH = route(async (req, { params }) => {
  const session = await requireSession();
  requireRole(session, ["Admin"]);

  const { id } = await params;
  const body = await req.json();
  const parsed = updateFieldSchema.parse(body);

  const updated = await updateFieldDefinition(id, parsed);
  return json({ ok: true, field: updated });
});

export const DELETE = route(async (req, { params }) => {
  const session = await requireSession();
  requireRole(session, ["Admin"]);

  const { id } = await params;
  await deleteFieldDefinition(id);
  return json({ ok: true });
});
